// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "../../domain/BosonConstants.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";
import { IERC20 } from "../../interfaces/IERC20.sol";
import { IWETH9Like } from "../../interfaces/IWETH9Like.sol";
import { IBosonVoucher } from "../../interfaces/clients/IBosonVoucher.sol";
import { ProtocolBase } from "./../bases/ProtocolBase.sol";
import { FundsLib } from "../libs/FundsLib.sol";

/**
 * @title PriceDiscoveryBase
 *
 * @dev Provides methods for fulfiling orders on external price discovery contracts.
 */
contract PriceDiscoveryBase is ProtocolBase {
    IWETH9Like public immutable weth;

    constructor(address _weth) {
        weth = IWETH9Like(_weth);
    }

    /**
     * @notice Fulfils an order on external contract. Helper function passes data to either buy or sell order.
     *
     * See descriptions of `fulfilBuyOrder` and `fulfilSellOrder` for more details.
     *
     * @param _exchangeId - the id of the exchange to commit to
     * @param _exchangeToken - the address of the ERC20 token used for the exchange (zero address for native)
     * @param _priceDiscovery - the fully populated BosonTypes.PriceDiscovery struct
     * @param _buyer - the buyer's address (caller can commit on behalf of a buyer)
     * @param _initialSellerId - the id of the original seller
     * @return actualPrice - the actual price of the order
     */
    function fulFilOrder(
        uint256 _exchangeId,
        address _exchangeToken,
        PriceDiscovery calldata _priceDiscovery,
        address _buyer,
        uint256 _initialSellerId
    ) internal returns (uint256 actualPrice) {
        if (_priceDiscovery.direction == Direction.Buy) {
            return fulfilBuyOrder(_exchangeId, _exchangeToken, _priceDiscovery, _buyer, _initialSellerId);
        } else {
            return fulfilSellOrder(_exchangeId, _exchangeToken, _priceDiscovery, _initialSellerId);
        }
    }

    /**
     * @notice Fulfils a buy order on external contract.
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
     * @param _initialSellerId - the id of the original seller
     * @return actualPrice - the actual price of the order
     */
    function fulfilBuyOrder(
        uint256 _exchangeId,
        address _exchangeToken,
        PriceDiscovery calldata _priceDiscovery,
        address _buyer,
        uint256 _initialSellerId
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
        address cloneAddress = protocolLookups().cloneAddress[_initialSellerId];
        ps.incomingVoucherId = _exchangeId;
        ps.incomingVoucherCloneAddress = cloneAddress;

        {
            // Call the price discovery contract
            (bool success, bytes memory returnData) = address(_priceDiscovery.priceDiscoveryContract).call{
                value: msg.value
            }(_priceDiscovery.priceDiscoveryData);

            // If error, return error message
            string memory errorMessage = (returnData.length == 0) ? FUNCTION_CALL_NOT_SUCCESSFUL : (string(returnData));
            require(success, errorMessage);
        }

        // Make sure that the price discovery contract has transferred the voucher to the protocol
        IBosonVoucher bosonVoucher = IBosonVoucher(cloneAddress);
        require(bosonVoucher.ownerOf(_exchangeId) == address(this), VOUCHER_NOT_RECEIVED);

        // If token is ERC20, reset approval
        if (_exchangeToken != address(0)) {
            IERC20(_exchangeToken).approve(address(_priceDiscovery.priceDiscoveryContract), 0);
        }

        // Clear the storage
        delete ps.incomingVoucherId;
        delete ps.incomingVoucherCloneAddress;

        // Check the escrow amount
        uint256 protocolBalanceAfter = getBalance(_exchangeToken);
        actualPrice = protocolBalanceBefore - protocolBalanceAfter;

        uint256 overchargedAmount = _priceDiscovery.price - actualPrice;

        if (overchargedAmount > 0) {
            // Return the surplus to buyer
            FundsLib.transferFundsFromProtocol(_exchangeToken, payable(_buyer), overchargedAmount);
        }

        // Transfer voucher to buyer
        bosonVoucher.transferFrom(address(this), _buyer, _exchangeId);
    }

    /**
     * @notice Fulfils a sell order on external contract.
     *
     * Reverts if:
     *  - Voucher owner did not approve protocol to transfer the voucher
     *  - Price received from price discovery is lower than the expected price
     *  - Reseller did not approve protocol to transfer exchange token in escrow
     *
     * @param _exchangeId - the id of the exchange to commit to
     * @param _exchangeToken - the address of the ERC20 token used for the exchange (zero address for native)
     * @param _priceDiscovery - the fully populated BosonTypes.PriceDiscovery struct
     * @param _initialSellerId - the id of the original seller
     * @return actualPrice - the actual price of the order
     */
    function fulfilSellOrder(
        uint256 _exchangeId,
        address _exchangeToken,
        PriceDiscovery calldata _priceDiscovery,
        uint256 _initialSellerId
    ) internal returns (uint256 actualPrice) {
        // what about non-zero msg.value?
        // No need to reset approval

        IBosonVoucher bosonVoucher = IBosonVoucher(protocolLookups().cloneAddress[_initialSellerId]);

        // Transfer seller's voucher to protocol
        // Don't need to use safe transfer from, since that protocol can handle the voucher
        bosonVoucher.transferFrom(msgSender(), address(this), _exchangeId);

        if (_exchangeToken == address(0)) _exchangeToken = address(weth);

        // Get protocol balance before the exchange
        uint256 protocolBalanceBefore = getBalance(_exchangeToken);

        // Approve price discovery contract to transfer voucher
        bosonVoucher.approve(_priceDiscovery.priceDiscoveryContract, _exchangeId);

        {
            // Call the price discovery contract
            (bool success, bytes memory returnData) = address(_priceDiscovery.priceDiscoveryContract).call{
                value: msg.value
            }(_priceDiscovery.priceDiscoveryData);

            // If error, return error message
            string memory errorMessage = (returnData.length == 0) ? FUNCTION_CALL_NOT_SUCCESSFUL : (string(returnData));
            require(success, errorMessage);
        }

        // Check the escrow amount
        uint256 protocolBalanceAfter = getBalance(_exchangeToken);

        actualPrice = protocolBalanceAfter - protocolBalanceBefore;
        require(actualPrice >= _priceDiscovery.price, "Price discovery contract returned less than expected");
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
