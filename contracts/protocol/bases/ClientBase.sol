// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import "../../domain/BosonConstants.sol";
import { BosonErrors } from "../../domain/BosonErrors.sol";
import { IAccessControl } from "../../interfaces/IAccessControl.sol";
import { IBosonOfferHandler } from "../../interfaces/handlers/IBosonOfferHandler.sol";
import { IBosonExchangeHandler } from "../../interfaces/handlers/IBosonExchangeHandler.sol";
import { IBosonConfigHandler } from "../../interfaces/handlers/IBosonConfigHandler.sol";
import { BosonTypes } from "../../domain/BosonTypes.sol";
import { ClientLib } from "../libs/ClientLib.sol";
import { Context } from "@openzeppelin/contracts/utils/Context.sol";

/**
 * @title ClientBase
 *
 * @notice Extended by Boson Protocol contracts that need to communicate with the ProtocolDiamond
 * but are NOT facets of the ProtocolDiamond. This is used where it's expected that only one client
 * will use the implementation. If it's expected that multiple clients will use the same implementation, it's recommended
 * to use `BeaconClientBase` instead
 *
 */
abstract contract ClientBase is BosonTypes, BosonErrors, Context {
    /**
     * @dev Modifier that checks that the caller has a specific role.
     *
     * Reverts if:
     * - Caller doesn't have role
     *
     * See: {AccessController.hasRole}
     *
     * @param _role - the role to check
     */
    modifier onlyRole(bytes32 _role) {
        if (!hasRole(_role)) revert AccessDenied();
        _;
    }

    /**
     * @notice Gets the info about the offer associated with a voucher's exchange
     *
     * @param _exchangeId - the id of the exchange
     * @return exists - the offer was found
     * @return offer - the offer associated with the _offerId
     */
    function getBosonOffer(uint256 _exchangeId) internal view returns (bool exists, Offer memory offer) {
        ClientLib.ProxyStorage storage ps = ClientLib.proxyStorage();
        (, Exchange memory exchange, ) = IBosonExchangeHandler(ps.protocolDiamond).getExchange(_exchangeId);
        (exists, offer, , , , ) = IBosonOfferHandler(ps.protocolDiamond).getOffer(exchange.offerId);
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
        ClientLib.ProxyStorage storage ps = ClientLib.proxyStorage();
        IAccessControl accessController = IAccessControl(
            IBosonConfigHandler(ps.protocolDiamond).getAccessControllerAddress()
        );

        return accessController.hasRole(_role, _msgSender());
    }
}
