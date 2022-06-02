// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { ProtocolLib } from "../libs/ProtocolLib.sol";

/**
 * @title MetaTransactionsLib
 *
 * @dev Provides the domain seperator and chain id.
 */
library MetaTransactionsLib {
    bytes32 internal constant EIP712_DOMAIN_TYPEHASH = keccak256(bytes("EIP712Domain(string name,string version,bytes32 salt,address verifyingContract)"));

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
}
