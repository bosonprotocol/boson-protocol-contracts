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

    /**
     * @notice ERC-20 style non-fungible token transfer
     *
     * @param from the address to transfer from
     * @param to the address to transfer to
     * @param value the amount to transfer
     * @return success whether the transfer succeeded
     */
    function transferFrom(
        address from,
        address to,
        uint256 value
    ) external returns (bool success);

    /**
     * @notice ERC-721 style fungible token transfer
     *
     * @param _from the address to transfer from
     * @param _to the address to transfer to
     * @param _tokenId the token to transfer
     * @param _data the passthru data field
     */
    function safeTransferFrom(
        address _from,
        address _to,
        uint256 _tokenId,
        bytes calldata _data
    ) external payable;

    /**
     * @notice ERC-1155 style multi-token transfer
     *
     * @param _from the address to transfer from
     * @param _to the address to transfer to
     * @param _id the token to transfer
     * @param _value the amount to transfer
     * @param _data the passthru data field
     */
    function safeTransferFrom(
        address _from,
        address _to,
        uint256 _id,
        uint256 _value,
        bytes calldata _data
    ) external;
}
