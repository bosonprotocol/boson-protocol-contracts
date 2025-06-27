// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;
import "../../domain/BosonConstants.sol";
import { IBosonVoucher } from "../../interfaces/clients/IBosonVoucher.sol";
import { IBosonSellerHandler } from "../../interfaces/handlers/IBosonSellerHandler.sol";
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
contract SellerHandlerFacet is IBosonSellerHandler, SellerBase {
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

        // Admin address or AuthToken data must be present. A seller can have one or the other
        if (
            (_seller.admin == address(0) && _authToken.tokenType == AuthTokenType.None) ||
            (_seller.admin != address(0) && _authToken.tokenType != AuthTokenType.None)
        ) {
            revert AdminOrAuthToken();
        }
        if (_seller.clerk != address(0)) revert ClerkDeprecated();

        if (_authToken.tokenType == AuthTokenType.Custom) revert InvalidAuthTokenType();

        // Check Seller exists in sellers mapping
        Seller storage seller;
        AuthToken storage authToken;
        {
            bool exists;
            (exists, seller, authToken) = fetchSeller(_seller.id);

            // Seller must already exist
            if (!exists) revert NoSuchSeller();
        }
        // Get message sender
        // address sender = _msgSender(); // temporary disabled due to stack too deep error. Revisit when compiler version is upgraded

        // Check that caller is authorized to call this function
        authorizeAdmin(lookups, authToken, seller.admin, _msgSender());

        // Clean old seller pending update data if exists
        delete lookups.pendingAddressUpdatesBySeller[_seller.id];
        delete lookups.pendingAuthTokenUpdatesBySeller[_seller.id];

        (, Seller storage sellerPendingUpdate, AuthToken storage authTokenPendingUpdate) = fetchSellerPendingUpdate(
            _seller.id
        );

        {
            bool needsApproval;
            // Admin address or AuthToken data must be present in parameters. A seller can have one or the other. Check passed in parameters
            if (_authToken.tokenType != AuthTokenType.None) {
                // If AuthToken data is different from the one in storage, then set it as pending update
                if (authToken.tokenType != _authToken.tokenType || authToken.tokenId != _authToken.tokenId) {
                    // Check that auth token is unique to this seller
                    if (lookups.sellerIdByAuthToken[_authToken.tokenType][_authToken.tokenId] != 0)
                        revert AuthTokenMustBeUnique();

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
                if (_seller.assistant == address(0)) revert InvalidAddress();
                // Assistant address owner must approve the update to prevent front-running
                sellerPendingUpdate.assistant = _seller.assistant;
                needsApproval = true;
            }

            bool updateApplied;

            if (_seller.treasury != seller.treasury) {
                if (_seller.treasury == address(0)) revert InvalidAddress();

                // Check if new treasury is already a royalty recipient
                mapping(address => uint256) storage royaltyRecipientIndexBySellerAndRecipient = lookups
                    .royaltyRecipientIndexBySellerAndRecipient[_seller.id];
                uint256 royaltyRecipientId = royaltyRecipientIndexBySellerAndRecipient[_seller.treasury];

                if (royaltyRecipientId != 0) {
                    RoyaltyRecipientInfo[] storage royaltyRecipients = lookups.royaltyRecipientsBySeller[_seller.id];

                    // If the new treasury is already a royalty recipient, remove it
                    royaltyRecipientId--; // royaltyRecipientId is 1-based, so we need to decrement it to get the index
                    uint256 lastRoyaltyRecipientsId = royaltyRecipients.length - 1;
                    if (royaltyRecipientId != lastRoyaltyRecipientsId) {
                        royaltyRecipients[royaltyRecipientId] = royaltyRecipients[lastRoyaltyRecipientsId];
                        royaltyRecipientIndexBySellerAndRecipient[royaltyRecipients[royaltyRecipientId].wallet] =
                            royaltyRecipientId +
                            1;
                    }
                    royaltyRecipients.pop();

                    delete royaltyRecipientIndexBySellerAndRecipient[_seller.treasury];
                }

                // Update treasury
                seller.treasury = _seller.treasury;

                updateApplied = true;

                emit RoyaltyRecipientsChanged(_seller.id, fetchRoyaltyRecipients(_seller.id), _msgSender());
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
                    _msgSender()
                );
            }

            if (needsApproval) {
                // Notify watchers of state change
                emit SellerUpdatePending(_seller.id, sellerPendingUpdate, authTokenPendingUpdate, _msgSender());
            }

            if (!updateApplied && !needsApproval) revert NoUpdateApplied();
        }
    }

    /**
     * @notice Opt-in to a pending seller update.
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
            if (!exists) revert NoPendingUpdateForAccount();
        }

        bool updateApplied;

        // Get storage location for seller
        (, Seller storage seller, AuthToken storage authToken) = fetchSeller(_sellerId);

        // Cache protocol lookups and sender for reference
        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();

        address sender = _msgSender();

        for (uint256 i = 0; i < _fieldsToUpdate.length; ) {
            SellerUpdateFields role = _fieldsToUpdate[i];

            // Approve admin update
            if (role == SellerUpdateFields.Admin && sellerPendingUpdate.admin != address(0)) {
                if (sellerPendingUpdate.admin != sender) revert UnauthorizedCallerUpdate();

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
                if (sellerPendingUpdate.assistant != sender) revert UnauthorizedCallerUpdate();

                preUpdateSellerCheck(_sellerId, sender, lookups);

                // Delete old seller id by assistant mapping
                delete lookups.sellerIdByAssistant[seller.assistant];

                // Update assistant
                seller.assistant = sender;

                // Transfer ownership of voucher contract to new assistant
                IBosonVoucher(lookups.cloneAddress[_sellerId]).transferOwnership(sender); // default voucher contract
                Collection[] storage sellersAdditionalCollections = lookups.additionalCollections[_sellerId];
                uint256 collectionCount = sellersAdditionalCollections.length;
                for (uint256 j = 0; j < collectionCount; ) {
                    // Additional collections (if they exist)
                    IBosonVoucher(sellersAdditionalCollections[j].collectionAddress).transferOwnership(sender);

                    unchecked {
                        j++;
                    }
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
                if (tokenIdOwner != sender) revert UnauthorizedCallerUpdate();

                // Check that auth token is unique to this seller
                if (lookups.sellerIdByAuthToken[authTokenPendingUpdate.tokenType][authTokenPendingUpdate.tokenId] != 0)
                    revert AuthTokenMustBeUnique();

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
                revert ClerkDeprecated();
            }

            unchecked {
                i++;
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
                _msgSender()
            );
        }
    }

    /*
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
        address assistant = _msgSender();

        (bool exists, uint256 sellerId) = getSellerIdByAssistant(assistant);
        if (!exists) revert NoSuchSeller();

        Collection[] storage sellersAdditionalCollections = lookups.additionalCollections[sellerId];
        uint256 collectionIndex = sellersAdditionalCollections.length + 1; // 0 is reserved for the original collection

        bytes32 sellerSalt = lookups.sellerSalt[sellerId];

        // Accounts created before v2.3.0 can be missing sellerSalt, so it's created here
        if (sellerSalt == 0) {
            (, Seller storage seller, AuthToken storage authToken) = fetchSeller(sellerId);
            address admin = seller.admin;
            if (admin == address(0)) {
                admin = IERC721(lookups.authTokenContracts[authToken.tokenType]).ownerOf(authToken.tokenId);
            }
            sellerSalt = keccak256(abi.encodePacked(admin, _voucherInitValues.collectionSalt));
            if (lookups.isUsedSellerSalt[sellerSalt]) revert SellerSaltNotUnique();
            lookups.sellerSalt[sellerId] = sellerSalt;
            lookups.isUsedSellerSalt[sellerSalt] = true;
        }

        // Create clone and store its address to additionalCollections
        address voucherCloneAddress = cloneBosonVoucher(
            sellerId,
            collectionIndex,
            sellerSalt,
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
    function updateSellerSalt(uint256 _sellerId, bytes32 _newSalt) external sellersNotPaused nonReentrant {
        address admin = _msgSender();

        // Cache protocol lookups for reference
        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();

        (bool exists, Seller storage seller, AuthToken storage authToken) = fetchSeller(_sellerId);

        // Seller must already exist
        if (!exists) revert NoSuchSeller();

        // Check that caller is authorized to call this function
        authorizeAdmin(lookups, authToken, seller.admin, admin);

        bytes32 sellerSalt = keccak256(abi.encodePacked(admin, _newSalt));

        if (lookups.isUsedSellerSalt[sellerSalt]) revert SellerSaltNotUnique();
        lookups.isUsedSellerSalt[lookups.sellerSalt[_sellerId]] = false;
        lookups.sellerSalt[_sellerId] = sellerSalt;
        lookups.isUsedSellerSalt[sellerSalt] = true;
    }

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
     * @param _royaltyRecipients - list of royalty recipients to add, including minimal royalty percentage
     */
    function addRoyaltyRecipients(
        uint256 _sellerId,
        RoyaltyRecipientInfo[] calldata _royaltyRecipients
    ) external sellersNotPaused nonReentrant {
        // Cache protocol lookups and sender for reference
        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();

        // Make sure admin is the caller and get the sender's address
        (Seller storage seller, address sender) = validateAdminStatus(lookups, _sellerId);
        address treasury = seller.treasury;

        RoyaltyRecipientInfo[] storage royaltyRecipients = lookups.royaltyRecipientsBySeller[_sellerId];
        uint256 maxRoyaltyPercentage = protocolLimits().maxRoyaltyPercentage;
        uint256 royaltyRecipientsStorageLength = royaltyRecipients.length + 1;
        for (uint256 i = 0; i < _royaltyRecipients.length; ) {
            // Cache storage pointer to avoid multiple lookups
            mapping(address => uint256) storage royaltyRecipientIndexByRecipient = lookups
                .royaltyRecipientIndexBySellerAndRecipient[_sellerId];

            if (
                _royaltyRecipients[i].wallet == treasury ||
                _royaltyRecipients[i].wallet == address(0) ||
                royaltyRecipientIndexByRecipient[_royaltyRecipients[i].wallet] != 0
            ) revert RecipientNotUnique();

            if (_royaltyRecipients[i].minRoyaltyPercentage > maxRoyaltyPercentage) revert InvalidRoyaltyPercentage();

            royaltyRecipients.push(_royaltyRecipients[i]);
            royaltyRecipientIndexByRecipient[_royaltyRecipients[i].wallet] = royaltyRecipientsStorageLength + i;

            createRoyaltyRecipientAccount(_royaltyRecipients[i].wallet);

            unchecked {
                i++;
            }
        }

        emit RoyaltyRecipientsChanged(_sellerId, fetchRoyaltyRecipients(_sellerId), sender);
    }

    function createRoyaltyRecipientAccount(address payable _royaltyRecipient) internal {
        mapping(address => uint256) storage royaltyRecipientIdByWallet = protocolLookups().royaltyRecipientIdByWallet;
        // If account exists, do nothing
        if (royaltyRecipientIdByWallet[_royaltyRecipient] > 0) {
            return;
        }

        uint256 royaltyRecipientId = protocolCounters().nextAccountId++;

        protocolEntities().royaltyRecipients[royaltyRecipientId] = RoyaltyRecipient({
            id: royaltyRecipientId,
            wallet: _royaltyRecipient
        });

        royaltyRecipientIdByWallet[_royaltyRecipient] = royaltyRecipientId;
    }

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
        RoyaltyRecipientInfo[] calldata _royaltyRecipients
    ) external sellersNotPaused nonReentrant {
        // Cache protocol lookups and sender for reference
        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();

        // Make sure admin is the caller and get the seller
        address treasury;
        {
            (Seller storage seller, ) = validateAdminStatus(lookups, _sellerId);
            treasury = seller.treasury;
        }

        uint256 royaltyRecipientIdsLength = _royaltyRecipientIds.length;
        if (royaltyRecipientIdsLength != _royaltyRecipients.length) revert ArrayLengthMismatch();

        RoyaltyRecipientInfo[] storage royaltyRecipients = lookups.royaltyRecipientsBySeller[_sellerId];
        uint256 royaltyRecipientsLength = royaltyRecipients.length;
        for (uint256 i = 0; i < royaltyRecipientIdsLength; ) {
            uint256 royaltyRecipientId = _royaltyRecipientIds[i];

            if (royaltyRecipientId >= royaltyRecipientsLength) revert InvalidRoyaltyRecipientId();

            if (_royaltyRecipients[i].wallet == treasury) revert RecipientNotUnique();

            if (royaltyRecipientId == 0) {
                if (_royaltyRecipients[i].wallet != address(0)) revert WrongDefaultRecipient();
            } else {
                // Cache storage pointer to avoid multiple lookups
                mapping(address => uint256) storage royaltyRecipientIndexByRecipient = lookups
                    .royaltyRecipientIndexBySellerAndRecipient[_sellerId];

                uint256 royaltyRecipientIndex = royaltyRecipientIndexByRecipient[_royaltyRecipients[i].wallet];

                if (royaltyRecipientIndex == 0) {
                    if (_royaltyRecipients[i].wallet == address(0)) revert RecipientNotUnique();

                    // update index
                    royaltyRecipientIndexByRecipient[_royaltyRecipients[i].wallet] = royaltyRecipientId + 1;
                    delete royaltyRecipientIndexByRecipient[royaltyRecipients[royaltyRecipientId].wallet];
                } else {
                    if (royaltyRecipientIndex - 1 != royaltyRecipientId) revert RecipientNotUnique();
                }
            }
            if (_royaltyRecipients[i].minRoyaltyPercentage > protocolLimits().maxRoyaltyPercentage)
                revert InvalidRoyaltyPercentage();

            royaltyRecipients[royaltyRecipientId] = _royaltyRecipients[i];

            createRoyaltyRecipientAccount(_royaltyRecipients[i].wallet);

            unchecked {
                i++;
            }
        }

        emit RoyaltyRecipientsChanged(_sellerId, fetchRoyaltyRecipients(_sellerId), _msgSender());
    }

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
    function removeRoyaltyRecipients(
        uint256 _sellerId,
        uint256[] calldata _royaltyRecipientIds
    ) external sellersNotPaused nonReentrant {
        // Cache protocol lookups and sender for reference
        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();

        // Make sure admin is the caller and get the sender's address
        (, address sender) = validateAdminStatus(lookups, _sellerId);

        RoyaltyRecipientInfo[] storage royaltyRecipients = lookups.royaltyRecipientsBySeller[_sellerId];

        // We loop from the end of the array to ensure correct ids are removed
        // _royaltyRecipients must be sorted in ascending order
        uint256 previousId = royaltyRecipients.length; // this is 1 more than the max id. This is used to ensure that royaltyRecipients is sorted in ascending order
        uint256 lastRoyaltyRecipientsId = previousId - 1; // will never underflow, since at least default recipient always exists

        for (uint256 i = _royaltyRecipientIds.length; i > 0; ) {
            uint256 royaltyRecipientId = _royaltyRecipientIds[i - 1];

            if (royaltyRecipientId >= previousId) revert RoyaltyRecipientIdsNotSorted(); // this also ensures that royaltyRecipientId will never be out of bounds
            if (royaltyRecipientId == 0) revert CannotRemoveDefaultRecipient();

            // Cache storage pointer to avoid multiple lookups
            mapping(address => uint256) storage royaltyRecipientIndexByRecipient = lookups
                .royaltyRecipientIndexBySellerAndRecipient[_sellerId];

            delete royaltyRecipientIndexByRecipient[royaltyRecipients[royaltyRecipientId].wallet];

            if (royaltyRecipientId != lastRoyaltyRecipientsId) {
                royaltyRecipients[royaltyRecipientId] = royaltyRecipients[lastRoyaltyRecipientsId];
                royaltyRecipientIndexByRecipient[royaltyRecipients[royaltyRecipientId].wallet] = royaltyRecipientId;
            }
            royaltyRecipients.pop();
            lastRoyaltyRecipientsId--; // will never underflow. Even if all non-default royalty recipients are removed, default recipient will remain

            // Update previous id
            previousId = royaltyRecipientId;

            unchecked {
                i--;
            }
        }

        emit RoyaltyRecipientsChanged(_sellerId, fetchRoyaltyRecipients(_sellerId), sender);
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
            return fetchSellerWithoutClerk(sellerId);
        }
    }

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
    ) external view returns (address defaultVoucherAddress, Collection[] memory additionalCollections) {
        ProtocolLib.ProtocolLookups storage pl = protocolLookups();
        return (pl.cloneAddress[_sellerId], pl.additionalCollections[_sellerId]);
    }

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
    ) external view returns (address defaultVoucherAddress, Collection[] memory additionalCollections) {
        ProtocolLib.ProtocolLookups storage pl = protocolLookups();
        Collection[] storage sellersAdditionalCollections = pl.additionalCollections[_sellerId];
        uint256 collectionCount = sellersAdditionalCollections.length;

        if (_offset >= collectionCount) {
            return (pl.cloneAddress[_sellerId], new Collection[](0));
        } else if (_offset + _limit > collectionCount) {
            _limit = collectionCount - _offset;
        }

        additionalCollections = new Collection[](_limit);

        for (uint256 i = 0; i < _limit; ) {
            additionalCollections[i] = sellersAdditionalCollections[_offset++];
            unchecked {
                i++;
            }
        }

        return (pl.cloneAddress[_sellerId], additionalCollections);
    }

    /**
     * @notice Returns the number of additional collections for a seller.
     * Use this in conjunction with getSellersCollectionsPaginated to get all collections.
     *
     * @param _sellerId - the id of the seller to check
     */
    function getSellersCollectionCount(uint256 _sellerId) external view returns (uint256 collectionCount) {
        return protocolLookups().additionalCollections[_sellerId].length;
    }

    /**
     * @notice Returns the availability of salt for a seller.
     *
     * @param _adminAddres - the admin address to check
     * @param _salt - the salt to check (corresponds to `collectionSalt` when `createSeller` or `createNewCollection` is called or `newSalt` when `updateSellerSalt` is called)
     * @return isAvailable - salt can be used
     */
    function isSellerSaltAvailable(address _adminAddres, bytes32 _salt) external view returns (bool isAvailable) {
        bytes32 sellerSalt = keccak256(abi.encodePacked(_adminAddres, _salt));
        return !protocolLookups().isUsedSellerSalt[sellerSalt];
    }

    /**
     * @notice Calculates the expected collection address and tells if it's still available.
     *
     * @param _sellerId - the seller id
     * @param _collectionSalt - the collection specific salt
     * @return collectionAddress - the collection address
     * @return isAvailable - whether the collection address is available
     */
    function calculateCollectionAddress(
        uint256 _sellerId,
        bytes32 _collectionSalt
    ) external view returns (address collectionAddress, bool isAvailable) {
        (bool exist, Seller storage seller, AuthToken storage authToken) = fetchSeller(_sellerId);
        if (!exist) {
            return (address(0), false);
        }

        // get seller salt
        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();
        bytes32 sellerSalt = lookups.sellerSalt[_sellerId];

        // If seller salt is not set, calculate it
        if (sellerSalt == 0) {
            address admin = seller.admin;
            if (admin == address(0)) {
                admin = IERC721(lookups.authTokenContracts[authToken.tokenType]).ownerOf(authToken.tokenId);
            }
            sellerSalt = keccak256(abi.encodePacked(admin, _collectionSalt));
        }

        // Calculate collection address
        bytes32 collectionSalt = keccak256(abi.encodePacked(sellerSalt, _collectionSalt));
        bytes32 bytecodeHash = keccak256(
            abi.encodePacked(
                bytes20(hex"3d602d80600a3d3981f3363d3d373d3d3d363d73"),
                protocolAddresses().beaconProxy,
                bytes15(0x5af43d82803e903d91602b57fd5bf3)
            )
        );

        collectionAddress = Create2.computeAddress(collectionSalt, bytecodeHash, address(this));

        // Check if collection address is available
        isAvailable = !Address.isContract(collectionAddress);
    }

    /**
     * @notice Gets seller's royalty recipients.
     *
     * @param _sellerId - seller id
     * @return royaltyRecipients - list of royalty recipients
     */
    function getRoyaltyRecipients(
        uint256 _sellerId
    ) external view returns (RoyaltyRecipientInfo[] memory royaltyRecipients) {
        return fetchRoyaltyRecipients(_sellerId);
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

            if ((check1 != 0 && check1 != _sellerId) || (check2 != 0 && check2 != _sellerId))
                revert SellerAddressMustBeUnique();
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

    /**
     * @notice Performs a validation that the message sender is either the admin address or the owner of auth token
     * Reverts if:
     *   - Seller uses address for authorization and supplied address is not the seller's admin address
     *   - Seller uses NFT Auth for authorization and supplied address is not the owner of auth NFT
     *
     * @param _lookups - the lookups struct
     * @param _authToken - the auth token to check
     * @param _admin - the admin address to check
     * @param _sender - the sender's address to check
     */
    function authorizeAdmin(
        ProtocolLib.ProtocolLookups storage _lookups,
        AuthToken storage _authToken,
        address _admin,
        address _sender
    ) internal view {
        if (_admin != address(0)) {
            if (_admin != _sender) revert NotAdmin();
        } else {
            address authTokenContract = _lookups.authTokenContracts[_authToken.tokenType];
            address tokenIdOwner = IERC721(authTokenContract).ownerOf(_authToken.tokenId);
            if (tokenIdOwner != _sender) revert NotAdmin();
        }
    }

    /**
     * @notice Gets seller and callers info and validates that the caller is authorized to call a function.
     *
     * Reverts if:
     *   - Seller does not exist
     *   - Seller uses address for authorization and caller is not the seller's admin address
     *   - Seller uses NFT Auth for authorization and caller is not the owner of auth NFT
     *
     * @param _lookups - the lookups struct
     * @param _sellerId - the id of the seller to check
     * @return seller - the seller storage pointer. See {BosonTypes.Seller}
     * @return sender - the caller's address
     */
    function validateAdminStatus(
        ProtocolLib.ProtocolLookups storage _lookups,
        uint256 _sellerId
    ) internal view returns (Seller storage seller, address sender) {
        // Get message sender
        sender = _msgSender();

        // Check Seller exists in sellers mapping
        bool exists;
        AuthToken storage authToken;
        (exists, seller, authToken) = fetchSeller(_sellerId);

        // Seller must already exist
        if (!exists) revert NoSuchSeller();

        // Check that caller is authorized to call this function
        authorizeAdmin(_lookups, authToken, seller.admin, sender);
    }
}
