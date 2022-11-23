// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.9;

import "../events/IBosonProtocolInitializationEvents.sol";

interface IBosonProtocolInitializationHandler is IBosonProtocolInitializationEvents {
    function initialize(string calldata _version) external;
}
