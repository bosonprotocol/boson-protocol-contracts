// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

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
     * @return domainSeparator - the domain separator of the protocol.
     */
    function domainSeparator(string memory _name, string memory _version) internal view returns (bytes32 domainSeparator) {
        domainSeparator = keccak256(
            abi.encode(EIP712_DOMAIN_TYPEHASH, keccak256(bytes(_name)), keccak256(bytes(_version)), getChainID(), address(this))
        );
    }

    /**
     * @dev Get the chain id
     *
     * @return id - the chain id, 1 for Ethereum mainnet, > 1 for public testnets.
     */
    function getChainID() internal view returns (uint256 id) {
        assembly {
            id := chainid()
        }
    }
}
