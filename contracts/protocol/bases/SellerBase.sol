// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import "./../../domain/BosonConstants.sol";
import { IBosonAccountEvents } from "../../interfaces/events/IBosonAccountEvents.sol";
import { ProtocolBase } from "./ProtocolBase.sol";
import { ProtocolLib } from "./../libs/ProtocolLib.sol";
import { IInitializableVoucherClone } from "../../interfaces/IInitializableVoucherClone.sol";
import { IERC721 } from "../../interfaces/IERC721.sol";

/**
 * @title SellerBase
 *
 * @dev Provides methods for seller creation that can be shared across facets
 */
contract SellerBase is ProtocolBase, IBosonAccountEvents {
    /**
     * @notice Creates a seller.
     *
     * Emits a SellerCreated event if successful.
     *
     * Reverts if:
     * - Caller is not the supplied assistant
     * - Supplied clerk is not a zero address
     * - The sellers region of protocol is paused
     * - Address values are zero address
     * - Addresses are not unique to this seller
     * - Caller is not the admin address of the stored seller
     * - Caller is not the address of the owner of the stored AuthToken
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
    function createSellerInternal(
        Seller memory _seller,
        AuthToken calldata _authToken,
        VoucherInitValues calldata _voucherInitValues
    ) internal {
        // Check active is not set to false
        if (!_seller.active) revert MustBeActive();

        // Check for zero address
        if (_seller.assistant == address(0) || _seller.treasury == address(0)) revert InvalidAddress();

        // Admin address or AuthToken data must be present. A seller can have one or the other
        if (
            (_seller.admin == address(0) && _authToken.tokenType == AuthTokenType.None) ||
            (_seller.admin != address(0) && _authToken.tokenType != AuthTokenType.None)
        ) revert AdminOrAuthToken();

        // Cache protocol lookups for reference
        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();

        // Get message sender
        address sender = _msgSender();

        // Check that caller is the supplied assistant
        if (_seller.assistant != sender) revert NotAssistant();
        if (_seller.clerk != address(0)) revert ClerkDeprecated();

        // Do caller and uniqueness checks based on auth type
        if (_authToken.tokenType != AuthTokenType.None) {
            if (_authToken.tokenType == AuthTokenType.Custom) revert InvalidAuthTokenType();

            // Check that caller owns the auth token
            address authTokenContract = lookups.authTokenContracts[_authToken.tokenType];
            address tokenIdOwner = IERC721(authTokenContract).ownerOf(_authToken.tokenId);
            if (tokenIdOwner != sender) revert NotAdmin();

            // Check that auth token is unique to this seller
            if (lookups.sellerIdByAuthToken[_authToken.tokenType][_authToken.tokenId] != 0)
                revert AuthTokenMustBeUnique();
        } else {
            // Check that caller is supplied admin
            if (_seller.admin != sender) revert NotAdmin();
        }

        // Check that the sender address is unique to one seller id, across all roles
        if (lookups.sellerIdByAdmin[sender] != 0 || lookups.sellerIdByAssistant[sender] != 0)
            revert SellerAddressMustBeUnique();

        // Get the next account id and increment the counter
        uint256 sellerId = protocolCounters().nextAccountId++;
        _seller.id = sellerId;
        storeSeller(_seller, _authToken, lookups);

        // Set treasury as the default royalty recipient
        if (_voucherInitValues.royaltyPercentage > protocolLimits().maxRoyaltyPercentage)
            revert InvalidRoyaltyPercentage();
        RoyaltyRecipientInfo[] storage royaltyRecipients = lookups.royaltyRecipientsBySeller[sellerId];
        RoyaltyRecipientInfo storage defaultRoyaltyRecipient = royaltyRecipients.push();
        // We don't store the defaultRoyaltyRecipient.wallet, since it's always the trasury
        defaultRoyaltyRecipient.minRoyaltyPercentage = _voucherInitValues.royaltyPercentage;

        // Calculate seller salt and check that it is unique
        bytes32 sellerSalt = keccak256(abi.encodePacked(sender, _voucherInitValues.collectionSalt));
        if (lookups.isUsedSellerSalt[sellerSalt]) revert SellerSaltNotUnique();
        lookups.sellerSalt[sellerId] = sellerSalt;
        lookups.isUsedSellerSalt[sellerSalt] = true;

        // Create clone and store its address cloneAddress
        address voucherCloneAddress = cloneBosonVoucher(sellerId, 0, sellerSalt, _seller.assistant, _voucherInitValues);
        lookups.cloneAddress[sellerId] = voucherCloneAddress;

        // Notify watchers of state change
        emit SellerCreated(sellerId, _seller, voucherCloneAddress, _authToken, sender);
        emit RoyaltyRecipientsChanged(sellerId, fetchRoyaltyRecipients(sellerId), sender);
    }

    /**
     * @notice Validates seller struct and stores it to storage, along with auth token if present.
     *
     * @param _seller - the fully populated struct with seller id set
     * @param _authToken - optional AuthToken struct that specifies an AuthToken type and tokenId that the seller can use to do admin functions
     * @param _lookups - ProtocolLib.ProtocolLookups struct
     */
    function storeSeller(
        Seller memory _seller,
        AuthToken calldata _authToken,
        ProtocolLib.ProtocolLookups storage _lookups
    ) internal {
        // Get storage location for seller
        (, Seller storage seller, AuthToken storage authToken) = fetchSeller(_seller.id);

        // Set seller props individually since memory structs can't be copied to storage
        seller.id = _seller.id;
        seller.assistant = _seller.assistant;
        seller.admin = _seller.admin;
        seller.treasury = _seller.treasury;
        seller.active = _seller.active;
        seller.metadataUri = _seller.metadataUri;

        // Auth token passed in
        if (_authToken.tokenType != AuthTokenType.None) {
            // Store auth token
            authToken.tokenId = _authToken.tokenId;
            authToken.tokenType = _authToken.tokenType;

            // Store seller by auth token reference
            _lookups.sellerIdByAuthToken[_authToken.tokenType][_authToken.tokenId] = _seller.id;
        } else {
            // Empty auth token passed in
            // Store admin address reference
            _lookups.sellerIdByAdmin[_seller.admin] = _seller.id;
        }

        // Map the seller's other addresses to the seller id. It's not necessary to map the treasury address, as it only receives funds
        _lookups.sellerIdByAssistant[_seller.assistant] = _seller.id;
    }

    /**
     * @notice Creates a minimal clone of the Boson Voucher Contract.
     *
     * Reverts if clone creation fails.
     *
     * @param _sellerId - id of the seller
     * @param _collectionIndex - index of the collection.
     * @param _sellerSalt - seller dependent salt, used to create the clone address
     * @param _assistant - address of the assistant
     * @param _voucherInitValues - the fully populated BosonTypes.VoucherInitValues struct
     * @return cloneAddress - the address of newly created clone
     */
    function cloneBosonVoucher(
        uint256 _sellerId,
        uint256 _collectionIndex,
        bytes32 _sellerSalt,
        address _assistant,
        VoucherInitValues calldata _voucherInitValues
    ) internal returns (address cloneAddress) {
        // Pointer to stored addresses
        ProtocolLib.ProtocolAddresses storage pa = protocolAddresses();

        // Load beacon proxy contract address
        bytes20 targetBytes = bytes20(pa.beaconProxy);
        bytes32 collectionSalt = keccak256(abi.encodePacked(_sellerSalt, _voucherInitValues.collectionSalt));

        // create a minimal clone
        assembly {
            let clone := mload(0x40)
            mstore(clone, 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000000000000000000000)
            mstore(add(clone, 0x14), targetBytes)
            mstore(add(clone, 0x28), 0x5af43d82803e903d91602b57fd5bf30000000000000000000000000000000000)
            cloneAddress := create2(0, clone, 0x37, collectionSalt)
        }

        if (cloneAddress == address(0)) revert CloneCreationFailed();

        // Initialize the clone
        IInitializableVoucherClone(cloneAddress).initialize(pa.voucherBeacon);
        IInitializableVoucherClone(cloneAddress).initializeVoucher(
            _sellerId,
            _collectionIndex,
            _assistant,
            _voucherInitValues
        );
    }

    /**
     * @notice Fetches a given seller pending update from storage by id
     *
     * @param _sellerId - the id of the seller
     * @return exists - whether the seller or auth token pending update exists
     * @return sellerPendingUpdate - the seller pending update details. See {BosonTypes.Seller}
     * @return authTokenPendingUpdate - auth token pending update details
     */
    function fetchSellerPendingUpdate(
        uint256 _sellerId
    )
        internal
        view
        returns (bool exists, Seller storage sellerPendingUpdate, AuthToken storage authTokenPendingUpdate)
    {
        // Cache protocol entities for reference
        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();

        // Get the seller pending update slot
        sellerPendingUpdate = lookups.pendingAddressUpdatesBySeller[_sellerId];

        //Get the seller auth token pending update slot
        authTokenPendingUpdate = lookups.pendingAuthTokenUpdatesBySeller[_sellerId];

        // Determine existence
        exists =
            sellerPendingUpdate.admin != address(0) ||
            sellerPendingUpdate.assistant != address(0) ||
            authTokenPendingUpdate.tokenType != AuthTokenType.None;
    }

    /**
     * @notice Gets seller's royalty recipients.
     *
     * @param _sellerId - seller id
     * @return royaltyRecipients - list of royalty recipients
     */
    function fetchRoyaltyRecipients(
        uint256 _sellerId
    ) internal view returns (RoyaltyRecipientInfo[] memory royaltyRecipients) {
        return protocolLookups().royaltyRecipientsBySeller[_sellerId];
    }
}
