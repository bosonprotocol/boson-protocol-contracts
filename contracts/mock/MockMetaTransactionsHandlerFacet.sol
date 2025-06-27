// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import { ProtocolBase } from "../protocol/bases/ProtocolBase.sol";

/**
 * @title MockMetaTransactionsHandlerFacet
 *
 * @notice Handles meta-transaction requests
 */
contract MockMetaTransactionsHandlerFacet is ProtocolBase {
    /**
     * @notice Sets the cached chain id value.
     *
     * @param _chainId - chain id
     */
    function setCachedChainId(uint256 _chainId) public {
        protocolMetaTxInfo().cachedChainId = _chainId;
    }
}
