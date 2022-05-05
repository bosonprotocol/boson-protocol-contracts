// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import {BosonTypes} from "../../domain/BosonTypes.sol";
import {IBosonFundsEvents} from "../events/IBosonFundsEvents.sol";

/**
 * @title IBosonFundsHandler
 *
 * @notice Handles custody and withdrawal of buyer and seller funds within the protocol.
 *
 * The ERC-165 identifier for this interface is: 0xa07fcc70
 */
interface IBosonFundsHandler is IBosonFundsEvents {

    /**
     * @notice Receives funds from the caller and stores it to the seller id, so they can be used during the commitToOffer
     *
     * Reverts if:
     * - seller id does not exist
     * - it receives some eth, but token address is not zero
     * - it receives some eth, and the amount does not match msg.value
     * - if contract at token address does not support erc20 function transferFrom
     * - if calling transferFrom on token fails for some reason (e.g. protocol is not approved to transfer)
     *
     * @param _sellerId - id of the seller that will be credited
     * @param _tokenAddress - contract address of token that is being deposited (0 for native currency)
     * @param _amount - amount to be credited
     */
     function depositFunds(uint256 _sellerId, address _tokenAddress, uint256 _amount) external payable;

}
