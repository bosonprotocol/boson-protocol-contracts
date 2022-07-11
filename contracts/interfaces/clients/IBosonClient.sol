// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import { IAccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/IAccessControlUpgradeable.sol";
import { IBosonClientEvents } from "../events/IBosonClientEvents.sol";

/**
 * @title IBosonClient
 *
 * @notice Delegates calls to a Boson Protocol client implementation contract,
 * such that functions on it execute in the context (address, storage)
 * of this proxy, allowing the implementation contract to be upgraded
 * without losing the accumulated state data.
 *
 * Protocol clients are any contracts that communicate with the the ProtocolDiamond
 * from the outside, rather than acting as facets themselves. Protocol
 * client contracts will be deployed behind their own proxies for upgradeability.
 *
 * Example:
 * The BosonVoucher NFT contract acts as a client of the ProtocolDiamond when
 * accessing information about offers associated with the vouchers it maintains.
 *
 * The ERC-165 identifier for this interface is: 0xc4c6c36b
 */
interface IBosonClient is IBosonClientEvents {
    /**
     * @dev Set the implementation address
     */
    function setImplementation(address _implementation) external;

    /**
     * @dev Get the implementation address
     */
    function getImplementation() external view returns (address);

    /**
     * @notice Set the AccessController address
     *
     * Emits an AccessControllerAddressChanged event.
     *
     * @param _accessController - the AccessController address
     */
    function setAccessController(address _accessController) external;

    /**
     * @notice Gets the address of the AccessController.
     *
     * @return the address of the AccessController
     */
    function getAccessController() external view returns (IAccessControlUpgradeable);

    /**
     * @notice Set the ProtocolDiamond address
     *
     * Emits an ProtocolAddressChanged event.
     *
     * @param _protocol - the ProtocolDiamond address
     */
    function setProtocolAddress(address _protocol) external;

    /**
     * @notice Gets the address of the ProtocolDiamond
     *
     * @return the address of the ProtocolDiamond
     */
    function getProtocolAddress() external view returns (address);
}
