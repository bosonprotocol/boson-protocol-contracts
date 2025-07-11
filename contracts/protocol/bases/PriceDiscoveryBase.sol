// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import "../../domain/BosonConstants.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";
import { IWrappedNative } from "../../interfaces/IWrappedNative.sol";
import { IBosonVoucher } from "../../interfaces/clients/IBosonVoucher.sol";
import { IBosonPriceDiscovery } from "../../interfaces/clients/IBosonPriceDiscovery.sol";
import { ProtocolBase } from "./../bases/ProtocolBase.sol";

/**
 * @title PriceDiscoveryBase
 *
 * @dev Provides methods for fulfiling orders on external price discovery contracts.
 */
contract PriceDiscoveryBase is ProtocolBase {
    IWrappedNative internal immutable wNative;

    /**
     * @notice
     * For offers with native exchange token, it is expected that the price discovery contracts will
     * operate with wrapped native token. Set the address of the wrapped native token in the constructor.
     *
     * @param _wNative - the address of the wrapped native token
     */
    //solhint-disable-next-line
    constructor(address _wNative) {
        if (_wNative == address(0)) revert InvalidAddress();
        wNative = IWrappedNative(_wNative);
    }

    /**
     * @notice Fulfils an order on an external contract.
     *
     * If the owner is price discovery contract, the protocol cannot act as an intermediary in the exchange,
     * and sellers must use Wrapped's contract. Wrappers handle ask and bid orders in the same manner.
     *
     * See descriptions of `fulfilAskOrder`, `fulfilBidOrder` and handleWrapper for more details.
     *
     * @param _tokenId - the id of the token. Accepts whatever token is sent by price discovery contract when this value is zero.
     * @param _offer - the fully populated BosonTypes.Offer struct
     * @param _priceDiscovery - the fully populated BosonTypes.PriceDiscovery struct
     * @param _seller - the seller's address
     * @param _buyer - the buyer's address (caller can commit on behalf of a buyer)
     * @return actualPrice - the actual price of the order
     */
    function fulfilOrder(
        uint256 _tokenId,
        Offer storage _offer,
        PriceDiscovery calldata _priceDiscovery,
        address _seller,
        address _buyer
    ) internal priceDiscoveryNotPaused returns (uint256 actualPrice) {
        // Make sure caller provided price discovery data
        if (_priceDiscovery.priceDiscoveryContract == address(0) || _priceDiscovery.priceDiscoveryData.length == 0) {
            revert InvalidPriceDiscovery();
        }

        // If not dealing with wrapper, voucher is transferred using the conduit which must not be zero address
        if (_priceDiscovery.side != Side.Wrapper && _priceDiscovery.conduit == address(0))
            revert InvalidConduitAddress();

        IBosonVoucher bosonVoucher = IBosonVoucher(
            getCloneAddress(protocolLookups(), _offer.sellerId, _offer.collectionIndex)
        );

        // Set incoming voucher clone address
        protocolStatus().incomingVoucherCloneAddress = address(bosonVoucher);
        if (_priceDiscovery.side == Side.Ask) {
            actualPrice = fulfilAskOrder(
                _tokenId,
                _offer.id,
                _offer.exchangeToken,
                _priceDiscovery,
                _seller,
                _buyer,
                bosonVoucher
            );
        } else if (_priceDiscovery.side == Side.Bid) {
            actualPrice = fulfilBidOrder(_tokenId, _offer.exchangeToken, _priceDiscovery, _seller, bosonVoucher);
        } else {
            // _priceDiscovery.side == Side.Wrapper
            // Handle wrapper voucher, there is no difference between ask and bid
            actualPrice = handleWrapper(_tokenId, _offer.exchangeToken, _priceDiscovery, bosonVoucher);
        }

        // Price must be high enough to cover cancellation penalty in case of buyer's cancellation
        if (actualPrice < _offer.buyerCancelPenalty) {
            revert PriceDoesNotCoverPenalty();
        }
    }

    /**
     * @notice Fulfils an ask order on external contract.
     *
     * Reverts if:
     * - Offer price is in native token and caller does not send enough
     * - Offer price is in some ERC20 token and caller also sends native currency
     * - Calling transferFrom on token fails for some reason (e.g. protocol is not approved to transfer)
     * - Call to price discovery contract fails
     * - Transfer of voucher to the buyer fails for some reason (e.g. buyer is contract that doesn't accept voucher)
     * - Token id sent to buyer and token id set by the caller don't match (if caller has provided the token id)
     * - Token id sent to buyer and it does not belong to the offer, set by the caller (if caller has not provided the token id)
     *
     * @param _tokenId - the id of the token (can be 0 if unknown)
     * @param _offerId - the id of the offer
     * @param _exchangeToken - the address of the exchange contract
     * @param _priceDiscovery - the fully populated BosonTypes.PriceDiscovery struct
     * @param _seller - the seller's address
     * @param _buyer - the buyer's address (caller can commit on behalf of a buyer)
     * @param _bosonVoucher - the boson voucher contract
     * @return actualPrice - the actual price of the order
     */
    function fulfilAskOrder(
        uint256 _tokenId,
        uint256 _offerId,
        address _exchangeToken,
        PriceDiscovery calldata _priceDiscovery,
        address _seller,
        address _buyer,
        IBosonVoucher _bosonVoucher
    ) internal returns (uint256 actualPrice) {
        // Cache price discovery contract address
        address bosonPriceDiscovery = protocolAddresses().priceDiscovery;

        // Transfer buyers funds to protocol and forward them to price discovery contract
        if (_exchangeToken == address(0)) _exchangeToken = address(wNative);
        validateIncomingPayment(_exchangeToken, _priceDiscovery.price);
        transferFundsOut(_exchangeToken, payable(bosonPriceDiscovery), _priceDiscovery.price);

        actualPrice = IBosonPriceDiscovery(bosonPriceDiscovery).fulfilAskOrder(
            _exchangeToken,
            _priceDiscovery,
            _bosonVoucher,
            payable(_msgSender())
        );

        _tokenId = getAndVerifyTokenId(_tokenId);

        // Make sure that the exchange is part of the correct offer
        if (_tokenId >> 128 != _offerId) revert TokenIdMismatch();

        // Make sure that the price discovery contract has transferred the voucher to the protocol
        if (_bosonVoucher.ownerOf(_tokenId) != bosonPriceDiscovery) revert VoucherNotReceived();

        // Transfer voucher to buyer
        _bosonVoucher.safeTransferFrom(bosonPriceDiscovery, _buyer, _tokenId);

        // Price discovery should send funds to the seller.
        // The seller must approve the protocol to transfer the funds before the order is fulfilled.
        transferFundsIn(_exchangeToken, _seller, actualPrice);
    }

    /**
     * @notice Fulfils a bid order on external contract.
     *
     * Reverts if:
     * - Token id not set by the caller
     * - Call to price discovery contract fails
     * - Token id sent to buyer and token id set by the caller don't match
     *
     * @param _exchangeToken - the address of the exchange token
     * @param _priceDiscovery - the fully populated BosonTypes.PriceDiscovery struct
     * @param _seller - the seller's address
     * @param _bosonVoucher - the boson voucher contract
     * @return actualPrice - the actual price of the order
     */
    function fulfilBidOrder(
        uint256 _tokenId,
        address _exchangeToken,
        PriceDiscovery calldata _priceDiscovery,
        address _seller,
        IBosonVoucher _bosonVoucher
    ) internal returns (uint256 actualPrice) {
        if (_tokenId == 0) revert TokenIdMandatory();

        address sender = _msgSender();
        if (_seller != sender) revert NotVoucherHolder();

        // Cache price discovery contract address
        address bosonPriceDiscovery = protocolAddresses().priceDiscovery;

        // Transfer seller's voucher to protocol
        // Don't need to use safe transfer from, since that protocol can handle the voucher
        _bosonVoucher.transferFrom(_seller, bosonPriceDiscovery, _tokenId);

        actualPrice = IBosonPriceDiscovery(bosonPriceDiscovery).fulfilBidOrder{ value: msg.value }(
            _tokenId,
            _exchangeToken,
            _priceDiscovery,
            _seller,
            _bosonVoucher
        );

        // Verify that token id provided by caller matches the token id that the price discovery contract has sent to buyer
        getAndVerifyTokenId(_tokenId);
    }

    /**
     * @notice Call `unwrap` (or equivalent) function on the price discovery contract.
     *
     * Reverts if:
     * - Token id not set by the caller
     * - The wrapper does not own the voucher
     * - Token id sent to buyer and token id set by the caller don't match
     *
     * @param _tokenId - the id of the token
     * @param _exchangeToken - the address of the exchange contract
     * @param _priceDiscovery - the fully populated BosonTypes.PriceDiscovery struct
     * @param _bosonVoucher - the boson voucher contract
     * @return actualPrice - the actual price of the order
     */
    function handleWrapper(
        uint256 _tokenId,
        address _exchangeToken,
        PriceDiscovery calldata _priceDiscovery,
        IBosonVoucher _bosonVoucher
    ) internal returns (uint256 actualPrice) {
        if (_tokenId == 0) revert TokenIdMandatory();

        // If price discovery contract does not own the voucher, it cannot be classified as a wrapper
        address owner = _bosonVoucher.ownerOf(_tokenId);
        if (owner != _priceDiscovery.priceDiscoveryContract) revert NotVoucherHolder();

        // Cache price discovery contract address
        address bosonPriceDiscovery = protocolAddresses().priceDiscovery;

        actualPrice = IBosonPriceDiscovery(bosonPriceDiscovery).handleWrapper{ value: msg.value }(
            _exchangeToken,
            _priceDiscovery
        );

        // Verify that token id provided by caller matches the token id that the price discovery contract has sent to buyer
        getAndVerifyTokenId(_tokenId);
    }

    /*
     * @notice Returns the token id that the price discovery contract has sent to the protocol or buyer
     *
     * Reverts if:
     * - Caller has provided token id, but it does not match the token id that the price discovery contract has sent to the protocol
     *
     * @param _tokenId - the token id that the caller has provided
     * @return tokenId - the token id that the price discovery contract has sent to the protocol
     */
    function getAndVerifyTokenId(uint256 _tokenId) internal view returns (uint256) {
        // Store the information about incoming voucher
        ProtocolLib.ProtocolStatus storage ps = protocolStatus();

        // If caller has provided token id, it must match the token id that the price discovery send to the protocol
        if (_tokenId != 0) {
            if (_tokenId != ps.incomingVoucherId) revert TokenIdMismatch();
        } else {
            // If caller has not provided token id, use the one stored in onPremintedVoucherTransfer function
            _tokenId = ps.incomingVoucherId;
        }

        // Token id cannot be zero at this point
        if (_tokenId == 0) revert TokenIdNotSet();

        return _tokenId;
    }

    /*
     * @notice Resets value of incoming voucher id and incoming voucher clone address to 0
     * This is called at the end of the methods that interacts with price discovery contracts
     *
     */
    function clearPriceDiscoveryStorage() internal {
        ProtocolLib.ProtocolStatus storage ps = protocolStatus();
        delete ps.incomingVoucherId;
        delete ps.incomingVoucherCloneAddress;
    }
}
