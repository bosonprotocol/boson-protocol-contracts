// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.18;

import { BosonTypes } from "../../domain/BosonTypes.sol";
import { IBosonFundsEvents } from "../events/IBosonFundsEvents.sol";
import { IBosonFundsLibEvents } from "../events/IBosonFundsEvents.sol";

/**
 * @title IBosonFundsHandler
 *
 * @notice Handles custody and withdrawal of buyer and seller funds within the protocol.
 *
 * The ERC-165 identifier for this interface is: 0x2f4a64d7
 */
interface IBosonFundsHandler is IBosonFundsEvents, IBosonFundsLibEvents {
    /**
     * @notice Receives funds from the caller, maps funds to the seller id and stores them so they can be used during the commitToOffer.
     *
     * Emits FundsDeposited event if successful.
     *
     * Reverts if:
     * - The funds region of protocol is paused
     * - Seller id does not exist
     * - It receives some native currency (e.g. ETH), but token address is not zero
     * - It receives some native currency (e.g. ETH), and the amount does not match msg.value
     * - Contract at token address does not support ERC20 function transferFrom
     * - Calling transferFrom on token fails for some reason (e.g. protocol is not approved to transfer)
     * - Received ERC20 token amount differs from the expected value
     *
     * @param _sellerId - id of the seller that will be credited
     * @param _tokenAddress - contract address of token that is being deposited (0 for native currency)
     * @param _amount - amount to be credited
     */
    function depositFunds(uint256 _sellerId, address _tokenAddress, uint256 _amount) external payable;

    /**
     * @notice Withdraws the specified funds. Can be called for seller, buyer or agent.
     *
     * Emits FundsWithdrawn event if successful.
     *
     * Reverts if:
     * - The funds region of protocol is paused
     * - Caller is not associated with the entity id
     * - Token list length does not match amount list length
     * - Token list length exceeds the maximum allowed number of tokens
     * - Caller tries to withdraw more that they have in available funds
     * - There is nothing to withdraw
     * - Transfer of funds is not successful
     *
     * @param _entityId - id of entity for which funds should be withdrawn
     * @param _tokenList - list of contract addresses of tokens that are being withdrawn
     * @param _tokenAmounts - list of amounts to be withdrawn, corresponding to tokens in tokenList
     */
    function withdrawFunds(uint256 _entityId, address[] calldata _tokenList, uint256[] calldata _tokenAmounts) external;

    /**
     * @notice Withdraws the protocol fees.
     *
     * @dev Can only be called by the FEE_COLLECTOR role.
     *
     * Emits FundsWithdrawn event if successful.
     *
     * Reverts if:
     * - The funds region of protocol is paused
     * - Caller does not have the FEE_COLLECTOR role
     * - Token list length does not match amount list length
     * - Token list length exceeds the maximum allowed number of tokens
     * - Caller tries to withdraw more that they have in available funds
     * - There is nothing to withdraw
     * - Transfer of funds is not successful
     *
     * @param _tokenList - list of contract addresses of tokens that are being withdrawn
     * @param _tokenAmounts - list of amounts to be withdrawn, corresponding to tokens in tokenList
     */
    function withdrawProtocolFees(address[] calldata _tokenList, uint256[] calldata _tokenAmounts) external;

    /**
     * @notice Returns list of addresses for which the entity has funds available.
     * If the list is too long, it can be retrieved in chunks by using `getTokenListPaginated` and specifying _limit and _offset.
     *
     * @param _entityId - id of entity for which availability of funds should be checked
     * @return tokenList - list of token addresses
     */
    function getTokenList(uint256 _entityId) external view returns (address[] memory tokenList);

    /**
     * @notice Returns list of addresses for which the entity has funds available.
     *
     * @param _entityId - id of entity for which availability of funds should be checked
     * @return tokenList - list of token addresses
     */
    function getTokenListPaginated(
        uint256 _entityId,
        uint256 _limit,
        uint256 _offset
    ) external view returns (address[] memory tokenList);

    /**
     * @notice Returns the information about the funds that an entity can use as a sellerDeposit and/or withdraw from the protocol.
     * It tries to get information about all tokens that the entity has in availableFunds storage.
     * If the token list is too long, this call may run out of gas. In this case, the caller should use the function `getAvailableFunds` and pass the token list.
     *
     * @param _entityId - id of entity for which availability of funds should be checked
     * @return availableFunds - list of token addresses, token names and amount that can be used as a seller deposit or be withdrawn
     */
    function getAllAvailableFunds(uint256 _entityId) external view returns (BosonTypes.Funds[] memory availableFunds);

    /**
     * @notice Returns the information about the funds that an entity can use as a sellerDeposit and/or withdraw from the protocol.
     * To get a list of tokens that the entity has in availableFunds storage, use the function `getTokenList`.
     *
     * @param _entityId - id of entity for which availability of funds should be checked
     * @param _tokenList - list of token addresses to check
     * @return availableFunds - list of token addresses, token names and amount that can be used as a seller deposit or be withdrawn
     */
    function getAvailableFunds(
        uint256 _entityId,
        address[] memory _tokenList
    ) external view returns (BosonTypes.Funds[] memory availableFunds);
}
