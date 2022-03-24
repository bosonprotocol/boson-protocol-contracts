// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import "../../interfaces/IBosonOfferHandler.sol";
import "../../interfaces/IBosonExchangeHandler.sol";
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
        require(ClientLib.hasRole(role), ACCESS_DENIED);
        _;
    }

    /**
     * @notice Get the info about the offer associated with a voucher's exchange
     *
     * @param _exchangeId - the id of the exchange
     * @return exists - the offer was found
     * @return offer - the offer associated with the _offerId
     */
    function getBosonOffer(uint256 _exchangeId)
    internal
    view
    returns (bool exists, Offer memory offer)
    {
        ClientLib.ProxyStorage memory ps = ClientLib.proxyStorage();
        (, Exchange memory exchange) = IBosonExchangeHandler(ps.protocolDiamond).getExchange(_exchangeId);
        return IBosonOfferHandler(ps.protocolDiamond).getOffer(exchange.offerId);

    }

}