// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import { IAccessControl } from "../../interfaces/IAccessControl.sol";
import { IBosonConfigHandler } from "../../interfaces/handlers/IBosonConfigHandler.sol";
import { EIP712Lib } from "../libs/EIP712Lib.sol";

/**
 * @title ClientLib
 *
 * @notice
 * - Defines storage slot structure
 * - Provides slot accessor
 * - Defines hasRole function
 */
library ClientLib {
    struct ProxyStorage {
        // The ProtocolDiamond address
        address protocolDiamond;
        // The client implementation address
        address implementation;
    }

    /**
     * @dev Storage slot with the address of the Boson Protocol AccessController
     *
     * This is obviously not a standard EIP-1967 slot. This is because that standard
     * wants a single piece of data (implementation address) whereas we have several.
     */
    bytes32 internal constant PROXY_SLOT = keccak256("Boson.Protocol.ClientProxy");

    /**
     * @notice Gets the Proxy storage slot.
     *
     * @return ps - Proxy storage slot cast to ProxyStorage
     */
    function proxyStorage() internal pure returns (ProxyStorage storage ps) {
        bytes32 position = PROXY_SLOT;
        assembly {
            ps.slot := position
        }
    }

    /**
     * @notice Checks that the caller has a specific role.
     *
     * Reverts if caller doesn't have role.
     *
     * See: {AccessController.hasRole}
     *
     * @param _role - the role to check
     */
    function hasRole(bytes32 _role) internal view returns (bool) {
        ProxyStorage storage ps = proxyStorage();
        IAccessControl accessController = IAccessControl(
            IBosonConfigHandler(ps.protocolDiamond).getAccessControllerAddress()
        );
        // TODO
        return accessController.hasRole(_role, msg.sender);
    }
}
