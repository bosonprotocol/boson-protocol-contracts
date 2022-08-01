// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./../../domain/BosonConstants.sol";
import { IBosonAccountEvents } from "../../interfaces/events/IBosonAccountEvents.sol";
import { ProtocolBase } from "./ProtocolBase.sol";
import { ProtocolLib } from "./../libs/ProtocolLib.sol";

/**
 * @title AgentBase
 *
 * @dev Provides methods for agent creation that can be shared accross facets
 */
contract AgentBase is ProtocolBase, IBosonAccountEvents {
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
    function createAgentInternal(Agent memory _agent) internal {
        //Check for zero address
        require(_agent.wallet != address(0), INVALID_ADDRESS);

        //Check active is not set to false
        require(_agent.active, MUST_BE_ACTIVE);

        // Make sure percentage is less than or equal to 10000
        require(_agent.feePercentage <= 10000, FEE_PERCENTAGE_INVALID);

        // Get the next account Id and increment the counter
        uint256 agentId = protocolCounters().nextAccountId++;

        //check that the wallet address is unique to one agent Id
        require(protocolLookups().agentIdByWallet[_agent.wallet] == 0, AGENT_ADDRESS_MUST_BE_UNIQUE);

        _agent.id = agentId;
        storeAgent(_agent);

        //Notify watchers of state change
        emit AgentCreated(_agent.id, _agent, msgSender());
    }

    /**
     * @notice Stores agent struct in storage
     *
     * @param _agent - the fully populated struct with agent id set
     */
    function storeAgent(Agent memory _agent) internal {
        // Get storage location for agent
        (, Agent storage agent) = fetchAgent(_agent.id);

        // Set agent props individually since memory structs can't be copied to storage
        agent.id = _agent.id;
        agent.wallet = _agent.wallet;
        agent.active = _agent.active;
        agent.feePercentage = _agent.feePercentage;

        //Map the agent's wallet address to the agentId.
        protocolLookups().agentIdByWallet[_agent.wallet] = _agent.id;
    }
}
