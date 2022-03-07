// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import "../../interfaces/IBosonOfferHandler.sol";
import "../../domain/BosonConstants.sol";
import "../../domain/BosonTypes.sol";
import "./ClientLib.sol";


/**
 * @title ClientBase
 *
 * @notice Extended by Boson Protocol contracts that need to communicate with the
 * ProtocolDiamond, but are NOT facets of the ProtocolDiamond.
 *
 * Boson client contracts include BosonVoucher
 */
abstract contract ClientBase is BosonTypes, BosonConstants {

    /**
     * @dev Modifier that checks that the caller has a specific role.
     *
     * Reverts if:
     * - caller doesn't have role
     *
     * See: {AccessController.hasRole}
     */
    modifier onlyRole(bytes32 role) {
        require(ClientLib.hasRole(role), "Access denied, caller doesn't have role");
        _;
    }

    /**
     * @notice Get the info about the given offer
     *
     * @param _offerId - the id of the offer to fetch
     * @return success - the offer was found
     * @return offer - the offer associated with the _offerId
     */
    function getBosonOffer(uint256 _offerId)
    internal
    view
    returns (bool success, Offer memory offer)
    {
        ClientLib.ProxyStorage memory ps = ClientLib.proxyStorage();
        return IBosonOfferHandler(ps.protocolDiamond).getOffer(_offerId);

    }

}