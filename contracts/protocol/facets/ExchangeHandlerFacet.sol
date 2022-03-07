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
     * @dev Modifier to protect initializer function from being invoked twice.
     */
    modifier onlyUnInitialized()
    {
        ProtocolLib.ProtocolInitializers storage pi = ProtocolLib.protocolInitializers();
        require(!pi.exchangeFacet, ALREADY_INITIALIZED);
        pi.exchangeFacet = true;
        _;
    }

    /**
     * @notice Facet Initializer
     */
    function initialize()
    public
    onlyUnInitialized
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
        Offer storage offer = ProtocolLib.getOffer(_offerId);
        require (offer.id == _offerId, BosonConstants.NO_SUCH_OFFER);

        // TODO implement further checks, create exchange, issue voucher

        // Notify watchers of state change
        emit BuyerCommitted(_offerId, _buyer, offer.seller);

    }
    
}