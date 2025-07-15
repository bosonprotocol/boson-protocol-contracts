// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import { DRFeeMutualizer } from "../protocol/clients/DRFeeMutualizer.sol";

/**
 * @title MockDRFeeMutualizer
 * @notice Test DRFeeMutualizer meta-transaction functions
 */
contract MockDRFeeMutualizer is DRFeeMutualizer {
    event IncomingData(address sender, bytes data, uint256 contextSuffixLength);
    bytes public data;
    address public sender;

    constructor(address _bosonProtocol, address _forwarder) DRFeeMutualizer(_bosonProtocol, _forwarder) {}

    function testMsgData(bytes calldata) external {
        data = msg.data;
        sender = msg.sender;
        emit IncomingData(_msgSender(), _msgData(), _contextSuffixLength());
    }
}
