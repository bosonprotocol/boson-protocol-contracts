// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import "../../domain/BosonConstants.sol";
import { BosonErrors } from "../../domain/BosonErrors.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";
import { IERC1271 } from "@openzeppelin/contracts/interfaces/IERC1271.sol";

/**
 * @title EIP712Lib
 *
 * @dev Provides the domain separator and chain id.
 */
library EIP712Lib {
    struct ECDSASignature {
        bytes32 r;
        bytes32 s;
        uint8 v;
    }

    /**
     * @notice Generates the domain separator hash.
     * @dev Using the chainId as the salt enables the client to be active on one chain
     * while a metatx is signed for a contract on another chain. That could happen if the client is,
     * for instance, a metaverse scene that runs on one chain while the contracts it interacts with are deployed on another chain.
     *
     * @param _name - the name of the protocol
     * @param _version -  The version of the protocol
     * @return the domain separator hash
     */
    function buildDomainSeparator(string memory _name, string memory _version) internal view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    EIP712_DOMAIN_TYPEHASH,
                    keccak256(bytes(_name)),
                    keccak256(bytes(_version)),
                    address(this),
                    block.chainid
                )
            );
    }

    /**
     * @notice Verifies that the signer really signed the message.
     * It works for both ECDSA signatures and ERC1271 signatures.
     *
     * Reverts if:
     * - Signer is the zero address
     * - Signer is a contract that does not implement ERC1271
     * - Signer is a contract that implements ERC1271 but returns an unexpected value
     * - Signer is a contract that reverts when called with the signature
     * - Signer is an EOA but the signature is not a valid ECDSA signature
     * - Recovered signer does not match the user address
     *
     * @param _user  - the message signer
     * @param _hashedMessage - hashed message
     * @param _signature - signature. If the signer is EOA, it must be ECDSA signature in the format of (r,s,v) struct, otherwise, it must be a valid ERC1271 signature.
     */
    function verify(address _user, bytes32 _hashedMessage, bytes calldata _signature) internal {
        if (_user == address(0)) revert BosonErrors.InvalidAddress();

        bytes32 typedMessageHash = toTypedMessageHash(_hashedMessage);

        // Check if user is a contract implementing ERC1271
        bytes memory returnData; // Make this available for later if needed
        if (_user.code.length > 0) {
            bool success;
            (success, returnData) = _user.staticcall(
                abi.encodeCall(IERC1271.isValidSignature, (typedMessageHash, _signature))
            );
            if (success) {
                if (returnData.length != SLOT_SIZE) {
                    revert BosonErrors.UnexpectedDataReturned(returnData);
                } else {
                    // Make sure that the lowest 224 bits (28 bytes) are not set
                    if (uint256(bytes32(returnData)) & type(uint224).max != 0) {
                        revert BosonErrors.UnexpectedDataReturned(returnData);
                    }

                    if (abi.decode(returnData, (bytes4)) != IERC1271.isValidSignature.selector)
                        revert BosonErrors.SignatureValidationFailed();

                    return;
                }
            }
        }

        address signer;
        // If the user is not a contract or the call to ERC1271 failed, we assume it's an ECDSA signature
        if (_signature.length == 65) {
            ECDSASignature memory ecdsaSig = ECDSASignature({
                r: bytes32(_signature[0:32]),
                s: bytes32(_signature[32:64]),
                v: uint8(_signature[64])
            });

            // Ensure signature is unique
            // See https://github.com/OpenZeppelin/openzeppelin-contracts/blob/04695aecbd4d17dddfd55de766d10e3805d6f42f/contracts/cryptography/ECDSA.sol#63
            if (
                uint256(ecdsaSig.s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0 ||
                (ecdsaSig.v != 27 && ecdsaSig.v != 28)
            ) revert BosonErrors.InvalidSignature();

            signer = ecrecover(typedMessageHash, ecdsaSig.v, ecdsaSig.r, ecdsaSig.s);
            if (signer == address(0)) revert BosonErrors.InvalidSignature();
        }

        if (signer != _user) {
            if (returnData.length > 0) {
                // In case 1271 verification failed with a revert reason, bubble it up

                /// @solidity memory-safe-assembly
                assembly {
                    revert(add(SLOT_SIZE, returnData), mload(returnData))
                }
            }

            revert BosonErrors.SignatureValidationFailed();
        }
    }

    /**
     * @notice Gets the domain separator from storage if matches with the chain id and diamond address, else, build new domain separator.
     *
     * @return the domain separator
     */
    function getDomainSeparator() private returns (bytes32) {
        ProtocolLib.ProtocolMetaTxInfo storage pmti = ProtocolLib.protocolMetaTxInfo();
        uint256 cachedChainId = pmti.cachedChainId;

        if (block.chainid == cachedChainId) {
            return pmti.domainSeparator;
        } else {
            bytes32 domainSeparator = buildDomainSeparator(PROTOCOL_NAME, PROTOCOL_VERSION);
            pmti.domainSeparator = domainSeparator;
            pmti.cachedChainId = block.chainid;

            return domainSeparator;
        }
    }

    /**
     * @notice Generates EIP712 compatible message hash.
     *
     * @dev Accepts message hash and returns hash message in EIP712 compatible form
     * so that it can be used to recover signer from signature signed using EIP712 formatted data
     * https://eips.ethereum.org/EIPS/eip-712
     * "\\x19" makes the encoding deterministic
     * "\\x01" is the version byte to make it compatible to EIP-191
     *
     * @param _messageHash  - the message hash
     * @return the EIP712 compatible message hash
     */
    function toTypedMessageHash(bytes32 _messageHash) internal returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", getDomainSeparator(), _messageHash));
    }

    /**
     * @notice Gets the current message sender address from storage.
     *
     * @return the the current message sender address from storage
     */
    function getCurrentSenderAddress() internal view returns (address) {
        return ProtocolLib.protocolMetaTxInfo().currentSenderAddress;
    }

    /**
     * @notice Returns the message sender address.
     *
     * @dev Could be msg.sender or the message sender address from storage (in case of meta transaction).
     *
     * @return the message sender address
     */
    function msgSender() internal view returns (address) {
        bool isItAMetaTransaction = ProtocolLib.protocolMetaTxInfo().isMetaTransaction;

        // Get sender from the storage if this is a meta transaction
        if (isItAMetaTransaction) {
            address sender = getCurrentSenderAddress();
            if (sender == address(0)) revert BosonErrors.InvalidAddress();

            return sender;
        } else {
            return msg.sender;
        }
    }
}
