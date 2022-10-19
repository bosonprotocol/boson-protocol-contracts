// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.9;

import { BosonTypes } from "../../domain/BosonTypes.sol";
import { IBosonMetaTransactionsEvents } from "../events/IBosonMetaTransactionsEvents.sol";

/**
 * @title IBosonMetaTransactionsHandler
 *
 * @notice Manages incoming meta-transactions in the protocol.
 *
 * The ERC-165 identifier for this interface is: 0x32f03444
 */
interface IBosonMetaTransactionsHandler is IBosonMetaTransactionsEvents {
    /**
     * @notice Checks nonce and returns true if used already for a specific address.
     *
     * @param _associatedAddress the address for which the nonce should be checked
     * @param _nonce - the nonce that we want to check.
     * @return true if nonce has already been used
     */
    function isUsedNonce(address _associatedAddress, uint256 _nonce) external view returns (bool);

    /**
     * @notice Handles the incoming meta transaction.
     *
     * Reverts if:
     * - The meta-transactions region of protocol is paused
     * - Nonce is already used by the msg.sender for another transaction
     * - Function signature matches executeMetaTransaction
     * - Function name does not match the bytes4 version of the function signature
     * - sender does not match the recovered signer
     * - Any code executed in the signed transaction reverts
     * - Signature is invalid
     *
     * @param _userAddress - the sender of the transaction
     * @param _functionName - the name of the function to be executed
     * @param _functionSignature - the function signature
     * @param _nonce - the nonce value of the transaction
     * @param _sigR - r part of the signer's signature
     * @param _sigS - s part of the signer's signature
     * @param _sigV - v part of the signer's signature
     */
    function executeMetaTransaction(
        address _userAddress,
        string memory _functionName,
        bytes calldata _functionSignature,
        uint256 _nonce,
        bytes32 _sigR,
        bytes32 _sigS,
        uint8 _sigV
    ) external payable returns (bytes memory);

    /**
     * @notice Manages allow list of functions that can be executed using metatransactions.
     *
     * Emits a FunctionsWhitelisted event if successful.
     *
     * Reverts if:
     * - Caller is not a protocol admin
     *
     * @param _functionNames - the list of function names
     * @param _isAllowed - new whitelist status
     */
    function setAllowedFunctions(string[] calldata _functionNames, bool _isAllowed) external;

    /**
     * @notice Tells if function can be executed as meta transaction or not.
     *
     * @param _functionName - the function name
     * @return isAllowed - whitelist status
     */
    function isFunctionAllowed(string calldata _functionName) external view returns (bool isAllowed);
}
