// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts v4.4.1 (token/ERC721/IERC721.sol)

pragma solidity ^0.8.0;

import "./IERC165.sol";

/**
 * @title ITwinToken
 *
 * @notice The minimum interface a Twin token must expose to be supported by the Boson Protocol
 */
interface ITwinToken is IERC165 {
    /**
     * @notice Returns true if the `operator` is allowed to manage the assets of `owner`.
     *
     * @param _owner - the token owner address.
     * @param _operator - the operator address.
     * @return _isApproved - the approval was found.
     */
    function isApprovedForAll(address _owner, address _operator) external view returns (bool _isApproved);
}
