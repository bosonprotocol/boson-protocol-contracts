// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import "../../domain/BosonConstants.sol";
import { IBosonAgentHandler } from "../../interfaces/handlers/IBosonAgentHandler.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { AgentBase } from "../bases/AgentBase.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";

contract AgenttHandlerFacet is IBosonAgentHandler, AgentBase {
    /**
     * @notice Facet Initializer
     */
    function initialize() public onlyUnInitialized(type(IBosonAgentHandler).interfaceId) {
        DiamondLib.addSupportedInterface(type(IBosonAgentHandler).interfaceId);
    }

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
    function createAgent(Agent memory _agent) external override {
        createAgentInternal(_agent);
    }

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
    function updateAgent(Agent memory _agent) external override {
        //Check for zero address
        require(_agent.wallet != address(0), INVALID_ADDRESS);

        bool exists;
        Agent storage agent;

        //Check Agent exists in agents mapping
        (exists, agent) = fetchAgent(_agent.id);

        //Agent must already exist
        require(exists, NO_SUCH_AGENT);

        //Check that msg.sender is the wallet address for this agent
        require(agent.wallet == msgSender(), NOT_AGENT_WALLET);

        // Make sure percentage is less than or equal to 10000
        require(_agent.feePercentage <= 10000, FEE_PERCENTAGE_INVALID);

        //check that the wallet address is unique to one agent Id if new
        require(
            protocolLookups().agentIdByWallet[_agent.wallet] == 0 ||
                protocolLookups().agentIdByWallet[_agent.wallet] == _agent.id,
            AGENT_ADDRESS_MUST_BE_UNIQUE
        );

        //Delete current mappings
        delete protocolLookups().agentIdByWallet[msgSender()];

        storeAgent(_agent);

        // Notify watchers of state change
        emit AgentUpdated(_agent.id, _agent, msgSender());
    }

    /**
     * @notice Gets the details about an agent.
     *
     * @param _agentId - the id of the agent to check
     * @return exists - the agent was found
     * @return agent - the agent details. See {BosonTypes.Agent}
     */
    function getAgent(uint256 _agentId) external view returns (bool exists, Agent memory agent) {
        return fetchAgent(_agentId);
    }
}
