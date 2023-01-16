// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.9;

// This file is copied/pasted from the BOSON Child Token implementation deployed on Polygon

import { MockEIP712Base } from "./MockEIP712Base.sol";

contract MockNativeMetaTransaction is MockEIP712Base {
    constructor(string memory name, string memory version) {
        _initializeEIP712(name, version);
    }

    bytes32 private constant META_TRANSACTION_TYPEHASH =
        keccak256(bytes("MetaTransaction(uint256 nonce,address from,address to,bytes functionSignature)"));
    event MetaTransactionExecuted(address from, address payable relayerAddress, bytes functionSignature);
    mapping(address => uint256) private nonces;

    /*
     * Meta transaction structure.
     * No point of including value field here as if user is doing value transfer then he has the funds to pay for gas
     * He should call the desired function directly in that case.
     */
    struct MetaTransaction {
        uint256 nonce;
        address from;
        address to;
        bytes functionSignature;
    }

    function executeMetaTransaction(
        MetaTransaction memory metaTx,
        bytes32 sigR,
        bytes32 sigS,
        uint8 sigV
    ) public payable returns (bytes memory) {
        require(verify(metaTx, sigR, sigS, sigV), "Signer and signature do not match");

        // increase nonce for user (to avoid re-use)
        nonces[metaTx.from]++;

        emit MetaTransactionExecuted(metaTx.from, payable(msg.sender), metaTx.functionSignature);

        // Append from and relayer address at the end to extract it from calling context
        (bool success, bytes memory returnData) = metaTx.to.call(
            abi.encodePacked(metaTx.functionSignature, metaTx.from)
        );
        require(success, "Function call not successful");

        return returnData;
    }

    function hashMetaTransaction(MetaTransaction memory metaTx) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    META_TRANSACTION_TYPEHASH,
                    metaTx.nonce,
                    metaTx.from,
                    metaTx.to,
                    keccak256(metaTx.functionSignature)
                )
            );
    }

    function getNonce(address user) public view returns (uint256 nonce) {
        nonce = nonces[user];
    }

    function verify(
        MetaTransaction memory metaTx,
        bytes32 sigR,
        bytes32 sigS,
        uint8 sigV
    ) internal view returns (bool) {
        require(metaTx.from != address(0), "NativeMetaTransaction: INVALID_SIGNER");
        return metaTx.from == ecrecover(toTypedMessageHash(hashMetaTransaction(metaTx)), sigV, sigR, sigS);
    }
}
