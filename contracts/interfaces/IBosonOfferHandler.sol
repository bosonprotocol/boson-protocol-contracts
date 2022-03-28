// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import "../domain/BosonTypes.sol";

/**
 * @title IBosonOfferHandler
 *
 * @notice Manages creation, voiding, and querying of offers within the protocol.
 *
 * The ERC-165 identifier for this interface is: 0xaf7dd438
 */
interface IBosonOfferHandler {

    /// Events
    event OfferCreated(uint256 indexed offerId, uint256 indexed sellerId, BosonTypes.Offer offer);
    event OfferUpdated(uint256 indexed offerId, uint256 indexed sellerId, BosonTypes.Offer offer);
    event OfferVoided(uint256 indexed offerId, uint256 indexed sellerId);
    event GroupCreated(uint256 indexed groupId, uint256 indexed sellerId, BosonTypes.Group group);

    /**
     * @notice Creates an offer
     *
     * Emits an OfferCreated event if successful.
     *
     * Reverts if:
     * - Valid from date is greater than valid until date
     * - Valid until date is not in the future
     *
     * @param _offer - the fully populated struct with offer id set to 0x0
     */
    function createOffer(BosonTypes.Offer memory _offer)
    external;

    /**
     * @notice Updates an existing offer.
     *
     * Emits an OfferUpdated event if successful.
     *
     * Reverts if:
     * - Offer is not updateable, i.e. is voided or some exchanges are active
     * - Any other validation for offer creation fails
     *
     * @param _offer - the fully populated struct with offer id set to offer to be updated, active exchanges set to 0 and voided set to false
     */
    function updateOffer(
        BosonTypes.Offer memory _offer
    ) external;

    /**
     * @notice Voids a given offer
     *
     * Emits an OfferVoided event if successful.
     *
     * Note:
     * Existing exchanges are not affected.
     * No further vouchers can be issued against a voided offer.
     *
     * Reverts if:
     * - Offer ID is invalid
     * - Offer is not owned by caller
     *
     * @param _offerId - the id of the offer to check
     */
    function voidOffer(uint256 _offerId)
    external;

    /**
     * @notice Sets new valid until date
     *
     * Emits an OfferUpdated event if successful.
     *
     * Reverts if:
     * - Offer does not exist
     * - Caller is not the seller (TODO)
     * - New valid until date is before existing valid until dates
     *
     *  @param _offerId - the id of the offer to check
     *  @param _validUntilDate - new valid until date
     */
    function extendOffer(
        uint256 _offerId, uint _validUntilDate
    ) external;

    /**
     * @notice Gets the details about a given offer.
     *
     * @param _offerId - the id of the offer to check
     * @return exists - the offer was found
     * @return offer - the offer details. See {BosonTypes.Offer}
     */
    function getOffer(uint256 _offerId)
    external
    view
    returns(bool exists, BosonTypes.Offer memory offer);

    /**
     * @notice Gets the next offer id.
     *
     * Does not increment the counter.
     *
     * @return nextOfferId - the next offer id
     */
    function getNextOfferId()
    external
    view
    returns(uint256 nextOfferId);

    /**
     * @notice Tells if offer is voided or not
     *
     * @param _offerId - the id of the offer to check
     * @return exists - the offer was found
     * @return offerVoided - true if voided, false otherwise
     */
    function isOfferVoided(uint256 _offerId)
    external
    view
    returns(bool exists, bool offerVoided);
    
    /**
     * @notice Tells if offer is can be updated or not
     *
     * Offer is updateable if:
     * - it exists
     * - is not voided
     * - has no exchanges
     *
     * @param _offerId - the id of the offer to check
     * @return exists - the offer was found
     * @return offerUpdateable - true if updateable, false otherwise
     */
    function isOfferUpdateable(uint256 _offerId)
    external
    view
    returns(bool exists, bool offerUpdateable);

    /**
     * @notice Creates a group.
     *
     * Emits a GroupCreated event if successful.
     *
     * Reverts if:
     * 
     * - seller does not match caller
     * - any of offers belongs to different seller
     * - any of offers does not exist
     * - offer exists in a different group
     *
     * @param _group - the fully populated struct with group id set to 0x0
     */
    function createGroup(
        BosonTypes.Group memory _group
    )
    external;

    /**
     * @notice Gets the details about a given group.
     *
     * @param _groupId - the id of the group to check
     * @return exists - the offer was found
     * @return group - the offer details. See {BosonTypes.Group}
     */
    function getGroup(uint256 _groupId)
    external
    view
    returns(bool exists, BosonTypes.Group memory group);

}