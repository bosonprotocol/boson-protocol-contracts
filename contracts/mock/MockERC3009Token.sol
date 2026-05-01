// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockERC3009Token
 *
 * @notice Minimal ERC-20 + ERC-3009 (`receiveWithAuthorization`) implementation
 * used in tests. The signed authorization payload follows the EIP-3009 layout:
 *
 *   keccak256(
 *       abi.encode(
 *           RECEIVE_WITH_AUTHORIZATION_TYPEHASH,
 *           from, to, value, validAfter, validBefore, nonce
 *       )
 *   )
 *
 * wrapped in the EIP-712 domain of this token contract. Per-`from` `nonce`
 * values are single-use.
 */
contract MockERC3009Token is ERC20 {
    bytes32 public constant RECEIVE_WITH_AUTHORIZATION_TYPEHASH =
        keccak256(
            "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
        );

    bytes32 private constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    string public constant ERC712_VERSION = "1";

    bytes32 private immutable _domainSeparator;

    mapping(address => mapping(bytes32 => bool)) public authorizationState;

    error InvalidAuthorization();
    error AuthorizationUsed();
    error AuthorizationNotYetValid();
    error AuthorizationExpired();
    error CallerMustBeRecipient();

    constructor(string memory _name, string memory _symbol) ERC20(_name, _symbol) {
        _domainSeparator = keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                keccak256(bytes(_name)),
                keccak256(bytes(ERC712_VERSION)),
                block.chainid,
                address(this)
            )
        );
    }

    function mint(address _account, uint256 _amount) external {
        _mint(_account, _amount);
    }

    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparator;
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
        if (msg.sender != to) revert CallerMustBeRecipient();
        if (block.timestamp <= validAfter) revert AuthorizationNotYetValid();
        if (block.timestamp >= validBefore) revert AuthorizationExpired();
        if (authorizationState[from][nonce]) revert AuthorizationUsed();

        bytes32 structHash = keccak256(
            abi.encode(RECEIVE_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator, structHash));
        address recovered = ecrecover(digest, v, r, s);
        if (recovered == address(0) || recovered != from) revert InvalidAuthorization();

        authorizationState[from][nonce] = true;
        _transfer(from, to, value);
    }
}
