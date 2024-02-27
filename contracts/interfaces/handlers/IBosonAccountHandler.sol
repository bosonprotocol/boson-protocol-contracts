// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import { BosonErrors } from "../../domain/BosonErrors.sol";
import { IBosonAccountEvents } from "../events/IBosonAccountEvents.sol";
import { IBosonAgentHandler } from "./IBosonAgentHandler.sol";
import { IBosonBuyerHandler } from "./IBosonBuyerHandler.sol";
import { IBosonDisputeResolverHandler } from "./IBosonDisputeResolverHandler.sol";
import { IBosonSellerHandler } from "./IBosonSellerHandler.sol";

/**
 * @title IBosonAccountHandler
 *
 * @notice Handles creation, update, retrieval of accounts within the protocol.
 *
 * The ERC-165 identifier for this interface is: 0x0757010c
 */
interface IBosonAccountHandler is
    IBosonAgentHandler,
    IBosonBuyerHandler,
    IBosonDisputeResolverHandler,
    IBosonSellerHandler,
    IBosonAccountEvents,
    BosonErrors
{
    /**
     * @notice Gets the next account id that can be assigned to an account.
     *
     * @dev Does not increment the counter.
     *
     * @return nextAccountId - the account id
     */
    function getNextAccountId() external view returns (uint256 nextAccountId);
}
