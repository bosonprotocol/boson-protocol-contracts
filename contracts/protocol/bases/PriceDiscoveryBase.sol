// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "../../domain/BosonConstants.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";
import { IERC20 } from "../../interfaces/IERC20.sol";
import { IWETH9Like } from "../../interfaces/IWETH9Like.sol";
import { IBosonVoucher } from "../../interfaces/clients/IBosonVoucher.sol";
import { ProtocolBase } from "./../bases/ProtocolBase.sol";
import { FundsLib } from "../libs/FundsLib.sol";
import { Address } from "../../ext_libs/Address.sol";

/**
 * @title PriceDiscoveryBase
 *
 * @dev Provides methods for fulfiling orders on external price discovery contracts.
 */
contract PriceDiscoveryBase is ProtocolBase {
    using Address for address;

    IWETH9Like public immutable weth;

    constructor(address _weth) {
        weth = IWETH9Like(_weth);
    }

    /**
     * @notice @notice Fulfils an order on an external contract. Helper function passes data to either ask or bid orders.
     *
     * See descriptions of `fulfilBuyOrder` and `fulfilSellOrder` for more details.
     *
     * @param _tokenId - the id of the token
     * @param _offer - the fully populated BosonTypes.Offer struct
     * @param _priceDiscovery - the fully populated BosonTypes.PriceDiscovery struct
     * @param _buyer - the buyer's address (caller can commit on behalf of a buyer)
     * @return actualPrice - the actual price of the order
     */
    function fulfilOrder(
        uint256 _tokenId,
        Offer storage _offer,
        PriceDiscovery calldata _priceDiscovery,
        address _buyer
    ) internal returns (uint256 actualPrice) {
        if (_priceDiscovery.side == Side.Ask) {
            return fulfilAskOrder(_tokenId, _offer, _priceDiscovery, _buyer);
        } else {
            return fulfilBidOrder(_tokenId, _offer, _priceDiscovery);
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
     * @param _tokenId - the id of the token
     * @param _offer - the fully populated BosonTypes.Offer struct
     * @param _priceDiscovery - the fully populated BosonTypes.PriceDiscovery struct
     * @param _buyer - the buyer's address (caller can commit on behalf of a buyer)
     * @return actualPrice - the actual price of the order
     */
    function fulfilAskOrder(
        uint256 _tokenId,
        Offer storage _offer,
        PriceDiscovery calldata _priceDiscovery,
        address _buyer
    ) internal returns (uint256 actualPrice) {
        address exchangeToken = _offer.exchangeToken;

        // Transfer buyers funds to protocol
        FundsLib.validateIncomingPayment(exchangeToken, _priceDiscovery.price);

        // At this point, protocol temporary holds buyer's payment if token is native token
        uint256 protocolBalanceBefore = getBalance(exchangeToken, address(this));

        // If token is ERC20, approve price discovery contract to transfer funds
        if (exchangeToken != address(0)) {
            IERC20(exchangeToken).approve(address(_priceDiscovery.priceDiscoveryContract), _priceDiscovery.price);
        }

        // Store the information about incoming voucher
        ProtocolLib.ProtocolStatus storage ps = protocolStatus();
        address cloneAddress = protocolLookups().cloneAddress[_offer.sellerId];
        ps.incomingVoucherCloneAddress = cloneAddress;

        // Call the price discovery contract
        _priceDiscovery.priceDiscoveryContract.functionCallWithValue(_priceDiscovery.priceDiscoveryData, msg.value);

        // If caller has provided token id, it must match the token id that the price discovery send to the protocol
        if (_tokenId != 0) {
            require(_tokenId == ps.incomingVoucherId, TOKEN_ID_NOT_FOUND);
        } else {
            // If caller has not provide token id, use the one stored in the protocol
            _tokenId = ps.incomingVoucherId;
        }

        {
            // Make sure that the price discovery contract has transferred the voucher to the protocol
            IBosonVoucher bosonVoucher = IBosonVoucher(cloneAddress);
            require(bosonVoucher.ownerOf(_tokenId) == address(this), VOUCHER_NOT_RECEIVED);

            // Transfer voucher to buyer
            bosonVoucher.transferFrom(address(this), _buyer, _tokenId);
        }

        // Check the escrow amount
        uint256 protocolBalanceAfter = getBalance(exchangeToken, address(this));
        actualPrice = protocolBalanceBefore - protocolBalanceAfter;

        // If token is ERC20, reset approval
        if (exchangeToken != address(0)) {
            IERC20(exchangeToken).approve(address(_priceDiscovery.priceDiscoveryContract), 0);
        }

        // Clear the storage
        delete ps.incomingVoucherId;
        delete ps.incomingVoucherCloneAddress;

        uint256 overchargedAmount = _priceDiscovery.price - actualPrice;

        if (overchargedAmount > 0) {
            // Return the surplus to buyer
            FundsLib.transferFundsFromProtocol(exchangeToken, payable(_buyer), overchargedAmount);
        }
    }

    /**
     * @notice Fulfils a bid order on external contract.
     *
     * Reverts if:
     *  - Voucher owner did not approve protocol to transfer the voucher
     *  - Price received from price discovery is lower than the expected price
     *  - Reseller did not approve protocol to transfer exchange token in escrow
     *
     * @param _tokenId - the id of the token
     * @param _offer - the fully populated BosonTypes.Offer struct
     * @param _priceDiscovery - the fully populated BosonTypes.PriceDiscovery struct
     * @return actualPrice - the actual price of the order
     */
    function fulfilBidOrder(
        uint256 _tokenId,
        Offer storage _offer,
        PriceDiscovery calldata _priceDiscovery
    ) internal returns (uint256 actualPrice) {
        IBosonVoucher bosonVoucher = IBosonVoucher(protocolLookups().cloneAddress[_offer.sellerId]);

        address owner = bosonVoucher.ownerOf(_tokenId);
        bool callerIsOwner = owner == msgSender();
        uint256 balanceBefore;

        // If caller is the owner, protocol can act on behalf of the owner
        if (callerIsOwner) {
            // Transfer seller's voucher to protocol
            // Don't need to use safe transfer from, since that protocol can handle the voucher
            bosonVoucher.transferFrom(msgSender(), address(this), _tokenId);

            owner = address(this);

            // Approve price discovery contract to transfer voucher. There is no need to reset approval afterwards, since protocol is not the voucher owner anymore
            bosonVoucher.approve(_priceDiscovery.priceDiscoveryContract, _tokenId);
        } else {
            ProtocolLib.ProtocolLookups storage lookups = protocolLookups();
            address priceDiscoveryContract = lookups.priceDiscoveryContractByVoucher[_tokenId];

            require(owner != address(0) && owner == priceDiscoveryContract, "UNAUTHORIZED");

            // balance to check is last voucher owner, who will receive the price paid
            owner = lookups.lastVoucherOwner[_tokenId];
        }

        address exchangeToken = _offer.exchangeToken;

        if (exchangeToken == address(0)) exchangeToken = address(weth);

        // Get protocol balance before the exchange
        balanceBefore = getBalance(exchangeToken, owner);

        // Track native balance just in case if seller send some native currency or price discovery contract does
        uint256 protocolNativeBalanceBefore = getBalance(address(0), address(this));

        // Store the information about incoming voucher
        ProtocolLib.ProtocolStatus storage ps = protocolStatus();
        address cloneAddress = protocolLookups().cloneAddress[_offer.sellerId];

        // Set incoming voucher clone address
        ps.incomingVoucherCloneAddress = cloneAddress;

        // Call the price discovery contract
        _priceDiscovery.priceDiscoveryContract.functionCall(_priceDiscovery.priceDiscoveryData);

        uint256 balanceAfter = getBalance(exchangeToken, owner);

        actualPrice = balanceAfter - balanceBefore;
        require(actualPrice >= _priceDiscovery.price, INSUFFICIENT_VALUE_RECEIVED);

        // Transfer funds to protocol - caller must pay on behalf of the seller
        if (!callerIsOwner) {
            FundsLib.validateIncomingPayment(exchangeToken, actualPrice);
            // see if is possible (and safe) to use transferFundsToProtocol and get funds directly from the seller
            // FundsLib.transferFundsToProtocol(exchangeToken, payable(owner), actualPrice);
        }

        // Check the native balance and return the surplus to seller
        uint256 protocolNativeBalanceAfter = getBalance(address(0), address(this));

        if (protocolNativeBalanceAfter > protocolNativeBalanceBefore) {
            // Return the surplus to seller
            FundsLib.transferFundsFromProtocol(
                address(0),
                payable(msgSender()),
                protocolNativeBalanceAfter - protocolNativeBalanceBefore
            );
        }
        // Clear the storage
        delete ps.incomingVoucherId;
        delete ps.incomingVoucherCloneAddress;
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
}
