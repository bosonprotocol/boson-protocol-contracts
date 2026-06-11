// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import {
    OptimisticOracleV3CallbackRecipientInterface
} from "../interfaces/clients/OptimisticOracleV3CallbackRecipientInterface.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title MockOptimisticOracleV3
 * @notice Simplified mock implementation of UMA's OptimisticOracleV3 for testing UMADisputeResolverAdapter
 * @dev This mock only implements the minimal functionality needed for testing:
 *      - Simple bond management (getter/setter)
 *      - Basic assertTruth that returns predictable IDs
 *      - Direct callback triggers for testing adapter callbacks
 */
contract MockOptimisticOracleV3 {
    mapping(address => uint256) public minimumBonds;

    uint256 private constant DEFAULT_MINIMUM_BOND = 1e18; // 1 token

    /**
     * @notice Get minimum bond for a currency
     * @param currency The currency address
     * @return The minimum bond amount
     */
    function getMinimumBond(address currency) external view returns (uint256) {
        uint256 customBond = minimumBonds[currency];
        return customBond > 0 ? customBond : DEFAULT_MINIMUM_BOND;
    }

    /**
     * @notice Set minimum bond for testing purposes
     * @param currency The currency address
     * @param bond The minimum bond amount
     */
    function setMinimumBond(address currency, uint256 bond) external {
        minimumBonds[currency] = bond;
    }

    /**
     * @notice Simplified assertion creation for testing
     * @param claim The claim being asserted
     * @param asserter The account that will receive the bond back
     * @param currency The currency for the bond
     * @param bond The bond amount
     * @return assertionId The unique assertion identifier
     */
    function assertTruth(
        bytes memory claim,
        address asserter,
        address, // callbackRecipient - not used in simplified mock
        address, // escalationManager - not used in simplified mock
        uint64, // liveness - not used in simplified mock
        IERC20 currency,
        uint256 bond,
        bytes32, // identifier - not used in simplified mock
        bytes32 // domainId - not used in simplified mock
    ) external returns (bytes32 assertionId) {
        require(asserter != address(0), "Asserter cannot be zero");
        require(bond >= this.getMinimumBond(address(currency)), "Bond too low");

        // Transfer bond from caller for realistic testing
        currency.transferFrom(msg.sender, address(this), bond);

        // Generate simple, predictable assertion ID
        assertionId = keccak256(abi.encode(claim, asserter, block.timestamp, msg.sender));

        return assertionId;
    }

    /**
     * @notice Test helper to trigger resolved callback on the adapter
     * @param callbackRecipient The adapter address to call back
     * @param assertionId The assertion ID
     * @param assertedTruthfully Whether the assertion was deemed truthful
     */
    function triggerResolvedCallback(address callbackRecipient, bytes32 assertionId, bool assertedTruthfully) external {
        OptimisticOracleV3CallbackRecipientInterface(callbackRecipient).assertionResolvedCallback(
            assertionId,
            assertedTruthfully
        );
    }

    /**
     * @notice Test helper to trigger disputed callback on the adapter
     * @param callbackRecipient The adapter address to call back
     * @param assertionId The assertion ID
     */
    function triggerDisputedCallback(address callbackRecipient, bytes32 assertionId) external {
        OptimisticOracleV3CallbackRecipientInterface(callbackRecipient).assertionDisputedCallback(assertionId);
    }
}
