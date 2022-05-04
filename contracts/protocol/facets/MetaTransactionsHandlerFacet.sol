// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import { IBosonMetaTransactionsHandler } from "../../interfaces/handlers/IBosonMetaTransactionsHandler.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { ProtocolBase } from "../bases/ProtocolBase.sol";

/**
 * @title MetaTransactionsHandlerFacet
 *
 * @notice Manages incoming meta-transactions in the protocol.
 */
contract MetaTransactionsHandlerFacet is IBosonMetaTransactionsHandler, ProtocolBase {

    bytes32 private constant META_TRANSACTION_TYPEHASH = keccak256(bytes("MetaTransaction(uint256 nonce,address from,bytes functionSignature)"));

    /**
     * @notice Facet Initializer
     */
    function initialize()
    public
    onlyUnInitialized(type(IBosonMetaTransactionsHandler).interfaceId)
    {
        DiamondLib.addSupportedInterface(type(IBosonMetaTransactionsHandler).interfaceId);
    }

    /**
     * @notice Converts the given bytes to bytes4.
     *
     * @param _inBytes - the incoming bytes
     * @return _outBytes4 -  The outgoing bytes4
     */
    function convertBytesToBytes4(bytes memory _inBytes) internal pure returns (bytes4 _outBytes4) {
        assembly {
            _outBytes4 := mload(add(_inBytes, 32))
        }
    }

    /**
     * @notice Get the domain separator.
     */
    function getDomainSeparator() private view returns (bytes32) {
        return protocolMetaTxInfo().domainSeparator;
    }

    /**
     * @dev Accept message hash and returns hash message in EIP712 compatible form
     * So that it can be used to recover signer from signature signed using EIP712 formatted data
     * https://eips.ethereum.org/EIPS/eip-712
     * "\\x19" makes the encoding deterministic
     * "\\x01" is the version byte to make it compatible to EIP-191
     *
     * @param _messageHash  - the message hash.
     */
    function toTypedMessageHash(bytes32 _messageHash) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", getDomainSeparator(), _messageHash));
    }

    /**
     * @notice Returns hashed meta transaction
     *
     * @param _metaTx  - the meta-transaction struct.
     */
    function hashMetaTransaction(MetaTransaction memory _metaTx) internal pure returns (bytes32) {
        return keccak256(abi.encode(
            META_TRANSACTION_TYPEHASH, _metaTx.nonce, _metaTx.from, keccak256(_metaTx.functionSignature)
        ));
    }

    /**
     * @notice Query the latest nonce of an address
     *
     * @param _user - the meta-transaction struct.
     * @return nonce -  The latest nonce for the address.
     */
    function getNonce(address _user) external view returns (uint256 nonce) {
        nonce = protocolMetaTxInfo().metaNonces[_user];
    }

    /**
     * @notice Recovers the Signer from the Signature components.
     *
     * Reverts if:
     * - signer is a zero address
     *
     * @param _user  - the sender of the transaction.
     * @param _metaTx - the meta-transaction struct.
     * @param _sigR - r part of the signer's signature.
     * @param _sigS - s part of the signer's signature.
     * @param _sigV - v part of the signer's signature.
     */
    function verify(
        address _user,
        MetaTransaction memory _metaTx,
        bytes32 _sigR,
        bytes32 _sigS,
        uint8 _sigV
    ) internal view returns (bool) {
        address signer = ecrecover(toTypedMessageHash(hashMetaTransaction(_metaTx)), _sigV, _sigR, _sigS);
        require(signer != address(0), INVALID_SIGNATURE);
        return signer == _user;
    }

    /**
     * @notice Sets the current transaction sender.
     *
     * @param _signerAddress - Address of the transaction signer.
     */
    function setCurrentSenderAddress(address _signerAddress)
        internal
    {
        protocolMetaTxInfo().currentSenderAddress = _signerAddress;
    }

    /**
     * @notice Handles the incoming meta transaction.
     *
     * Reverts if:
     * - function signature matches to executeMetaTransaction.
     * - sender does not match the recovered signer.
     * - any code executed in the signed transaction reverts.
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
    ) public override payable returns (bytes memory) {
        bytes4 destinationFunctionSig = convertBytesToBytes4(_functionSignature);
        require(destinationFunctionSig != msg.sig, INVALID_FUNCTION_SIGNATURE);

        uint256 nonce = protocolMetaTxInfo().metaNonces[_userAddress];
        MetaTransaction memory metaTx = MetaTransaction({nonce: nonce, from: _userAddress, functionSignature: _functionSignature});
        require(verify(_userAddress, metaTx, _sigR, _sigS, _sigV), SIGNER_AND_SIGNATURE_DO_NOT_MATCH);

        // Increment the nonce.
        protocolMetaTxInfo().metaNonces[_userAddress] = nonce + 1;

        // Set the current transaction signer and transaction type.
        setCurrentSenderAddress(_userAddress);
        protocolMetaTxInfo().isMetaTransaction = true;

        // invoke local function with an external call
        (bool success, bytes memory returnData) = address(this).call(_functionSignature);

        // If error, return error message
        string memory errorMessage = (returnData.length == 0) ? FUNCTION_CALL_NOT_SUCCESSFUL : (string (returnData));
        require(success, errorMessage);

        // Reset current transaction signer and transaction type.
        setCurrentSenderAddress(address(0));
        protocolMetaTxInfo().isMetaTransaction = false;

        emit MetaTransactionExecuted(_userAddress, payable(msg.sender), _functionSignature);
        return returnData;
    }
}
