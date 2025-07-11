// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import "../../domain/BosonConstants.sol";
import { IBosonAccountEvents } from "../../interfaces/events/IBosonAccountEvents.sol";
import { IBosonAgentHandler } from "../../interfaces/handlers/IBosonAgentHandler.sol";
import { ProtocolBase } from "../bases/ProtocolBase.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";

/**
 * @title AgentHandlerFacet
 *
 * @notice Handles Agent account management requests and queries.
 */
contract AgentHandlerFacet is IBosonAgentHandler, IBosonAccountEvents, ProtocolBase {
    /**
     * @notice Initializes facet.
     */
    function initialize() public {
        // No-op initializer.
        // - needed by the deployment script, which expects a no-args initializer on facets other than the config handler
        // - exception here because IBosonAccountHandler is contributed to by multiple facets which do not have their own individual interfaces
    }

    /**
     * @notice Creates a marketplace agent.
     *
     * Emits an AgentCreated event if successful.
     *
     * Reverts if:
     * - The agents region of protocol is paused
     * - Wallet address is zero address
     * - Active is not true
     * - Wallet address is not unique to this agent
     * - Fee percentage + protocol fee percentage is greater than the max allowable fee percentage for an offer
     *
     * @param _agent - the fully populated struct with agent id set to 0x0
     */
    function createAgent(Agent memory _agent) external agentsNotPaused nonReentrant {
        //Check for zero address
        if (_agent.wallet == address(0)) revert InvalidAddress();

        //Check active is not set to false
        if (!_agent.active) revert MustBeActive();

        // Get the next account id and increment the counter
        uint256 agentId = protocolCounters().nextAccountId++;

        //check that the wallet address is unique to one agent id
        if (protocolLookups().agentIdByWallet[_agent.wallet] != 0) revert AgentAddressMustBeUnique();

        _agent.id = agentId;
        storeAgent(_agent);

        //Notify watchers of state change
        emit AgentCreated(_agent.id, _agent, _msgSender());
    }

    /**
     * @notice Updates an agent, with the exception of the active flag.
     *         All other fields should be filled, even those staying the same.
     * @dev    Active flag passed in by caller will be ignored. The value from storage will be used.
     *
     * Emits an AgentUpdated event if successful.
     *
     * Reverts if:
     * - The agents region of protocol is paused
     * - Caller is not the wallet address associated with the agent account
     * - Wallet address is zero address
     * - Wallet address is not unique to this agent
     * - Agent does not exist
     * - Fee percentage + protocol fee percentage is greater than the max allowable fee percentage for an offer
     *
     * @param _agent - the fully populated agent struct
     */
    function updateAgent(Agent memory _agent) external agentsNotPaused nonReentrant {
        // Cache protocol lookups for reference
        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();

        // Check for zero address
        if (_agent.wallet == address(0)) revert InvalidAddress();

        bool exists;
        Agent storage agent;

        // Check Agent exists in agents mapping
        (exists, agent) = fetchAgent(_agent.id);

        // Agent must already exist
        if (!exists) revert NoSuchAgent();

        // Get message sender
        address sender = _msgSender();

        // Check that msg.sender is the wallet address for this agent
        if (agent.wallet != sender) revert NotAgentWallet();

        // Check that the wallet address is not associated with another agent or is already associated with the agent passed in
        mapping(address => uint256) storage agentIds = lookups.agentIdByWallet;
        uint256 agentId = agentIds[_agent.wallet];
        if (agentId != 0 && agentId != _agent.id) revert AgentAddressMustBeUnique();

        // Delete current mappings
        delete agentIds[sender];

        // Ignore active flag passed in by caller and set to value in storage.
        _agent.active = agent.active;
        storeAgent(_agent);

        // Notify watchers of state change
        emit AgentUpdated(_agent.id, _agent, sender);
    }

    /**
     * @notice Gets the details about an agent.
     *
     * @param _agentId - the id of the agent to check
     * @return exists - whether the agent was found
     * @return agent - the agent details. See {BosonTypes.Agent}
     */
    function getAgent(uint256 _agentId) external view returns (bool exists, Agent memory agent) {
        return fetchAgent(_agentId);
    }

    /**
     * @notice Stores agent struct in storage
     *
     * @param _agent - the fully populated struct with agent id set
     */
    function storeAgent(Agent memory _agent) internal {
        // Make sure agent fee percentage + protocol fee percentage is less than or equal the max.
        // This will lessen the likelihood that creation of offers using this agent will fail
        if ((_agent.feePercentage + protocolFees().percentage) > protocolLimits().maxTotalOfferFeePercentage)
            revert InvalidAgentFeePercentage();

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
