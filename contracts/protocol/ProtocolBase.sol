// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import "./ProtocolLib.sol";
import "../diamond/DiamondLib.sol";
import "../domain/BosonTypes.sol";
import "../domain/BosonConstants.sol";

/**
 * @title ProtocolBase
 *
 * @notice Provides domain and common modifiers to Protocol facets
 */
abstract contract ProtocolBase is BosonTypes, BosonConstants {

    /**
     * @dev Modifier that checks that an offer exists
     *
     * Reverts if the offer does not exist
     */
    modifier offerExists(uint256 _offerId) {

        ProtocolLib.ProtocolStorage storage ps = ProtocolLib.protocolStorage();

        // Make sure the offer exists
        require(_offerId < ps.nextOfferId, "Offer does not exist");
        _;
    }

    /**
     * @dev Modifier that checks that the caller has a specific role.
     *
     * Reverts if caller doesn't have role.
     *
     * See: {AccessController.hasRole}
     */
    modifier onlyRole(bytes32 _role) {
        DiamondLib.DiamondStorage storage ds = DiamondLib.diamondStorage();
        require(ds.accessController.hasRole(_role, msg.sender), "Access denied, caller doesn't have role");
        _;
    }

    /**
     * @dev Get the Protocol Storage slot
     *
     * @return ps the Protocol Storage slot
     */
    function protocolStorage() internal pure returns (ProtocolLib.ProtocolStorage storage ps) {
        ps = ProtocolLib.protocolStorage();
    }

}