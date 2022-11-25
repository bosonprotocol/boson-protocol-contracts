// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.9;

import "../events/IBosonProtocolInitializationEvents.sol";

interface IBosonProtocolInitializationHandler is IBosonProtocolInitializationEvents {

 function getVersion() external pure returns (string memory version);
}
