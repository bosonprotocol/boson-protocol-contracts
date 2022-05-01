// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import {BosonTypes} from "../../domain/BosonTypes.sol";
import {IBosonMetaTransactionsEvents} from "../events/IBosonMetaTransactionsEvents.sol";

/**
 * @title IBosonMetaTransactionsHandler
 *
 * @notice Manages incoming meta-transactions in the protocol.
 *
 * The ERC-165 identifier for this interface is: 0x44f98e5d // todo
 */
interface IBosonMetaTransactionsHandler is IBosonMetaTransactionsEvents {

    /**
     * @notice Query the latest nonce of an address
     *
     * @param _user - the meta-transaction struct.
     * @return nonce -  The latest nonce for the address.
     */
    function getNonce(address _user) external view returns (uint256 nonce);

    /**
     * @notice Handles the incoming meta transaction.
     *
     * Reverts if:
     * - sender does not match the recovered signer.
     *
     * @param _userAddress  - the sender of the transaction.
     * @param _functionSignature - the function signature.
     * @param _sigR - r part of the signer's signature.
     * @param _sigS - s part of the signer's signature.
     * @param _sigV - v part of the signer's signature.
     */
    function executeMetaTransaction(
        address _userAddress,
        bytes memory _functionSignature,
        bytes32 _sigR,
        bytes32 _sigS,
        uint8 _sigV
    ) external payable returns (bytes memory);
}
