// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import { BosonTypes } from "../../domain/BosonTypes.sol";
import { IBosonFundsEvents } from "../events/IBosonFundsEvents.sol";
import { IBosonFundsLibEvents } from "../events/IBosonFundsEvents.sol";

/**
 * @title IBosonFundsHandler
 *
 * @notice Handles custody and withdrawal of buyer and seller funds within the protocol.
 *
 * The ERC-165 identifier for this interface is: 0x18834247
 */
interface IBosonFundsHandler is IBosonFundsEvents, IBosonFundsLibEvents {
    /**
     * @notice Receives funds from the caller and stores it to the seller id, so they can be used during the commitToOffer
     *
     * Reverts if:
     * - The funds region of protocol is paused
     * - seller id does not exist
     * - it receives some native currency (e.g. ETH), but token address is not zero
     * - it receives some native currency (e.g. ETH), and the amount does not match msg.value
     * - if contract at token address does not support erc20 function transferFrom
     * - if calling transferFrom on token fails for some reason (e.g. protocol is not approved to transfer)
     *
     * @param _sellerId - id of the seller that will be credited
     * @param _tokenAddress - contract address of token that is being deposited (0 for native currency)
     * @param _amount - amount to be credited
     */
    function depositFunds(
        uint256 _sellerId,
        address _tokenAddress,
        uint256 _amount
    ) external payable;

    /**
     * @notice Withdraw the specified funds
     *
     * Reverts if:
     * - The funds region of protocol is paused
     * - caller is not associated with the entity id
     * - token list length does not match amount list length
     * - token list length exceeds the maximum allowed number of tokens
     * - caller tries to withdraw more that they have in available funds
     * - there is nothing to withdraw
     * - transfer of funds is not succesful
     *
     * @param _entityId - seller or buyer or agent id
     * @param _tokenList - list of contract addresses of tokens that are being withdrawn
     * @param _tokenAmounts - list of amounts to be withdrawn, corresponding to tokens in tokenList
     */
    function withdrawFunds(
        uint256 _entityId,
        address[] calldata _tokenList,
        uint256[] calldata _tokenAmounts
    ) external;

    /**
     * @notice Withdraw the protocol fees
     *
     * Reverts if:
     * - The funds region of protocol is paused
     * - caller does not have the FEE_COLLECTOR role
     * - token list length does not match amount list length
     * - token list length exceeds the maximum allowed number of tokens
     * - caller tries to withdraw more that they have in available funds
     * - there is nothing to withdraw
     * - transfer of funds is not succesful
     *
     * @param _tokenList - list of contract addresses of tokens that are being withdrawn
     * @param _tokenAmounts - list of amounts to be withdrawn, corresponding to tokens in tokenList
     */
    function withdrawProtocolFees(address[] calldata _tokenList, uint256[] calldata _tokenAmounts) external;

    /**
     * @notice For a given seller or buyer id it returns the information about the funds that can use as a sellerDeposit and/or be withdrawn
     *
     * @param _entityId - seller or buyer id to check
     * @return availableFunds - list of token addresses, token names and amount that can be used as a seller deposit or be withdrawn
     */
    function getAvailableFunds(uint256 _entityId) external view returns (BosonTypes.Funds[] memory availableFunds);
}
