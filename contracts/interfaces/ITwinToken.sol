// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts v4.4.1 (token/ERC721/IERC721.sol)

pragma solidity 0.8.9;

import "./IERC165.sol";

/**
 * @title ITwinToken
 *
 * @notice Provides the minimum interface a Twin token must expose to be supported by the Boson Protocol
 */
interface ITwinToken is IERC165 {
    /**
     * @notice Returns true if the `assistant` is allowed to manage the assets of `owner`.
     *
     * @param _owner - the token owner address.
     * @param _assistant - the assistant address.
     * @return _isApproved - the approval was found.
     */
    function isApprovedForAll(address _owner, address _assistant) external view returns (bool _isApproved);

    /**
     * @notice Returns the remaining number of tokens that `_assistant` will be
     * allowed to spend on behalf of `_owner` through {transferFrom}. This is
     * zero by default.
     *
     * This value changes when {approve} or {transferFrom} are called.
     *
     * @param _owner - the owner address
     * @param _assistant - the assistant address
     * @return The remaining amount allowed
     */
    function allowance(address _owner, address _assistant) external view returns (uint256);
}
