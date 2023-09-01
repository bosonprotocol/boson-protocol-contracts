// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.21;

import { ProtocolBase } from "../protocol/bases/ProtocolBase.sol";

/**
 * @title MockMetaTransactionsHandlerFacet
 *
 * @notice Handles meta-transaction requests
 */
contract MockMetaTransactionsHandlerFacet is ProtocolBase {
    /**
     * @notice Sets the current transaction sender. Also sets isMetaTransaction as true.
     *
     * @param _signerAddress - Address of the transaction signer
     */
    function setAsMetaTransactionAndCurrentSenderAs(address _signerAddress) public {
        protocolMetaTxInfo().isMetaTransaction = true;
        protocolMetaTxInfo().currentSenderAddress = _signerAddress;
    }

    /**
     * @notice Sets the cached chain id value.
     *
     * @param _chainId - chain id
     */
    function setCachedChainId(uint256 _chainId) public {
        protocolMetaTxInfo().cachedChainId = _chainId;
    }
}
