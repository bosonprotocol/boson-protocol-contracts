// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import { BosonTypes } from "../../domain/BosonTypes.sol";
import { IBosonAccountEvents } from "../events/IBosonAccountEvents.sol";

/**
 * @title IBosonAgentHandler
 *
 * @notice Handles creation, update, retrieval of agents within the protocol.
 *
 * The ERC-165 identifier for this interface is: 0xa6cf31c1
 */
interface IBosonAgentHandler is IBosonAccountEvents {
    /**
     * @notice Creates a marketplace agent
     *
     * Emits an AgentCreated event if successful.
     *
     * Reverts if:
     * - Wallet address is zero address
     * - Active is not true
     * - Wallet address is not unique to this agent
     * - Fee percentage is greater than 10000 (100%)
     *
     * @param _agent - the fully populated struct with agent id set to 0x0
     */
    function createAgent(BosonTypes.Agent memory _agent) external;

    /**
     * @notice Updates an agent. All fields should be filled, even those staying the same.
     *
     * Emits a AgentUpdated event if successful.
     *
     * Reverts if:
     * - Caller is not the wallet address associated with the agent account
     * - Wallet address is zero address
     * - Wallet address is not unique to this agent
     * - Agent does not exist
     * - Fee percentage is greater than 10000 (100%)
     *
     * @param _agent - the fully populated agent struct
     */
    function updateAgent(BosonTypes.Agent memory _agent) external;

    /**
     * @notice Gets the details about an agent.
     *
     * @param _agentId - the id of the agent to check
     * @return exists - the agent was found
     * @return agent - the agent details. See {BosonTypes.Agent}
     */
    function getAgent(uint256 _agentId) external view returns (bool exists, BosonTypes.Agent memory agent);
}
