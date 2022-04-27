// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ProtocolLib} from "../libs/ProtocolLib.sol";

/**
 * @title MetaLib
 *
 * @dev Provides domain seperator and current sender of the transaction.
 */
library MetaLib {
    bytes32 internal constant EIP712_DOMAIN_TYPEHASH = keccak256(bytes("EIP712Domain(string name,string version,uint256 salt,address verifyingContract)"));

    /**
     * @notice Get the domain separator
     *
     * @param _name - the name of the protocol.
     * @param _version -  The version of the protocol.
     */
    function domainSeparator(string memory _name, string memory _version) internal view returns (bytes32) {
        return keccak256(
            abi.encode(EIP712_DOMAIN_TYPEHASH, keccak256(bytes(_name)), keccak256(bytes(_version)), getChainID(), address(this))
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
     * @notice Get the current sender address from storage.
     */
    function getCurrentSenderAddress() internal view returns (address) {
        return ProtocolLib.protocolStorage().currentSenderAddress;
    }

    /**
     * @notice Returns the current sender address.
     *
     * @return sender - The message sender of the transaction.
     */
    function getCaller() internal view returns (address sender) {
        bool isItAMetaTransaction = ProtocolLib.protocolStorage().isMetaTransaction;

        // Check into the storage if this is a meta transaction
        if (isItAMetaTransaction) {
            sender = getCurrentSenderAddress();
        } else {
            sender = msg.sender;
        }
    }
}
