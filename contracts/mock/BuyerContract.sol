// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import { IERC721Receiver } from "../interfaces/IERC721Receiver.sol";

/**
 * @title BuyerContract
 *
 * @notice Contract that acts as a buyer for testing purposes
 */
contract BuyerContract is IERC721Receiver {
    enum FailType {
        None,
        Revert,
        ReturnWrongSelector
    }

    FailType public failType;

    /**
     * @dev Set fail type
     */
    function setFailType(FailType _failType) external {
        failType = _failType;
    }

    /**
     * @dev Return wrong selector to test revert
     */
    function onERC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes calldata data
    ) external returns (bytes4) {
        if (failType == FailType.Revert) revert("BuyerContract: revert");
        if (failType == FailType.ReturnWrongSelector) return 0x12345678;
        return IERC721Receiver.onERC721Received.selector;
    }
}
