// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.35;

import { TokenTransferAuthorizationLib } from "../libs/TokenTransferAuthorizationLib.sol";

/**
 * @title TokenTransferAuthorizationBase
 *
 * @notice A helper contract that protocol facets can inherit to load and clear
 *         token-transfer-authorization queues via a modifier. This is just a
 *         thin wrapper around the internal functions of {TokenTransferAuthorizationLib}
 *         to allow them to be used as a modifier.
 */
contract TokenTransferAuthorizationBase {
    modifier withTokenAuthorization(bytes[] calldata _tokenTransferAuthorization) {
        TokenTransferAuthorizationLib.loadQueue(_tokenTransferAuthorization);
        _;
        TokenTransferAuthorizationLib.clearQueue();
    }
}
