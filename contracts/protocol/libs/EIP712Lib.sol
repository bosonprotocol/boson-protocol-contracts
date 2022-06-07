// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { ProtocolLib } from "../libs/ProtocolLib.sol";
import { INVALID_SIGNATURE } from "../../domain/BosonConstants.sol";

/**
 * @title EIP712Lib
 *
 * @dev Provides the domain seperator and chain id.
 */
library EIP712Lib {
    bytes32 internal constant EIP712_DOMAIN_TYPEHASH = keccak256(bytes("EIP712Domain(string name,string version,address verifyingContract,bytes32 salt)"));

    /**
     * @notice Get the domain separator
     *
     * @param _name - the name of the protocol.
     * @param _version -  The version of the protocol.
     */
    function domainSeparator(string memory _name, string memory _version) internal view returns (bytes32) {
        return keccak256(
            abi.encode(EIP712_DOMAIN_TYPEHASH, keccak256(bytes(_name)), keccak256(bytes(_version)), address(this), getChainID())
        );
    }

    /**
     * @notice Get the chain id
     *
     * @return id - the chain id, 1 for Ethereum mainnet, > 1 for public testnets.
     */
    function getChainID() internal view returns (uint256 id) {
        assembly {
            id := chainid()
        }
    }

    /**
     * @notice Recovers the Signer from the Signature components.
     *
     * Reverts if:
     * - signer is a zero address
     *
     * @param _user  - the sender of the transaction.
     * @param _hashedMetaTx - hashed meta transaction.
     * @param _sigR - r part of the signer's signature.
     * @param _sigS - s part of the signer's signature.
     * @param _sigV - v part of the signer's signature.
     */
    function verify(
        address _user,
        bytes32 _hashedMetaTx,
        bytes32 _sigR,
        bytes32 _sigS,
        uint8 _sigV
    ) internal view returns (bool) {
        address signer = ecrecover(toTypedMessageHash(_hashedMetaTx), _sigV, _sigR, _sigS);
        require(signer != address(0), INVALID_SIGNATURE);
        return signer == _user;
    }

    /**
     * @notice Get the domain separator.
     */
    function getDomainSeparator() private view returns (bytes32) {
        return ProtocolLib.protocolMetaTxInfo().domainSeparator;
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
}
