// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts v4.4.1 (token/ERC721/IERC721.sol)

pragma solidity ^0.8.0;

import "./IERC165.sol";

/**
 * @dev Interface of a ERC721 and ERC1155 compliant contract.
 */
interface ITwinToken is IERC165 {
    /**
     * @dev Returns if the `operator` is allowed to manage the assets of `owner`.
     *
     * See {setApprovalForAll}
     */
    function isApprovedForAll(address owner, address operator) external view returns (bool);
}
