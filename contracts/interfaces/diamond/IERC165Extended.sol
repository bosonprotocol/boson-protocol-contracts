// SPDX-License-Identifier: MIT
pragma solidity 0.8.21;

/**
 * @title IDiamondCut
 *
 * @notice Extension of ERC165 interface
 *
 * The ERC-165 identifier for this interface is: 0x2ae6ea10
 *
 */
interface IERC165Extended {
    /**
     * @notice Adds a supported interface to the Diamond.
     *
     * @param _interfaceId - the interface to add
     */
    function addSupportedInterface(bytes4 _interfaceId) external;

    /**
     * @notice Removes a supported interface from the Diamond.
     *
     * @param _interfaceId - the interface to remove
     */
    function removeSupportedInterface(bytes4 _interfaceId) external;
}
