// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import "../../interfaces/IBosonExchangeHandler.sol";
import "../../diamond/DiamondLib.sol";
import "../ProtocolBase.sol";
import "../ProtocolLib.sol";

/**
 * @title ExchangeHandlerFacet
 *
 * @notice Handles exchanges associated with offers within the protocol
 */
contract ExchangeHandlerFacet is IBosonExchangeHandler, ProtocolBase {

    /**
     * @notice Facet Initializer
     */
    function initialize()
    public
    onlyUnInitialized(type(IBosonExchangeHandler).interfaceId)
    {
        DiamondLib.addSupportedInterface(type(IBosonExchangeHandler).interfaceId);
    }

    /**
     * @notice Commit to an offer (first step of an exchange)
     *
     * Emits an BuyerCommitted event if successful.
     * Issues a voucher to the buyer address.
     *
     * Reverts if:
     * - buyer address is zero
     * - offerId is invalid
     * - offer has been voided
     * - offer has expired
     * - offer's quantity available is zero
     *
     * @param _buyer - the buyer's address (caller can commit on behalf of a buyer)
     * @param _offerId - the id of the offer to commit to
     */
    function commitToOffer(
        address payable _buyer,
        uint256 _offerId
    )
    external
    override
    {
        // Get the offer, revert if it doesn't exist
        (bool exists, Offer storage offer) = fetchOffer(_offerId);
        require (exists, NO_SUCH_OFFER);

        // TODO 1) implement further requires (see above), create exchange, issue voucher

        // TODO 2) get buyer struct if it exists or create and store new one

        // TODO 3) create and store a new exchange

        // TODO 4) create a new exchange

        // TODO 5) decrement offer's quantity available

        // Notify watchers of state change
        // emit BuyerCommitted(_offerId, buyer.id, exchange.id, exchange);

    }

    /**
     * @notice Gets the details about a given exchange.
     *
     * @param _exchangeId - the id of the exchange to check
     * @return exists - the exchange was found
     * @return exchange - the exchange details. See {BosonTypes.Exchange}
     */
    function getExchange(uint256 _exchangeId)
    external
    view
    returns(bool exists, BosonTypes.Exchange memory exchange) {
        return fetchExchange(_exchangeId);
    }


}