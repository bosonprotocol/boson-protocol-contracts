// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.16;

import "../events/IBosonProtocolInitializationEvents.sol";
import "../events/IBosonConfigEvents.sol";

/**
 * @title IBosonProtocolInitializationHandler
 *
 * @notice Handle initializion of new versions after 2.1.0.
 *
 * The ERC-165 identifier for this interface is: 0x0d8e6e2c
 */
interface IBosonProtocolInitializationHandler is IBosonProtocolInitializationEvents, IBosonConfigEvents {
    /**
     * @notice Gets the current protocol version.
     *
     */
    function getVersion() external view returns (string memory version);
}
