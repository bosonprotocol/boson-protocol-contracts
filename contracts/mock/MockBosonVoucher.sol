// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import { BosonVoucherBase, BosonVoucher } from "../protocol/clients/voucher/BosonVoucher.sol";

/**
 * @title MockBosonVoucherBase
 *
 * @notice Test BosonVoucherBase
 */
contract MockBosonVoucherBase is BosonVoucherBase {
    event IncomingData(address sender, bytes data, uint256 contextSuffixLength);
    bytes public data;
    address public sender;

    function testMsgData(bytes calldata) external {
        data = msg.data;
        sender = msg.sender;
        emit IncomingData(_msgSender(), _msgData(), _contextSuffixLength());
    }
}

/**
 * @title MockBosonVoucher
 *
 * @notice Test BosonVoucher
 */
contract MockBosonVoucher is BosonVoucher {
    event IncomingData(address sender, bytes data, uint256 contextSuffixLength);
    bytes public data;
    address public sender;

    constructor(address forwarder) BosonVoucher(forwarder) {}

    function testMsgData(bytes calldata) external {
        data = msg.data;
        sender = msg.sender;
        emit IncomingData(_msgSender(), _msgData(), _contextSuffixLength());
    }
}
