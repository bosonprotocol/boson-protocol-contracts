// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "hardhat/console.sol";
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
            return fulfilBidOrder(_tokenId, _offer, _priceDiscovery, _buyer);
        }
    }

    /**
     * @notice Fulfils an ask order on external contract.
     *
     * Reverts if:
     * - Offer price is in native token and caller does not send enough
     * - Offer price is in some ERC20 token and caller also sends native currency
     * - Calling transferFrom on token fails for some reason (e.g. protocol is not approved to transfer)
     * - Received amount differs from the expected value set in price discovery
     * - Protocol does not receive the voucher
     * - Transfer of voucher to the buyer fails for some reasong (e.g. buyer is contract that doesn't accept voucher)
     * - Call to price discovery contract fails
     * - New voucher owner is not buyer wallet
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
        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();
        IBosonVoucher bosonVoucher = IBosonVoucher(lookups.cloneAddress[_offer.sellerId]);

        address exchangeToken = _offer.exchangeToken;

        // Transfer buyers funds to protocol
        FundsLib.validateIncomingPayment(exchangeToken, _priceDiscovery.price);

        // If token is ERC20, approve price discovery contract to transfer protocol funds
        if (exchangeToken != address(0)) {
            IERC20(exchangeToken).approve(address(_priceDiscovery.priceDiscoveryContract), _priceDiscovery.price);
        }

        actualPrice = callPriceDiscoveryContract(
            _priceDiscovery,
            exchangeToken,
            address(bosonVoucher),
            address(this),
            Side.Ask
        );

        // If token is ERC20, reset approval
        if (exchangeToken != address(0)) {
            IERC20(exchangeToken).approve(address(_priceDiscovery.priceDiscoveryContract), 0);
        }

        // Store the information about incoming voucher
        ProtocolLib.ProtocolStatus storage ps = protocolStatus();

        // If the caller has provided token id, it must match the token id that the price discovery send to the protocol
        if (_tokenId != 0) {
            require(_tokenId == ps.incomingVoucherId, TOKEN_ID_MISMATCH);
        } else {
            // If the caller has not provided token id, use the one stored in onPremintedVoucherTransfer function
            _tokenId = ps.incomingVoucherId;
        }

        {
            // Make sure that the price discovery contract has transferred the voucher to the protocol
            require(bosonVoucher.ownerOf(_tokenId) == address(this), VOUCHER_NOT_RECEIVED);

            // Transfer voucher to buyer
            bosonVoucher.transferFrom(address(this), _buyer, _tokenId);
        }

        uint256 overchargedAmount = _priceDiscovery.price - actualPrice;

        if (overchargedAmount > 0) {
            // Return the surplus to caller
            FundsLib.transferFundsFromProtocol(exchangeToken, payable(msgSender()), overchargedAmount);
        }
    }

    /**
     * @notice Fulfils a bid order on external contract when caller is not voucher owner.
     *
     * Reverts if:
     * - Offer price is in native token and caller does not approve WETH
     * - Offer price is in some ERC20 token and caller also sends native currency
     * - Calling transferFrom on token fails for some reason (e.g. protocol is not approved to transfer)
     * - Received ERC20 token amount differs from the expected value
     * - Transfer of voucher to the buyer fails for some reason (e.g. buyer is contract that doesn't accept voucher)
     * - Current owner is not price discovery contract
     * - Last voucher owner not found
     * - Call to price discovery contract fails
     * - Exchange doesn't exist after the call to price discovery contract
     * - Exchange is not in the committed state
     * - Price received from price discovery is lower than the expected price
     * - Reseller did not approve protocol to transfer exchange token in escrow
     * - New voucher owner is not buyer wallet
     *
     * @param _tokenId - the id of the token
     * @param _offer - the fully populated BosonTypes.Offer struct
     * @param _priceDiscovery - the fully populated BosonTypes.PriceDiscovery struct
     * @return actualPrice - the actual price of the order
     */
    function fulfilBidOrder(
        uint256 _tokenId,
        Offer storage _offer,
        PriceDiscovery calldata _priceDiscovery,
        address _buyer
    ) internal returns (uint256 actualPrice) {
        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();
        IBosonVoucher bosonVoucher = IBosonVoucher(lookups.cloneAddress[_offer.sellerId]);

        // Get current voucher owner
        address owner = bosonVoucher.ownerOf(_tokenId);

        // Check if caller is the owner of the voucher
        if (owner == msgSender()) {
            // Transfer seller's voucher to protocol
            // Don't need to use safe transfer from, since that protocol can handle the voucher
            bosonVoucher.transferFrom(msgSender(), address(this), _tokenId);

            // Owner is now protocol
            address owner = address(this);

            // Approve price discovery contract to transfer voucher. There is no need to reset approval afterwards, since protocol is not the voucher owner anymore
            bosonVoucher.approve(_priceDiscovery.priceDiscoveryContract, _tokenId);
        } else {
            // If caller is not the owner, check if the owner exists and is voucher price discovery contract
            address priceDiscoveryContract = lookups.priceDiscoveryContractByVoucher[_tokenId];

            require(owner != address(0) && owner == priceDiscoveryContract, OWNER_MUST_BE_PRICE_DISCOVERY_CONTRACT);

            // Check the last owner's balance since they are the one who should receive the price via the price discovery contract
            owner = lookups.lastVoucherOwner[_tokenId];

            require(owner != address(0), LAST_OWNER_NOT_FOUND);
        }

        address exchangeToken = _offer.exchangeToken;

        // Native token is not safe, as its value can be intercepted in the receive function.
        if (exchangeToken == address(0)) exchangeToken = address(weth);

        // Track native balance just in case if seller send some native currency or price discovery contract does
        uint256 protocolNativeBalanceBefore = getBalance(address(0), address(this));

        // Store the information about incoming voucher
        ProtocolLib.ProtocolStatus storage ps = protocolStatus();

        {
            actualPrice = callPriceDiscoveryContract(
                _priceDiscovery,
                exchangeToken,
                address(bosonVoucher),
                owner,
                Side.Bid
            );

            require(actualPrice >= _priceDiscovery.price, INSUFFICIENT_VALUE_RECEIVED);

            if (exchangeToken == address(weth)) {
                //  Protocol operates with native currency, needs to unwrap it (i.e. withdraw)
                weth.withdraw(actualPrice);
                // Set exchange token to address(0) again
                exchangeToken = address(0);
            }

            // Transfer funds to protocol - caller must pay on behalf of the seller
            FundsLib.validateIncomingPayment(exchangeToken, actualPrice);

            // Check the native balance and return the surplus to caller
            uint256 protocolNativeBalanceAfter = getBalance(address(0), address(this));

            if (protocolNativeBalanceAfter > protocolNativeBalanceBefore) {
                // Return the surplus to caller
                FundsLib.transferFundsFromProtocol(
                    address(0),
                    payable(msgSender()),
                    protocolNativeBalanceAfter - protocolNativeBalanceBefore
                );
            }
        }

        // Token id expected by caller and token id send to buyer must match
        require(_tokenId == protocolStatus().incomingVoucherId, TOKEN_ID_MISMATCH);
    }

    function clearStorage(uint256 _tokenId) internal {
        ProtocolLib.ProtocolStatus storage ps = protocolStatus();
        delete ps.incomingVoucherId;
        delete ps.incomingVoucherCloneAddress;
        delete protocolLookups().lastVoucherOwner[_tokenId];
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

    /**
     * @notice Calls the price discovery contract
     *
     * @param _priceDiscovery - the fully populated BosonTypes.PriceDiscovery struct
     * @param _exchangeAddress - the address of the exchange token
     * @param _voucherAddress - the address of the voucher contract
     * @param _balanceAddress - the address of the entity to check the balance for
     * @return actualPrice - the actual price paid for the voucher
     */
    function callPriceDiscoveryContract(
        PriceDiscovery calldata _priceDiscovery,
        address _exchangeAddress,
        address _voucherAddress,
        address _balanceAddress,
        Side _side
    ) internal returns (uint256 actualPrice) {
        // Check balance before the price discovery call
        uint256 balanceBefore = getBalance(_exchangeAddress, _balanceAddress);

        // Set incoming voucher clone address
        protocolStatus().incomingVoucherCloneAddress = _voucherAddress;

        // Call the price discovery contract
        if (msg.value > 0) {
            _priceDiscovery.priceDiscoveryContract.functionCallWithValue(_priceDiscovery.priceDiscoveryData, msg.value);
        } else {
            _priceDiscovery.priceDiscoveryContract.functionCall(_priceDiscovery.priceDiscoveryData);
        }

        // Check balance after the price discovery call
        uint256 balanceAfter = getBalance(_exchangeAddress, _balanceAddress);

        actualPrice = _side == Side.Ask ? balanceBefore - balanceAfter : balanceAfter - balanceBefore;
    }
}
