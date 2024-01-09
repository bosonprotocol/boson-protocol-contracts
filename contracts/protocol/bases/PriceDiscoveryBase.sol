// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import "../../domain/BosonConstants.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IWrappedNative } from "../../interfaces/IWrappedNative.sol";
import { IBosonVoucher } from "../../interfaces/clients/IBosonVoucher.sol";
import { ProtocolBase } from "./../bases/ProtocolBase.sol";
import { FundsLib } from "../libs/FundsLib.sol";
import { Address } from "@openzeppelin/contracts/utils/Address.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title PriceDiscoveryBase
 *
 * @dev Provides methods for fulfiling orders on external price discovery contracts.
 */
contract PriceDiscoveryBase is ProtocolBase {
    using Address for address;
    using SafeERC20 for IERC20;

    IWrappedNative internal immutable wNative;

    /**
     * @notice
     * For offers with native exchange token, it is expected the the price discovery contracts will
     * operate with wrapped native token. Set the address of the wrapped native token in the constructor.
     *
     * @param _wNative - the address of the wrapped native token
     */
    //solhint-disable-next-line
    constructor(address _wNative) {
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
    ) internal returns (uint256 actualPrice) {
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
            return fulfilAskOrder(_tokenId, _offer.exchangeToken, _priceDiscovery, _buyer, bosonVoucher);
        } else if (_priceDiscovery.side == Side.Bid) {
            return fulfilBidOrder(_tokenId, _offer.exchangeToken, _priceDiscovery, _seller, bosonVoucher);
        } else {
            // _priceDiscovery.side == Side.Wrapper
            // Handle wrapper voucher, there is no difference between ask and bid
            return handleWrapper(_tokenId, _offer.exchangeToken, _priceDiscovery, bosonVoucher);
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
     * - Received amount is greater from price set in price discovery
     * - Protocol does not receive the voucher
     * - Transfer of voucher to the buyer fails for some reason (e.g. buyer is contract that doesn't accept voucher)
     * - New voucher owner is not buyer wallet
     * - Token id sent to buyer and token id set by the caller don't match (if caller has provided token id)
     *
     * @param _tokenId - the id of the token
     * @param _exchangeToken - the address of the exchange contract
     * @param _priceDiscovery - the fully populated BosonTypes.PriceDiscovery struct
     * @param _buyer - the buyer's address (caller can commit on behalf of a buyer)
     * @param _bosonVoucher - the boson voucher contract
     * @return actualPrice - the actual price of the order
     */
    function fulfilAskOrder(
        uint256 _tokenId,
        address _exchangeToken,
        PriceDiscovery calldata _priceDiscovery,
        address _buyer,
        IBosonVoucher _bosonVoucher
    ) internal returns (uint256 actualPrice) {
        // Transfer buyers funds to protocol
        FundsLib.validateIncomingPayment(_exchangeToken, _priceDiscovery.price);

        // If token is ERC20, approve price discovery contract to transfer protocol funds
        if (_exchangeToken != address(0)) {
            IERC20(_exchangeToken).forceApprove(_priceDiscovery.conduit, _priceDiscovery.price);
        }

        uint256 protocolBalanceBefore = getBalance(_exchangeToken, address(this));

        // Call the price discovery contract
        _priceDiscovery.priceDiscoveryContract.functionCallWithValue(_priceDiscovery.priceDiscoveryData, msg.value);

        uint256 protocolBalanceAfter = getBalance(_exchangeToken, address(this));
        if (protocolBalanceBefore < protocolBalanceAfter) revert NegativePriceNotAllowed();
        actualPrice = protocolBalanceBefore - protocolBalanceAfter;

        // If token is ERC20, reset approval
        if (_exchangeToken != address(0)) {
            IERC20(_exchangeToken).forceApprove(address(_priceDiscovery.conduit), 0);
        }

        _tokenId = getAndVerifyTokenId(_tokenId);

        {
            // Make sure that the price discovery contract has transferred the voucher to the protocol
            if (_bosonVoucher.ownerOf(_tokenId) != address(this)) revert VoucherNotReceived();

            // Transfer voucher to buyer
            _bosonVoucher.safeTransferFrom(address(this), _buyer, _tokenId);
        }

        uint256 overchargedAmount = _priceDiscovery.price - actualPrice;

        if (overchargedAmount > 0) {
            // Return the surplus to caller
            FundsLib.transferFundsFromProtocol(_exchangeToken, payable(msgSender()), overchargedAmount);
        }
    }

    /**
     * @notice Fulfils a bid order on external contract.
     *
     * Reverts if:
     * - Token id not set by the caller
     * - Calling transferFrom on token fails for some reason (e.g. protocol is not approved to transfer)
     * - Transfer of voucher to the buyer fails for some reason (e.g. buyer is contract that doesn't accept voucher)
     * - Received ERC20 token amount differs from the expected value
     * - Call to price discovery contract fails
     * - Protocol balance change after price discovery call is lower than the expected price
     * - Reseller did not approve protocol to transfer exchange token in escrow
     * - New voucher owner is not buyer wallet
     * - Token id sent to buyer and token id set by the caller don't match
     *
     * @param _tokenId - the id of the token
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

        address sender = msgSender();
        if (_seller != sender) revert NotVoucherHolder();

        // Transfer seller's voucher to protocol
        // Don't need to use safe transfer from, since that protocol can handle the voucher
        _bosonVoucher.transferFrom(sender, address(this), _tokenId);

        // Approve conduit to transfer voucher. There is no need to reset approval afterwards, since protocol is not the voucher owner anymore
        _bosonVoucher.approve(_priceDiscovery.conduit, _tokenId);
        if (_exchangeToken == address(0)) _exchangeToken = address(wNative);

        // Track native balance just in case if seller sends some native currency or price discovery contract does
        // This is the balance that protocol had, before commit to offer was called
        uint256 protocolNativeBalanceBefore = getBalance(address(0), address(this)) - msg.value;

        // Get protocol balance before calling price discovery contract
        uint256 protocolBalanceBefore = getBalance(_exchangeToken, address(this));

        // Call the price discovery contract
        _priceDiscovery.priceDiscoveryContract.functionCallWithValue(_priceDiscovery.priceDiscoveryData, msg.value);

        // Get protocol balance after calling price discovery contract
        uint256 protocolBalanceAfter = getBalance(_exchangeToken, address(this));

        // Check the native balance and return the surplus to seller
        uint256 protocolNativeBalanceAfter = getBalance(address(0), address(this));
        if (protocolNativeBalanceAfter > protocolNativeBalanceBefore) {
            // Return the surplus to seller
            FundsLib.transferFundsFromProtocol(
                address(0),
                payable(sender),
                protocolNativeBalanceAfter - protocolNativeBalanceBefore
            );
        }

        // Calculate actual price
        if (protocolBalanceAfter < protocolBalanceBefore) revert NegativePriceNotAllowed();
        actualPrice = protocolBalanceAfter - protocolBalanceBefore;

        // Make sure that balance change is at least the expected price
        if (actualPrice < _priceDiscovery.price) revert InsufficientValueReceived();

        // Verify that token id provided by caller matches the token id that the price discovery contract has sent to buyer
        getAndVerifyTokenId(_tokenId);
    }

    /*
     * @notice Call `unwrap` (or equivalent) function on the price discovery contract.
     *
     * Reverts if:
     * - Token id not set by the caller
     * - Protocol balance doesn't increase by the expected amount.
     *   Balance change must be equal to the price set by the caller
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

        // Check balance before calling wrapper
        bool isNative = _exchangeToken == address(0);
        if (isNative) _exchangeToken = address(wNative);
        uint256 protocolBalanceBefore = getBalance(_exchangeToken, address(this));

        // Track native balance just in case if seller sends some native currency.
        // All native currency is forwarded to the wrapper, which should not return any back.
        // If it does, we revert later in the code.
        uint256 protocolNativeBalanceBefore = getBalance(address(0), address(this)) - msg.value;

        // Call the price discovery contract
        _priceDiscovery.priceDiscoveryContract.functionCallWithValue(_priceDiscovery.priceDiscoveryData, msg.value);

        // Check the native balance and revert if there is a surplus
        uint256 protocolNativeBalanceAfter = getBalance(address(0), address(this));
        require(protocolNativeBalanceAfter == protocolNativeBalanceBefore);

        // Check balance after the price discovery call
        uint256 protocolBalanceAfter = getBalance(_exchangeToken, address(this));

        // Verify that actual price is within the expected range
        if (protocolBalanceAfter < protocolBalanceBefore) revert NegativePriceNotAllowed();
        actualPrice = protocolBalanceAfter - protocolBalanceBefore;

        // when working with wrappers, price is already known, so the caller should set it exactly
        // If protocol receive more than expected, it does not return the surplus to the caller
        if (actualPrice != _priceDiscovery.price) revert PriceTooLow();

        // Verify that token id provided by caller matches the token id that the price discovery contract has sent to buyer
        getAndVerifyTokenId(_tokenId);
    }

    /**
     * @notice Returns the balance of the protocol for the given token address
     *
     * @param _tokenAddress - the address of the token to check the balance for
     * @return balance - the balance of the protocol for the given token address
     */
    function getBalance(address _tokenAddress, address entity) internal view returns (uint256) {
        return _tokenAddress == address(0) ? entity.balance : IERC20(_tokenAddress).balanceOf(entity);
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
