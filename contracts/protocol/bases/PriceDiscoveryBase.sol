// SPDX-License-Identifier: MIT
pragma solidity 0.8.21;

import "../../domain/BosonConstants.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";
import { IERC20 } from "../../interfaces/IERC20.sol";
import { IWrappedNative } from "../../interfaces/IWrappedNative.sol";
import { IBosonVoucher } from "../../interfaces/clients/IBosonVoucher.sol";
import { ProtocolBase } from "./../bases/ProtocolBase.sol";
import { FundsLib } from "../libs/FundsLib.sol";
import { Address } from "@openzeppelin/contracts/utils/Address.sol";

/**
 * @title PriceDiscoveryBase
 *
 * @dev Provides methods for fulfiling orders on external price discovery contracts.
 */
contract PriceDiscoveryBase is ProtocolBase {
    using Address for address;

    IWrappedNative public immutable wNative;
    uint256 private immutable EXCHANGE_ID_2_2_0; // solhint-disable-line

    /**
     * @notice
     * For offers with native exchange token, it is expected the the price discovery contracts will
     * operate with wrapped native token. Set the address of the wrapped native token in the constructor.
     *
     * After v2.2.0, token ids are derived from offerId and exchangeId.
     * EXCHANGE_ID_2_2_0 is the first exchange id to use for 2.2.0.
     * Set EXCHANGE_ID_2_2_0 in the constructor.
     *
     * @param _wNative - the address of the wrapped native token
     * @param _firstExchangeId2_2_0 - the first exchange id to use for 2.2.0
     */
    //solhint-disable-next-line
    constructor(address _wNative, uint256 _firstExchangeId2_2_0) {
        wNative = IWrappedNative(_wNative);
        EXCHANGE_ID_2_2_0 = _firstExchangeId2_2_0;
    }

    /**
     * @notice @notice Fulfils an order on an external contract. Helper function passes data to either ask or bid orders.
     *
     * See descriptions of `fulfilBuyOrder` and `fulfilSellOrder` for more details.
     *
     * @param _exchangeId - the id of the exchange to commit to
     * @param _exchangeToken - the address of the ERC20 token used for the exchange (zero address for native)
     * @param _priceDiscovery - the fully populated BosonTypes.PriceDiscovery struct
     * @param _buyer - the buyer's address (caller can commit on behalf of a buyer)
     * @param _offer - the pointer to offer struct, corresponding to the exchange
     * @return actualPrice - the actual price of the order
     */
    function fulFilOrder(
        uint256 _exchangeId,
        address _exchangeToken,
        PriceDiscovery calldata _priceDiscovery,
        address _buyer,
        Offer storage _offer
    ) internal returns (uint256 actualPrice) {
        if (_priceDiscovery.side == Side.Ask) {
            return fulfilAskOrder(_exchangeId, _exchangeToken, _priceDiscovery, _buyer, _offer);
        } else {
            return fulfilBidOrder(_exchangeId, _exchangeToken, _priceDiscovery, _offer);
        }
    }

    /**
     * @notice Fulfils an ask order on external contract.
     *
     * Reverts if:
     * - Offer price is in native token and caller does not send enough
     * - Offer price is in some ERC20 token and caller also sends native currency
     * - Calling transferFrom on token fails for some reason (e.g. protocol is not approved to transfer)
     * - Received ERC20 token amount differs from the expected value
     * - Protocol does not receive the voucher
     * - Transfer of voucher to the buyer fails for some reasong (e.g. buyer is contract that doesn't accept voucher)
     * - Call to price discovery contract fails
     *
     * @param _exchangeId - the id of the exchange to commit to
     * @param _exchangeToken - the address of the ERC20 token used for the exchange (zero address for native)
     * @param _priceDiscovery - the fully populated BosonTypes.PriceDiscovery struct
     * @param _buyer - the buyer's address (caller can commit on behalf of a buyer)
     * @param _offer - the pointer to offer struct, corresponding to the exchange
     * @return actualPrice - the actual price of the order
     */
    function fulfilAskOrder(
        uint256 _exchangeId,
        address _exchangeToken,
        PriceDiscovery calldata _priceDiscovery,
        address _buyer,
        Offer storage _offer
    ) internal returns (uint256 actualPrice) {
        // Transfer buyers funds to protocol
        FundsLib.validateIncomingPayment(_exchangeToken, _priceDiscovery.price);

        // At this point, protocol temporary holds buyer's payment
        uint256 protocolBalanceBefore = getBalance(_exchangeToken);

        // If token is ERC20, approve price discovery contract to transfer funds
        if (_exchangeToken != address(0)) {
            IERC20(_exchangeToken).approve(address(_priceDiscovery.priceDiscoveryContract), _priceDiscovery.price);
        }

        // Store the information about incoming voucher
        ProtocolLib.ProtocolStatus storage ps = protocolStatus();
        address cloneAddress = getCloneAddress(protocolLookups(), _offer.sellerId, _offer.collectionIndex);
        uint256 tokenId;
        {
            tokenId = _exchangeId;
            if (tokenId >= EXCHANGE_ID_2_2_0) tokenId |= (_offer.id << 128);
            ps.incomingVoucherId = tokenId;
            ps.incomingVoucherCloneAddress = cloneAddress;
        }
        // Call the price discovery contract
        _priceDiscovery.priceDiscoveryContract.functionCallWithValue(_priceDiscovery.priceDiscoveryData, msg.value);

        // Make sure that the price discovery contract has transferred the voucher to the protocol
        IBosonVoucher bosonVoucher = IBosonVoucher(cloneAddress);
        require(bosonVoucher.ownerOf(tokenId) == address(this), VOUCHER_NOT_RECEIVED);

        // If token is ERC20, reset approval
        if (_exchangeToken != address(0)) {
            IERC20(_exchangeToken).approve(address(_priceDiscovery.priceDiscoveryContract), 0);
        }

        // Clear the storage
        delete ps.incomingVoucherId;
        delete ps.incomingVoucherCloneAddress;

        // Check the escrow amount
        uint256 protocolBalanceAfter = getBalance(_exchangeToken);
        require(protocolBalanceBefore >= protocolBalanceAfter, NEGATIVE_PRICE_NOT_ALLOWED);
        actualPrice = protocolBalanceBefore - protocolBalanceAfter;

        uint256 overchargedAmount = _priceDiscovery.price - actualPrice;

        if (overchargedAmount > 0) {
            // Return the surplus to buyer
            FundsLib.transferFundsFromProtocol(_exchangeToken, payable(_buyer), overchargedAmount);
        }

        // Transfer voucher to buyer
        bosonVoucher.transferFrom(address(this), _buyer, tokenId);
    }

    /**
     * @notice Fulfils a bid order on external contract.
     *
     * Reverts if:
     *  - Voucher owner did not approve protocol to transfer the voucher
     *  - Price received from price discovery is lower than the expected price
     *  - Reseller did not approve protocol to transfer exchange token in escrow
     *
     * @param _exchangeId - the id of the exchange to commit to
     * @param _exchangeToken - the address of the ERC20 token used for the exchange (zero address for native)
     * @param _priceDiscovery - the fully populated BosonTypes.PriceDiscovery struct
     * @param _offer - the pointer to offer struct, corresponding to the exchange
     * @return actualPrice - the actual price of the order
     */
    function fulfilBidOrder(
        uint256 _exchangeId,
        address _exchangeToken,
        PriceDiscovery calldata _priceDiscovery,
        Offer storage _offer
    ) internal returns (uint256 actualPrice) {
        IBosonVoucher bosonVoucher = IBosonVoucher(
            getCloneAddress(protocolLookups(), _offer.sellerId, _offer.collectionIndex)
        );

        // Transfer seller's voucher to protocol
        // Don't need to use safe transfer from, since that protocol can handle the voucher
        uint256 tokenId = _exchangeId;
        if (tokenId >= EXCHANGE_ID_2_2_0) tokenId |= (_offer.id << 128);
        bosonVoucher.transferFrom(msgSender(), address(this), tokenId);

        if (_exchangeToken == address(0)) _exchangeToken = address(wNative);

        // Get protocol balance before the exchange
        uint256 protocolBalanceBefore = getBalance(_exchangeToken);

        // Track native balance just in case if seller sends some native currency or price discovery contract does
        // This is the balance that protocol had, before commit to offer was called
        uint256 protocolNativeBalanceBefore = getBalance(address(0)) - msg.value;

        // Approve price discovery contract to transfer voucher. There is no need to reset approval afterwards, since protocol is not the voucher owner anymore
        bosonVoucher.approve(_priceDiscovery.priceDiscoveryContract, tokenId);

        // Call the price discovery contract
        _priceDiscovery.priceDiscoveryContract.functionCallWithValue(_priceDiscovery.priceDiscoveryData, msg.value);

        // Check the escrow amount
        uint256 protocolBalanceAfter = getBalance(_exchangeToken);

        // Check the native balance and return the surplus to seller
        uint256 protocolNativeBalanceAfter = getBalance(address(0));
        if (protocolNativeBalanceAfter > protocolNativeBalanceBefore) {
            // Return the surplus to seller
            FundsLib.transferFundsFromProtocol(
                address(0),
                payable(msgSender()),
                protocolNativeBalanceAfter - protocolNativeBalanceBefore
            );
        }

        actualPrice = protocolBalanceAfter - protocolBalanceBefore;
        require(actualPrice >= _priceDiscovery.price, INSUFFICIENT_VALUE_RECEIVED);
    }

    /**
     * @notice Returns the balance of the protocol for the given token address
     *
     * @param _tokenAddress - the address of the token to check the balance for
     * @return balance - the balance of the protocol for the given token address
     */
    function getBalance(address _tokenAddress) internal view returns (uint256) {
        return _tokenAddress == address(0) ? address(this).balance : IERC20(_tokenAddress).balanceOf(address(this));
    }
}
