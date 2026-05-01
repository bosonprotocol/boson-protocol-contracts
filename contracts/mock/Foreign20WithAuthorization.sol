// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import { Foreign20 } from "./Foreign20.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title Foreign20WithAuthorization
 *
 * @notice Mock ERC-20 that implements ERC-3009 `receiveWithAuthorization` (FiatTokenV2 / USDC style).
 *         Used by the protocol's ERC-3009 tests. EIP-712 domain matches the Foreign20 base.
 */
contract Foreign20WithAuthorization is Foreign20 {
    // keccak256("ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)")
    bytes32 public constant RECEIVE_WITH_AUTHORIZATION_TYPEHASH =
        0xd099cc98ef71107a616c4f0f941f04c322d8e254fe26b3c6668db87aae413de8;
    // keccak256("CancelAuthorization(address authorizer,bytes32 nonce)")
    bytes32 public constant CANCEL_AUTHORIZATION_TYPEHASH =
        0x158b0a9edf7a828aad02f63cd515c68ef2f50ba807396f6d12842833a1597429;

    mapping(address => mapping(bytes32 => bool)) private _authorizationStates;

    error AuthorizationUsedOrCanceled();
    error AuthorizationNotYetValid();
    error AuthorizationExpired();
    error InvalidAuthorizationCaller();
    error InvalidSigner();

    event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce);
    event AuthorizationCanceled(address indexed authorizer, bytes32 indexed nonce);

    // keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
    bytes32 private constant EIP712_DOMAIN_TYPEHASH_3009 =
        0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f;

    /**
     * @notice Standard EIP-712 domain separator (USDC-style). Independent of the Polygon-style
     * `MockEIP712Base` separator inherited via `Foreign20`, which uses a non-standard
     * `(name,version,verifyingContract,salt)` layout.
     */
    function DOMAIN_SEPARATOR() public view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    EIP712_DOMAIN_TYPEHASH_3009,
                    keccak256(bytes(TOKEN_NAME)),
                    keccak256(bytes(ERC712_VERSION)),
                    block.chainid,
                    address(this)
                )
            );
    }

    function authorizationState(address authorizer, bytes32 nonce) external view returns (bool) {
        return _authorizationStates[authorizer][nonce];
    }

    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        if (to != msg.sender) revert InvalidAuthorizationCaller();
        if (block.timestamp <= validAfter) revert AuthorizationNotYetValid();
        if (block.timestamp >= validBefore) revert AuthorizationExpired();
        if (_authorizationStates[from][nonce]) revert AuthorizationUsedOrCanceled();

        bytes32 structHash = keccak256(
            abi.encode(RECEIVE_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR(), structHash));

        address recovered = ECDSA.recover(digest, v, r, s);
        if (recovered != from) revert InvalidSigner();

        _authorizationStates[from][nonce] = true;
        emit AuthorizationUsed(from, nonce);

        _transfer(from, to, value);
    }

    function cancelAuthorization(address authorizer, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external {
        if (_authorizationStates[authorizer][nonce]) revert AuthorizationUsedOrCanceled();

        bytes32 structHash = keccak256(abi.encode(CANCEL_AUTHORIZATION_TYPEHASH, authorizer, nonce));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR(), structHash));

        address recovered = ECDSA.recover(digest, v, r, s);
        if (recovered != authorizer) revert InvalidSigner();

        _authorizationStates[authorizer][nonce] = true;
        emit AuthorizationCanceled(authorizer, nonce);
    }
}

/**
 * @title Foreign20WithAuthorizationFeeOnTransfer
 *
 * @notice ERC-3009 mock that under-delivers by 1 wei to verify the protocol's
 *         balance-before/after defensive check raises `InsufficientValueReceived`.
 */
contract Foreign20WithAuthorizationFeeOnTransfer is Foreign20WithAuthorization {
    function _afterTokenTransfer(address from, address to, uint256 amount) internal virtual override {
        if (to != address(0) && from != address(0) && amount > 0) {
            _burn(to, 1);
        }
        super._afterTokenTransfer(from, to, amount);
    }
}
