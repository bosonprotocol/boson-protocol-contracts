// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import { BosonTypes } from "../../domain/BosonTypes.sol";

/**
 * @title IBosonSellerHandler
 *
 * @notice Handles creation, update, retrieval of sellers within the protocol.
 *
 * The ERC-165 identifier for this interface is: 0x3e8eaeef
 */
interface IBosonSellerHandler {
    /**
     * @notice Creates a seller.
     *
     * Emits a SellerCreated event if successful.
     *
     * Reverts if:
     * - Caller is not the supplied admin or does not own supplied auth token
     * - Caller is not the supplied assistant
     * - Supplied clerk is not a zero address
     * - The sellers region of protocol is paused
     * - Address values are zero address
     * - Addresses are not unique to this seller
     * - Seller is not active (if active == false)
     * - Admin address is zero address and AuthTokenType == None
     * - AuthTokenType is not unique to this seller
     * - AuthTokenType is Custom
     * - Seller salt is not unique
     * - Clone creation fails
     *
     * @param _seller - the fully populated struct with seller id set to 0x0
     * @param _authToken - optional AuthToken struct that specifies an AuthToken type and tokenId that the seller can use to do admin functions
     * @param _voucherInitValues - the fully populated BosonTypes.VoucherInitValues struct
     */
    function createSeller(
        BosonTypes.Seller memory _seller,
        BosonTypes.AuthToken calldata _authToken,
        BosonTypes.VoucherInitValues calldata _voucherInitValues
    ) external;

    /**
     * @notice Updates treasury address, if changed. Puts admin, assistant and AuthToken in pending queue, if changed.
     *         Pending updates can be completed by calling the optInToSellerUpdate function.
     * @dev    Active flag passed in by caller will be ignored. The value from storage will be used.
     *
     * Emits a SellerUpdateApplied event if the seller has changed the treasury.
     * Emits a SellerUpdatePending event if the seller has requested an update for admin, assistant, or auth token.
     * Holder of new auth token and/or owner(s) of new addresses for admin, assistant must opt-in to the update.
     *
     * Reverts if:
     * - The sellers region of protocol is paused
     * - Address values are zero address
     * - Addresses are not unique to this seller
     * - Supplied clerk is not a zero address
     * - Caller address is not the admin address of the stored seller with no AuthToken
     * - Caller is not the owner of the seller's stored AuthToken
     * - Seller does not exist
     * - Admin address is zero address and AuthTokenType == None
     * - AuthTokenType is not unique to this seller
     * - AuthTokenType is Custom
     * - No field has been updated or requested to be updated
     *
     * @param _seller - the fully populated seller struct
     * @param _authToken - optional AuthToken struct that specifies an AuthToken type and tokenId that the seller can use to do admin functions
     */
    function updateSeller(BosonTypes.Seller memory _seller, BosonTypes.AuthToken calldata _authToken) external;

    /**
     * @notice Opt-in to a pending seller update
     *
     * Emits a SellerUpdateApplied event if successful.
     *
     * Reverts if:
     * - The sellers region of protocol is paused
     * - Addresses are not unique to this seller
     * - Caller address is not pending update for the field being updated
     * - Caller is not the owner of the pending AuthToken being updated
     * - No pending update exists for this seller
     * - AuthTokenType is not unique to this seller
     * - Seller tries to update the clerk
     *
     * @param _sellerId - seller id
     * @param _fieldsToUpdate - fields to update, see SellerUpdateFields enum
     */
    function optInToSellerUpdate(uint256 _sellerId, BosonTypes.SellerUpdateFields[] calldata _fieldsToUpdate) external;

    /**
     * @notice Adds royalty recipients to a seller.
     *
     * Emits a RoyalRecipientsUpdated event if successful.
     *
     *  Reverts if:
     *  - The sellers region of protocol is paused
     *  - Seller does not exist
     *  - Caller is not the seller admin
     *  - Caller does not own auth token
     *  - Some recipient is not unique
     *  - some royalty percentage is above the limit
     *
     * @param _sellerId - seller id
     * @param _royaltyRecipients - list of royalty recipients to add
     */
    function addRoyaltyRecipients(
        uint256 _sellerId,
        BosonTypes.RoyaltyRecipientInfo[] calldata _royaltyRecipients
    ) external;

    /**
     * @notice Updates seller's royalty recipients.
     *
     * Emits a RoyalRecipientsUpdated event if successful.
     *
     *  Reverts if:
     *  - The sellers region of protocol is paused
     *  - Seller does not exist
     *  - Caller is not the seller admin
     *  - Caller does not own auth token
     *  - Length of ids to change does not match length of new values
     *  - Id to update does not exist
     *  - Seller tries to update the address of default recipient
     *  - Some recipient is not unique
     *  - Some royalty percentage is above the limit
     *
     * @param _sellerId - seller id
     * @param _royaltyRecipientIds - list of royalty recipient ids to update. Ids are zero based and corresponds to ids returned by `getRoyaltyRecipients`.
     * @param _royaltyRecipients - list of new royalty recipients corresponding to ids
     */
    function updateRoyaltyRecipients(
        uint256 _sellerId,
        uint256[] calldata _royaltyRecipientIds,
        BosonTypes.RoyaltyRecipientInfo[] calldata _royaltyRecipients
    ) external;

    /**
     * @notice Removes seller's royalty recipients.
     *
     * Emits a RoyalRecipientsUpdated event if successful.
     *
     *  Reverts if:
     *  - The sellers region of protocol is paused
     *  - Seller does not exist
     *  - Caller is not the seller admin
     *  - Caller does not own auth token
     *  - List of ids to remove is not sorted in ascending order
     *  - Id to remove does not exist
     *  - Seller tries to remove the default recipient
     *
     * @param _sellerId - seller id
     * @param _royaltyRecipientIds - list of royalty recipient ids to remove. Ids are zero based and corresponds to ids returned by `getRoyaltyRecipients`.
     */
    function removeRoyaltyRecipients(uint256 _sellerId, uint256[] calldata _royaltyRecipientIds) external;

    /**
     * @notice Creates a new seller collection.
     *
     * Emits a CollectionCreated event if successful.
     *
     * Reverts if:
     * - The sellers region of protocol is paused
     * - Caller is not the seller assistant
     *
     * @param _externalId - external collection id
     * @param _voucherInitValues - the fully populated BosonTypes.VoucherInitValues struct
     */
    function createNewCollection(
        string calldata _externalId,
        BosonTypes.VoucherInitValues calldata _voucherInitValues
    ) external;

    /**
     * @notice Updates a salt.
     * Use this if the admin address is updated and there exists a possibility that the old admin will try to create the vouchers
     * with matching addresses on other chains.
     *
     * Reverts if:
     * - The sellers region of protocol is paused
     * - Caller is not the admin of any seller
     * - Seller salt is not unique
     *
     * @param _sellerId - the id of the seller
     * @param _newSalt - new salt
     */
    function updateSellerSalt(uint256 _sellerId, bytes32 _newSalt) external;

    /**
     * @notice Gets the details about a seller.
     *
     * @param _sellerId - the id of the seller to check
     * @return exists - the seller was found
     * @return seller - the seller details. See {BosonTypes.Seller}
     * @return authToken - optional AuthToken struct that specifies an AuthToken type and tokenId that the seller can use to do admin functions
     *                     See {BosonTypes.AuthToken}
     */
    function getSeller(
        uint256 _sellerId
    ) external view returns (bool exists, BosonTypes.Seller memory seller, BosonTypes.AuthToken memory authToken);

    /**
     * @notice Gets the details about a seller by an address associated with that seller: assistant, or admin address.
     * A seller will have either an admin address or an auth token.
     * If seller's admin uses NFT Auth the seller should call `getSellerByAuthToken` instead.
     *
     * @param _associatedAddress - the address associated with the seller. Must be an assistant, or admin  address.
     * @return exists - the seller was found
     * @return seller - the seller details. See {BosonTypes.Seller}
     * @return authToken - optional AuthToken struct that specifies an AuthToken type and tokenId that the seller can use to do admin functions
     *                     See {BosonTypes.AuthToken}
     */
    function getSellerByAddress(
        address _associatedAddress
    ) external view returns (bool exists, BosonTypes.Seller memory seller, BosonTypes.AuthToken memory authToken);

    /**
     * @notice Gets the details about a seller by an auth token associated with that seller.
     * A seller will have either an admin address or an auth token.
     * If seller's admin uses an admin address, the seller should call `getSellerByAddress` instead.
     *
     *
     * @param _associatedAuthToken - the auth token that may be associated with the seller.
     * @return exists - the seller was found
     * @return seller - the seller details. See {BosonTypes.Seller}
     * @return authToken - optional AuthToken struct that specifies an AuthToken type and tokenId that the seller can use to do admin functions
     *                     See {BosonTypes.AuthToken}
     */
    function getSellerByAuthToken(
        BosonTypes.AuthToken calldata _associatedAuthToken
    ) external view returns (bool exists, BosonTypes.Seller memory seller, BosonTypes.AuthToken memory authToken);

    /**
     * @notice Gets the details about all seller's collections.
     * In case seller has too many collections and this runs out of gas, please use getSellersCollectionsPaginated.
     *
     * @param _sellerId - the id of the seller to check
     * @return defaultVoucherAddress - the address of the default voucher contract for the seller
     * @return additionalCollections - an array of additional collections that the seller has created
     */
    function getSellersCollections(
        uint256 _sellerId
    ) external view returns (address defaultVoucherAddress, BosonTypes.Collection[] memory additionalCollections);

    /**
     * @notice Gets the details about all seller's collections.
     * Use getSellersCollectionCount to get the total number of collections.
     *
     * @param _sellerId - the id of the seller to check
     * @param _limit - the maximum number of Collections that should be returned starting from the index defined by `_offset`. If `_offset` + `_limit` exceeds total number of collections, `_limit` is adjusted to return all remaining collections.
     * @param _offset - the starting index from which to return collections. If `_offset` is greater than or equal to total number of collections, an empty list is returned.
     * @return defaultVoucherAddress - the address of the default voucher contract for the seller
     * @return additionalCollections - an array of additional collections that the seller has created
     */
    function getSellersCollectionsPaginated(
        uint256 _sellerId,
        uint256 _limit,
        uint256 _offset
    ) external view returns (address defaultVoucherAddress, BosonTypes.Collection[] memory additionalCollections);

    /**
     * @notice Returns the number of additional collections for a seller.
     * Use this in conjunction with getSellersCollectionsPaginated to get all collections.
     *
     * @param _sellerId - the id of the seller to check
     */
    function getSellersCollectionCount(uint256 _sellerId) external view returns (uint256 collectionCount);

    /**
     * @notice Returns the availability of salt for a seller.
     *
     * @param _adminAddres - the admin address to check
     * @param _salt - the salt to check (corresponds to `collectionSalt` when `createSeler` or `createNewCollection` is called or `newSalt` when `updateSellerSalt` is called)
     * @return isAvailable - salt can be used
     */
    function isSellerSaltAvailable(address _adminAddres, bytes32 _salt) external view returns (bool isAvailable);

    /**
     * @notice Calculates the expected collection address and tells if it's still avaialble.
     *
     * @param _sellerId - the seller id
     * @param _collectionSalt - the collection specific salt
     * @return collectionAddress - the collection address
     * @return isAvailable - whether the collection address is available
     */
    function calculateCollectionAddress(
        uint256 _sellerId,
        bytes32 _collectionSalt
    ) external view returns (address collectionAddress, bool isAvailable);

    /**
     * @notice Gets seller's royalty recipients.
     *
     * @param _sellerId - seller id
     * @return royaltyRecipients - list of royalty recipients
     */
    function getRoyaltyRecipients(
        uint256 _sellerId
    ) external view returns (BosonTypes.RoyaltyRecipientInfo[] memory royaltyRecipients);
}
