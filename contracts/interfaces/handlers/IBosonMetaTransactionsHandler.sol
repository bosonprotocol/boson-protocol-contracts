// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.35;

import { BosonErrors } from "../../domain/BosonErrors.sol";
import { BosonTypes } from "../../domain/BosonTypes.sol";
import { IBosonMetaTransactionsEvents } from "../events/IBosonMetaTransactionsEvents.sol";

/**
 * @title IBosonMetaTransactionsHandler
 *
 * @notice Manages incoming meta-transactions in the protocol.
 */
interface IBosonMetaTransactionsHandler is IBosonMetaTransactionsEvents, BosonErrors {
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
     * - Function is not allowlisted to be called using metatransactions
     * - Function name does not match the bytes4 version of the function signature
     * - Signature is not valid. Refer to EIP712Lib.verify for details
     *
     * @param _userAddress - the sender of the transaction
     * @param _functionName - the name of the function to be executed
     * @param _functionSignature - the function signature
     * @param _nonce - the nonce value of the transaction
     * @param _signature - meta transaction signature. 
                           If the user is ordinary EOA, it must be ECDSA signature in the format of concatenated r,s,v values. 
                           If the user is a contract, it must be a valid ERC1271 signature.
                           If the user is a EIP-7702 smart account, it can be either a valid ERC1271 signature or a valid ECDSA signature.
     */
    function executeMetaTransaction(
        address _userAddress,
        string memory _functionName,
        bytes calldata _functionSignature,
        uint256 _nonce,
        bytes calldata _signature
    ) external payable returns (bytes memory);

    /**
     * @notice Same as `executeMetaTransaction`, but additionally accepts an
     *         authorization payload that funds-pulling functions can consume
     *         in lieu of an ERC-20 allowance.
     *
     * The protocol parks the payload in transient storage for the duration of
     * the transaction. When `_authorizationType` is ERC3009, `_authorization`
     * is interpreted as `abi.encode(bytes[] queue)`, where each entry is either:
     *   - empty bytes — fall back to safeTransferFrom for that transferFundsIn,
     *   - or `abi.encode(uint256 validAfter, uint256 validBefore, bytes32 nonce,
     *                    uint8 v, bytes32 r, bytes32 s)` — used to call
     *     `receiveWithAuthorization` on the exchange token.
     *
     * Reverts if:
     * - Same conditions as `executeMetaTransaction`
     * - Authorization decoding or token-side authorization check fails
     *
     * @param _userAddress - the sender of the transaction
     * @param _functionName - the name of the function to be executed
     * @param _functionSignature - the function signature
     * @param _nonce - the nonce value of the transaction
     * @param _signature - meta transaction signature (see `executeMetaTransaction`)
     * @param _authorizationType - kind of token-side authorization supplied
     * @param _authorization - opaque authorization payload (see above)
     */
    function executeMetaTransactionWithAuthorization(
        address _userAddress,
        string memory _functionName,
        bytes calldata _functionSignature,
        uint256 _nonce,
        bytes calldata _signature,
        BosonTypes.AuthorizationType _authorizationType,
        bytes calldata _authorization
    ) external payable returns (bytes memory);

    /**
     * @notice Manages allow list of functions that can be executed using metatransactions.
     *
     * Emits a FunctionsAllowlisted event if successful.
     *
     * Reverts if:
     * - Caller is not a protocol admin
     *
     * @param _functionNameHashes - a list of hashed function names (keccak256)
     * @param _isAllowlisted - new allowlist status
     */
    function setAllowlistedFunctions(bytes32[] calldata _functionNameHashes, bool _isAllowlisted) external;

    /**
     * @notice Tells if function can be executed as meta transaction or not.
     *
     * @param _functionNameHash - hashed function name (keccak256)
     * @return isAllowlisted - allowlist status
     */
    function isFunctionAllowlisted(bytes32 _functionNameHash) external view returns (bool isAllowlisted);

    /**
     * @notice Tells if function can be executed as meta transaction or not.
     *
     * @param _functionName - function name
     * @return isAllowlisted - allowlist status
     */
    function isFunctionAllowlisted(string calldata _functionName) external view returns (bool isAllowlisted);
}
