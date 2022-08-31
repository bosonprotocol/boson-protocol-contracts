// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import "../../domain/BosonConstants.sol";
import { IBosonOfferHandler } from "../../interfaces/handlers/IBosonOfferHandler.sol";
import { IBosonExchangeHandler } from "../../interfaces/handlers/IBosonExchangeHandler.sol";
import { IBosonAccountHandler } from "../../interfaces/handlers/IBosonAccountHandler.sol";
import { BosonTypes } from "../../domain/BosonTypes.sol";
import { BeaconClientLib } from "../libs/BeaconClientLib.sol";
import { IClientExternalAddresses } from "../../interfaces/clients/IClientExternalAddresses.sol";

/**
 * @title BeaconClientBase
 *
 * @notice Extended by Boson Protocol contracts that need to communicate with the ProtocolDiamond
 * but are NOT facets of the ProtocolDiamond. This is used where it's expected that multiple clients
 * will use the same implementation. If it's expected that only one client will use it, it's recommended to use `ClientBase` instead
 *
 * Boson client contracts include BosonVoucher
 */
abstract contract BeaconClientBase is BosonTypes {
    /**
     * @dev Modifier that checks that the caller has a specific role.
     *
     * Reverts if:
     * - caller doesn't have role
     *
     * See: {AccessController.hasRole}
     *
     * @param role - the role to check
     */
    modifier onlyRole(bytes32 role) {
        require(BeaconClientLib.hasRole(role), ACCESS_DENIED);
        _;
    }

    /**
     * @notice Gets the info about the offer associated with a voucher's exchange
     *
     * @param _exchangeId - the id of the exchange
     * @return exists - the offer was found
     * @return offer - the offer associated with the _exchangeId
     */
    function getBosonOffer(uint256 _exchangeId) internal view returns (bool exists, Offer memory offer) {
        address protocolDiamond = IClientExternalAddresses(BeaconClientLib._beacon()).getProtocolAddress();

        (, Exchange memory exchange, ) = IBosonExchangeHandler(protocolDiamond).getExchange(_exchangeId);
        (exists, offer, , , , ) = IBosonOfferHandler(protocolDiamond).getOffer(exchange.offerId);
    }

    /**
     * @notice Informs protocol of new buyer associated with an exchange
     *
     * @param _exchangeId - the id of the exchange
     * @param _newBuyer - the address of the new buyer
     */
    function onVoucherTransferred(uint256 _exchangeId, address payable _newBuyer) internal {
        address protocolDiamond = IClientExternalAddresses(BeaconClientLib._beacon()).getProtocolAddress();
        IBosonExchangeHandler(protocolDiamond).onVoucherTransferred(_exchangeId, _newBuyer);
    }

    /**
     * @notice Gets the info about the seller associated with the sellerId.
     *
     * @param _sellerId - the id of the seller
     * @return exists - the seller was found
     * @return seller - the seller associated with the _sellerId
     */
    function getBosonSeller(uint256 _sellerId) internal view returns (bool exists, Seller memory seller) {
        address protocolDiamond = IClientExternalAddresses(BeaconClientLib._beacon()).getProtocolAddress();

        (exists, seller, ) = IBosonAccountHandler(protocolDiamond).getSeller(_sellerId);
    }
}
