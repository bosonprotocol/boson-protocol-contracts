// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

/**
 * @dev Interface to check if spender is approved to use ERC20, ERC721 and ERC1155 tokens.
 */
interface ITokenChecker {
    /**
     * @notice Check if spender is approved to transfer the tokens.
     *
     * @param _tokenAddress - the address of the seller's twin token contract.
     * @param _operator - the seller's operator address.
     * @param _spender - the treasuryAddress of protocol.
     * @return _approved - the approve status.
     */
    function isSpenderApproved(
        address _tokenAddress,
        address _operator,
        address _spender
    ) external view returns (bool);
}
