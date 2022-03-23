// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import "../../interfaces/IBosonDisputeHandler.sol";
import "../../diamond/DiamondLib.sol";
import "../ProtocolBase.sol";
import "../ProtocolLib.sol";

/**
 * @title DisputeHandlerFacet
 *
 * @notice Handles disputes associated with exchanges within the protocol
 */
contract DisputeHandlerFacet is IBosonDisputeHandler, ProtocolBase {

    /**
     * @notice Facet Initializer
     */
    function initialize()
    public
    onlyUnInitialized(type(IBosonDisputeHandler).interfaceId)
    {
        DiamondLib.addSupportedInterface(type(IBosonDisputeHandler).interfaceId);
    }

    /**
     * @notice Raise a dispute
     *
     * Emits an DisputeCreated event if successful.
     *
     * Reverts if:
     * - exchange does not exist
     * - caller does not hold a voucher for the given offer id
     * - a dispute already exists for the exchange
     * - the complaint is blank
     *
     * @param _exchangeId - the id of the associated exchange
     * @param _complaint - the buyer's complaint description
     */
    function raiseDispute(
        uint256 _exchangeId,
        string calldata _complaint
    )
    external
    override
    {
        bool exists;
        Exchange storage exchange;
        Offer storage offer;

        // Get the exchange, revert if it doesn't exist
        (exists, exchange) = fetchExchange(_exchangeId);
        require(exists, BosonConstants.NO_SUCH_EXCHANGE);

        // Get the offer, which will exist if the exchange does
        (, offer) = fetchOffer(exchange.offerId);

        // TODO implement further checks, create and store dispute

        // Notify watchers of state change
        emit DisputeRaised(_exchangeId, exchange.buyerId, offer.sellerId, _complaint);

    }


}