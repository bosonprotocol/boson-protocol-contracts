// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title MockPermit2
 *
 * @notice Minimal Uniswap-Permit2 stand-in covering only `permitTransferFrom`
 * (the SignatureTransfer flow used by the protocol's authorization queue).
 *
 * Verifies the EIP-712 signature against an unordered nonce bitmap, then
 * pulls funds from `owner` via the token's standard `transferFrom`. This
 * mirrors the production Permit2 contract's behavior closely enough that
 * tests exercise the same call path as mainnet.
 *
 * In tests, deploy this contract and inject its bytecode at the canonical
 * Permit2 address `0x000000000022D473030F116dDEE9F6B43aC78BA3` via
 * `hardhat_setCode` so `TransientAuthLib.PERMIT2` resolves to it.
 */
contract MockPermit2 {
    string public constant NAME = "Permit2";

    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,uint256 chainId,address verifyingContract)");
    bytes32 private constant TOKEN_PERMISSIONS_TYPEHASH = keccak256("TokenPermissions(address token,uint256 amount)");
    bytes32 private constant PERMIT_TRANSFER_FROM_TYPEHASH =
        keccak256(
            "PermitTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline)TokenPermissions(address token,uint256 amount)"
        );

    struct TokenPermissions {
        address token;
        uint256 amount;
    }

    struct PermitTransferFrom {
        TokenPermissions permitted;
        uint256 nonce;
        uint256 deadline;
    }

    struct SignatureTransferDetails {
        address to;
        uint256 requestedAmount;
    }

    // owner => wordPos => bitmap (256 bits per word)
    mapping(address => mapping(uint256 => uint256)) public nonceBitmap;

    error PermitExpired();
    error InvalidAmount();
    error InvalidSignatureLength();
    error InvalidSigner();
    error NonceUsed();

    function DOMAIN_SEPARATOR() public view returns (bytes32) {
        return
            keccak256(
                abi.encode(DOMAIN_TYPEHASH, keccak256(bytes(NAME)), block.chainid, address(this))
            );
    }

    function permitTransferFrom(
        PermitTransferFrom memory permit,
        SignatureTransferDetails calldata transferDetails,
        address owner,
        bytes calldata signature
    ) external {
        if (block.timestamp > permit.deadline) revert PermitExpired();
        if (transferDetails.requestedAmount > permit.permitted.amount) revert InvalidAmount();

        _useUnorderedNonce(owner, permit.nonce);

        bytes32 tokenPermissionsHash = keccak256(
            abi.encode(TOKEN_PERMISSIONS_TYPEHASH, permit.permitted.token, permit.permitted.amount)
        );
        bytes32 dataHash = keccak256(
            abi.encode(PERMIT_TRANSFER_FROM_TYPEHASH, tokenPermissionsHash, msg.sender, permit.nonce, permit.deadline)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR(), dataHash));

        if (signature.length != 65) revert InvalidSignatureLength();
        bytes32 r;
        bytes32 s;
        uint8 v;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        address recovered = ecrecover(digest, v, r, s);
        if (recovered == address(0) || recovered != owner) revert InvalidSigner();

        IERC20(permit.permitted.token).transferFrom(owner, transferDetails.to, transferDetails.requestedAmount);
    }

    function _useUnorderedNonce(address _owner, uint256 _nonce) private {
        uint256 wordPos = _nonce >> 8;
        uint256 bitPos = _nonce & 0xff;
        uint256 bit = 1 << bitPos;
        uint256 word = nonceBitmap[_owner][wordPos];
        if (word & bit != 0) revert NonceUsed();
        nonceBitmap[_owner][wordPos] = word | bit;
    }
}
