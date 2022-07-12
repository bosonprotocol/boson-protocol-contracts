// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import { IBosonOfferHandler } from "../../interfaces/handlers/IBosonOfferHandler.sol";
import { IBosonExchangeHandler } from "../../interfaces/handlers/IBosonExchangeHandler.sol";
import { BosonConstants } from "../../domain/BosonConstants.sol";
import { BosonTypes } from "../../domain/BosonTypes.sol";
import { ClientLib } from "../libs/ClientLib.sol";

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
    function getBosonOffer(uint256 _exchangeId) internal view returns (bool exists, Offer memory offer) {
        ClientLib.ProxyStorage memory ps = ClientLib.proxyStorage();
        (, Exchange memory exchange) = IBosonExchangeHandler(ps.protocolDiamond).getExchange(_exchangeId);
        (exists, offer, , , ) = IBosonOfferHandler(ps.protocolDiamond).getOffer(exchange.offerId);
    }

    /**
     * @notice Inform protocol of new buyer associated with an exchange
     *
     * @param _exchangeId - the id of the exchange
     * @param _newBuyer - the address of the new buyer
     */
    function onVoucherTransferred(uint256 _exchangeId, address payable _newBuyer) internal {
        ClientLib.ProxyStorage memory ps = ClientLib.proxyStorage();
        IBosonExchangeHandler(ps.protocolDiamond).onVoucherTransferred(_exchangeId, _newBuyer);
    }
}
