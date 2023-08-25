// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.18;
import "../../domain/BosonConstants.sol";
import { IBosonVoucher } from "../../interfaces/clients/IBosonVoucher.sol";
import { SellerBase } from "../bases/SellerBase.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";
import { IERC721 } from "../../interfaces/IERC721.sol";
import { Create2 } from "@openzeppelin/contracts/utils/Create2.sol";
import { Address } from "@openzeppelin/contracts/utils/Address.sol";

/**
 * @title SellerHandlerFacet
 *
 * @notice Handles Seller account management requests and queries.
 */
contract SellerHandlerFacet is SellerBase {
    /**
     * @notice Initializes facet.
     */
    function initialize() public {
        // No-op initializer.
        // - needed by the deployment script, which expects a no-args initializer on facets other than the config handler
        // - exception here because IBosonAccountHandler is contributed to by multiple facets which do not have their own individual interfaces
    }

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
        Seller memory _seller,
        AuthToken calldata _authToken,
        VoucherInitValues calldata _voucherInitValues
    ) external sellersNotPaused nonReentrant {
        // create seller and update structs values to represent true state
        createSellerInternal(_seller, _authToken, _voucherInitValues);
    }

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
    function updateSeller(Seller memory _seller, AuthToken calldata _authToken) external sellersNotPaused nonReentrant {
        // Cache protocol lookups for reference
        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();

        bool exists;
        Seller storage seller;
        AuthToken storage authToken;

        // Admin address or AuthToken data must be present. A seller can have one or the other
        require(
            (_seller.admin == address(0) && _authToken.tokenType != AuthTokenType.None) ||
                (_seller.admin != address(0) && _authToken.tokenType == AuthTokenType.None),
            ADMIN_OR_AUTH_TOKEN
        );
        require(_seller.clerk == address(0), CLERK_DEPRECATED);

        require(_authToken.tokenType != AuthTokenType.Custom, INVALID_AUTH_TOKEN_TYPE);

        // Check Seller exists in sellers mapping
        (exists, seller, authToken) = fetchSeller(_seller.id);

        // Seller must already exist
        require(exists, NO_SUCH_SELLER);

        // Get message sender
        address sender = msgSender();

        // Check that caller is authorized to call this function
        if (authToken.tokenType != AuthTokenType.None) {
            address authTokenContract = lookups.authTokenContracts[authToken.tokenType];
            address tokenIdOwner = IERC721(authTokenContract).ownerOf(authToken.tokenId);
            require(tokenIdOwner == sender, NOT_ADMIN);
        } else {
            require(seller.admin == sender, NOT_ADMIN);
        }

        // Clean old seller pending update data if exists
        delete lookups.pendingAddressUpdatesBySeller[_seller.id];
        delete lookups.pendingAuthTokenUpdatesBySeller[_seller.id];

        bool needsApproval;
        (, Seller storage sellerPendingUpdate, AuthToken storage authTokenPendingUpdate) = fetchSellerPendingUpdate(
            _seller.id
        );

        // Admin address or AuthToken data must be present in parameters. A seller can have one or the other. Check passed in parameters
        if (_authToken.tokenType != AuthTokenType.None) {
            // If AuthToken data is different from the one in storage, then set it as pending update
            if (authToken.tokenType != _authToken.tokenType || authToken.tokenId != _authToken.tokenId) {
                // Check that auth token is unique to this seller
                uint256 check = lookups.sellerIdByAuthToken[_authToken.tokenType][_authToken.tokenId];
                require(check == 0, AUTH_TOKEN_MUST_BE_UNIQUE);

                // Auth token owner must approve the update to prevent front-running
                authTokenPendingUpdate.tokenType = _authToken.tokenType;
                authTokenPendingUpdate.tokenId = _authToken.tokenId;
                needsApproval = true;
            }
        } else if (_seller.admin != seller.admin) {
            preUpdateSellerCheck(_seller.id, _seller.admin, lookups);
            // If admin address exists, admin address owner must approve the update to prevent front-running
            sellerPendingUpdate.admin = _seller.admin;
            needsApproval = true;
        }

        if (_seller.assistant != seller.assistant) {
            preUpdateSellerCheck(_seller.id, _seller.assistant, lookups);
            require(_seller.assistant != address(0), INVALID_ADDRESS);
            // Assistant address owner must approve the update to prevent front-running
            sellerPendingUpdate.assistant = _seller.assistant;
            needsApproval = true;
        }

        bool updateApplied;

        if (_seller.treasury != seller.treasury) {
            require(_seller.treasury != address(0), INVALID_ADDRESS);

            // Update treasury
            seller.treasury = _seller.treasury;

            updateApplied = true;
        }

        if (keccak256(bytes(_seller.metadataUri)) != keccak256(bytes(seller.metadataUri))) {
            // Update metadata URI
            seller.metadataUri = _seller.metadataUri;

            updateApplied = true;
        }

        if (updateApplied) {
            // Notify watchers of state change
            emit SellerUpdateApplied(
                _seller.id,
                seller,
                sellerPendingUpdate,
                authToken,
                authTokenPendingUpdate,
                sender
            );
        }

        if (needsApproval) {
            // Notify watchers of state change
            emit SellerUpdatePending(_seller.id, sellerPendingUpdate, authTokenPendingUpdate, sender);
        }

        require(updateApplied || needsApproval, NO_UPDATE_APPLIED);
    }

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
    function optInToSellerUpdate(
        uint256 _sellerId,
        SellerUpdateFields[] calldata _fieldsToUpdate
    ) external sellersNotPaused nonReentrant {
        Seller storage sellerPendingUpdate;
        AuthToken storage authTokenPendingUpdate;

        {
            bool exists;
            // Get seller pending update
            (exists, sellerPendingUpdate, authTokenPendingUpdate) = fetchSellerPendingUpdate(_sellerId);

            // Be sure an update is pending
            require(exists, NO_PENDING_UPDATE_FOR_ACCOUNT);
        }

        bool updateApplied;

        // Get storage location for seller
        (, Seller storage seller, AuthToken storage authToken) = fetchSeller(_sellerId);

        // Cache protocol lookups and sender for reference
        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();

        address sender = msgSender();

        for (uint256 i = 0; i < _fieldsToUpdate.length; i++) {
            SellerUpdateFields role = _fieldsToUpdate[i];

            // Approve admin update
            if (role == SellerUpdateFields.Admin && sellerPendingUpdate.admin != address(0)) {
                require(sellerPendingUpdate.admin == sender, UNAUTHORIZED_CALLER_UPDATE);

                preUpdateSellerCheck(_sellerId, sender, lookups);

                // Delete old seller id by admin mapping
                delete lookups.sellerIdByAdmin[seller.admin];

                // Update admin
                seller.admin = sender;

                // Store new seller id by admin mapping
                lookups.sellerIdByAdmin[sender] = _sellerId;

                // Delete pending update admin
                delete sellerPendingUpdate.admin;

                // Delete auth token for seller id if it exists
                if (authToken.tokenType != AuthTokenType.None) {
                    delete lookups.sellerIdByAuthToken[authToken.tokenType][authToken.tokenId];
                    delete protocolEntities().authTokens[_sellerId];
                }

                updateApplied = true;
            } else if (role == SellerUpdateFields.Assistant && sellerPendingUpdate.assistant != address(0)) {
                // Approve assistant update
                require(sellerPendingUpdate.assistant == sender, UNAUTHORIZED_CALLER_UPDATE);

                preUpdateSellerCheck(_sellerId, sender, lookups);

                // Delete old seller id by assistant mapping
                delete lookups.sellerIdByAssistant[seller.assistant];

                // Update assistant
                seller.assistant = sender;

                // Transfer ownership of voucher contract to new assistant
                IBosonVoucher(lookups.cloneAddress[_sellerId]).transferOwnership(sender); // default voucher contract
                Collection[] storage sellersAdditionalCollections = lookups.additionalCollections[_sellerId];
                uint256 collectionCount = sellersAdditionalCollections.length;
                for (uint256 j = 0; j < collectionCount; j++) {
                    // Additional collections (if they exist)
                    IBosonVoucher(sellersAdditionalCollections[j].collectionAddress).transferOwnership(sender);
                }

                // Store new seller id by assistant mapping
                lookups.sellerIdByAssistant[sender] = _sellerId;

                // Delete pending update assistant
                delete sellerPendingUpdate.assistant;

                updateApplied = true;
            } else if (role == SellerUpdateFields.AuthToken && authTokenPendingUpdate.tokenType != AuthTokenType.None) {
                // Approve auth token update
                address authTokenContract = lookups.authTokenContracts[authTokenPendingUpdate.tokenType];
                address tokenIdOwner = IERC721(authTokenContract).ownerOf(authTokenPendingUpdate.tokenId);
                require(tokenIdOwner == sender, UNAUTHORIZED_CALLER_UPDATE);

                // Check that auth token is unique to this seller
                uint256 check = lookups.sellerIdByAuthToken[authTokenPendingUpdate.tokenType][
                    authTokenPendingUpdate.tokenId
                ];
                require(check == 0, AUTH_TOKEN_MUST_BE_UNIQUE);

                // Delete old seller id by auth token mapping
                delete lookups.sellerIdByAuthToken[authToken.tokenType][authToken.tokenId];

                // Update auth token
                authToken.tokenType = authTokenPendingUpdate.tokenType;
                authToken.tokenId = authTokenPendingUpdate.tokenId;

                // Store seller by auth token reference
                lookups.sellerIdByAuthToken[authTokenPendingUpdate.tokenType][
                    authTokenPendingUpdate.tokenId
                ] = _sellerId;

                // Remove previous admin address if it exists
                delete lookups.sellerIdByAdmin[seller.admin];
                delete seller.admin;

                // Delete pending update auth token
                delete authTokenPendingUpdate.tokenType;
                delete authTokenPendingUpdate.tokenId;

                updateApplied = true;
            } else if (role == SellerUpdateFields.Clerk) {
                revert(CLERK_DEPRECATED);
            }
        }

        if (updateApplied) {
            // Notify watchers of state change
            emit SellerUpdateApplied(
                _sellerId,
                seller,
                sellerPendingUpdate,
                authToken,
                authTokenPendingUpdate,
                msgSender()
            );
        }
    }

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
        VoucherInitValues calldata _voucherInitValues
    ) external sellersNotPaused nonReentrant {
        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();
        address assistant = msgSender();

        (bool exists, uint256 sellerId) = getSellerIdByAssistant(assistant);
        require(exists, NO_SUCH_SELLER);

        Collection[] storage sellersAdditionalCollections = lookups.additionalCollections[sellerId];
        uint256 collectionIndex = sellersAdditionalCollections.length + 1; // 0 is reserved for the original collection

        // Create clone and store its address to additionalCollections
        address voucherCloneAddress = cloneBosonVoucher(
            sellerId,
            collectionIndex,
            lookups.sellerSalt[sellerId],
            assistant,
            _voucherInitValues
        );

        // Store collection details
        Collection storage newCollection = sellersAdditionalCollections.push();
        newCollection.collectionAddress = voucherCloneAddress;
        newCollection.externalId = _externalId;

        emit CollectionCreated(sellerId, collectionIndex, voucherCloneAddress, _externalId, assistant);
    }

    /**
     * @notice Updates a salt.
     * Use this if the admin address is updated and there exists a possibility that old admin will try to create the vouchers
     * with matching addresses on other chains.
     *
     * Reverts if:
     * - The sellers region of protocol is paused
     * - Caller is not the admin of any seller
     * - Seller salt is not unique
     *
     * @param _newSalt - new salt
     */
    function updateSellerSalt(bytes32 _newSalt) external sellersNotPaused nonReentrant {
        address admin = msgSender();

        (bool exists, uint256 sellerId) = getSellerIdByAdmin(admin);
        require(exists, NO_SUCH_SELLER);

        // Cache protocol lookups for reference
        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();

        bytes32 sellerSalt = keccak256(abi.encodePacked(admin, _newSalt));

        require(!lookups.isUsedSellerSalt[sellerSalt], SELLER_SALT_NOT_UNIQUE);
        lookups.isUsedSellerSalt[lookups.sellerSalt[sellerId]] = false;
        lookups.sellerSalt[sellerId] = sellerSalt;
        lookups.isUsedSellerSalt[sellerSalt] = true;
    }

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
    ) external view returns (bool exists, Seller memory seller, AuthToken memory authToken) {
        return fetchSellerWithoutClerk(_sellerId);
    }

    /**
     * @notice Gets the details about a seller by an address associated with that seller: assistant or admin address.
     * A seller will have either an admin address or an auth token.
     * If seller's admin uses NFT Auth the seller should call `getSellerByAuthToken` instead.
     *
     * @param _associatedAddress - the address associated with the seller. Must be an assistant or admin address.
     * @return exists - the seller was found
     * @return seller - the seller details. See {BosonTypes.Seller}
     * @return authToken - optional AuthToken struct that specifies an AuthToken type and tokenId that the seller can use to do admin functions
     *                     See {BosonTypes.AuthToken}
     */
    function getSellerByAddress(
        address _associatedAddress
    ) external view returns (bool exists, Seller memory seller, AuthToken memory authToken) {
        uint256 sellerId;

        (exists, sellerId) = getSellerIdByAssistant(_associatedAddress);
        if (exists) {
            return fetchSellerWithoutClerk(sellerId);
        }

        (exists, sellerId) = getSellerIdByAdmin(_associatedAddress);
        if (exists) {
            return fetchSellerWithoutClerk(sellerId);
        }
    }

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
        AuthToken calldata _associatedAuthToken
    ) external view returns (bool exists, Seller memory seller, AuthToken memory authToken) {
        uint256 sellerId;

        (exists, sellerId) = getSellerIdByAuthToken(_associatedAuthToken);
        if (exists) {
            return fetchSeller(sellerId);
        }
    }

    /**
     * @notice Gets the details about a seller's collections.
     *
     * @param _sellerId - the id of the seller to check
     * @return defaultVoucherAddress - the address of the default voucher contract for the seller
     * @return additionalCollections - an array of additional collections that the seller has created
     */
    function getSellersCollections(
        uint256 _sellerId
    ) external view returns (address defaultVoucherAddress, Collection[] memory additionalCollections) {
        ProtocolLib.ProtocolLookups storage pl = protocolLookups();
        return (pl.cloneAddress[_sellerId], pl.additionalCollections[_sellerId]);
    }

    /**
     * @notice Pre update Seller checks
     *
     * Reverts if:
     *   - Address has already been used by another seller as assistant or admin
     *
     * @param _sellerId - the id of the seller to check
     * @param _role - the address to check
     * @param _lookups - the lookups struct
     */
    function preUpdateSellerCheck(
        uint256 _sellerId,
        address _role,
        ProtocolLib.ProtocolLookups storage _lookups
    ) internal view {
        // Check that the role is unique to one seller id across all roles -- not used or is used by this seller id.
        if (_role != address(0)) {
            uint256 check1 = _lookups.sellerIdByAssistant[_role];
            uint256 check2 = _lookups.sellerIdByAdmin[_role];

            require(
                (check1 == 0 || check1 == _sellerId) && (check2 == 0 || check2 == _sellerId),
                SELLER_ADDRESS_MUST_BE_UNIQUE
            );
        }
    }

    /**
     * @notice Fetches a given seller from storage by id and overrides the clerk address with 0x0.
     *
     * @param _sellerId - the id of the seller
     * @return exists - whether the seller exists
     * @return seller - the seller details. See {BosonTypes.Seller}
     * @return authToken - optional AuthToken struct that specifies an AuthToken type and tokenId that the user can use to do admin functions
     */
    function fetchSellerWithoutClerk(
        uint256 _sellerId
    ) internal view returns (bool exists, Seller memory seller, AuthToken memory authToken) {
        (exists, seller, authToken) = fetchSeller(_sellerId);
        seller.clerk = address(0);
    }
}
