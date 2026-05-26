// SPDX-License-Identifier: MIT
pragma solidity 0.8.35;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockDAIPermitToken
 *
 * @notice Minimal ERC-20 with a DAI-style (non-EIP-2612) `permit`. Matches the
 * shape used by canonical Maker DAI on Ethereum mainnet and Polygon PoS:
 *
 *   permit(holder, spender, nonce, expiry, allowed, v, r, s)
 *
 * with the EIP-712 typehash
 *
 *   keccak256("Permit(address holder,address spender,uint256 nonce,uint256 expiry,bool allowed)")
 *
 * The approval is binary: `allowed=true` ⇒ `MAX_UINT256`, `false` ⇒ `0`. Nonces
 * are monotonically increasing per holder and are supplied in calldata (must
 * match `nonces[holder]` at the time of the call). `expiry == 0` means the
 * signature never expires.
 */
contract MockDAIPermitToken is ERC20 {
    // keccak256("Permit(address holder,address spender,uint256 nonce,uint256 expiry,bool allowed)")
    bytes32 public constant PERMIT_TYPEHASH = 0xea2aa0a1be11a07ed86d755c93467f4f82362b452371d1ba94d1715123511acb;

    bytes32 private constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    string public constant DAI_PERMIT_VERSION = "1";

    bytes32 private immutable _domainSeparator;

    mapping(address => uint256) public nonces;

    error InvalidPermit();
    error PermitExpired();
    error InvalidNonce();

    constructor(string memory _name, string memory _symbol) ERC20(_name, _symbol) {
        _domainSeparator = keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                keccak256(bytes(_name)),
                keccak256(bytes(DAI_PERMIT_VERSION)),
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

    function permit(
        address holder,
        address spender,
        uint256 nonce,
        uint256 expiry,
        bool allowed,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        if (expiry != 0 && block.timestamp > expiry) revert PermitExpired();
        if (nonce != nonces[holder]) revert InvalidNonce();

        bytes32 structHash = keccak256(abi.encode(PERMIT_TYPEHASH, holder, spender, nonce, expiry, allowed));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparator, structHash));
        address recovered = ecrecover(digest, v, r, s);
        if (recovered == address(0) || recovered != holder) revert InvalidPermit();

        nonces[holder] = nonce + 1;
        _approve(holder, spender, allowed ? type(uint256).max : 0);
    }
}
