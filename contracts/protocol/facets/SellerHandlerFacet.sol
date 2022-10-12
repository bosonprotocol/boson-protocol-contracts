// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.9;

import "../../domain/BosonConstants.sol";
import { IBosonVoucher } from "../../interfaces/clients/IBosonVoucher.sol";
import { SellerBase } from "../bases/SellerBase.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";
import { IERC721 } from "../../interfaces/IERC721.sol";

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
     * - Caller is not the supplied operator and clerk revert reason
     * - The sellers region of protocol is paused
     * - Address values are zero address
     * - Addresses are not unique to this seller
     * - Seller is not active (if active == false)
     * - Admin address is zero address and AuthTokenType == None
     * - AuthTokenType is not unique to this seller
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
     * @notice Updates a seller, with the exception of the active flag.
     *         All other fields should be filled, even those staying the same.
     * @dev    Active flag passed in by caller will be ignored. The value from storage will be used.
     *
     * Emits a SellerUpdated event if successful.
     *
     * Reverts if:
     * - The sellers region of protocol is paused
     * - Address values are zero address
     * - Addresses are not unique to this seller
     * - Caller is not the admin address of the seller
     * - Seller does not exist
     * - Admin address is zero address and AuthTokenType == None
     * - AuthTokenType is not unique to this seller
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

        preUpdateSellerCheck(_seller.id, _seller.admin, lookups);
        preUpdateSellerCheck(_seller.id, _seller.operator, lookups);
        preUpdateSellerCheck(_seller.id, _seller.clerk, lookups);

        // Clean old seller pending update data if exists
        delete lookups.sellerPendingUpdates[_seller.id];

        // @TODO check if using uint256 is better on gas efficiency
        bool needsApproval;

        Seller storage sellerPendingUpdates = lookups.sellerPendingUpdates[_seller.id];
        AuthToken storage authTokenPendingUpdate = lookups.sellerPendingAuthTokenUpdate[_seller.id];

        // Admin address or AuthToken data must be present in parameters. A seller can have one or the other. Check passed in parameters
        if (_authToken.tokenType != AuthTokenType.None) {
            // Check that auth token is unique to this seller
            uint256 check = lookups.sellerIdByAuthToken[_authToken.tokenType][_authToken.tokenId];
            require(check == 0 || check == _seller.id, AUTH_TOKEN_MUST_BE_UNIQUE);

            // Auth token owner must approve the update to prevent front-running
            authTokenPendingUpdate.tokenType = _authToken.tokenType;
            authTokenPendingUpdate.tokenId = _authToken.tokenId;
            needsApproval = true;
        } else {
            if (seller.admin != _seller.admin) {
                require(_seller.admin != address(0), INVALID_ADDRESS);
                // If admin address exists, admin address owner must approve the update to prevent front-running
                sellerPendingUpdates.admin = _seller.admin;
                needsApproval = true;
            }
        }

        if (_seller.operator != seller.operator) {
            require(_seller.operator != address(0), INVALID_ADDRESS);
            // Operator address owner must approve the update to prevent front-running
            sellerPendingUpdates.operator = _seller.operator;
            needsApproval = true;
        }

        if (_seller.clerk != seller.clerk) {
            require(_seller.clerk != address(0), INVALID_ADDRESS);
            // Clerk address owner must approve the update to prevent front-running
            sellerPendingUpdates.clerk = _seller.clerk;
            needsApproval = true;
        }

        if (needsApproval) {
            emit SellerUpdatePending(_seller.id, sellerPendingUpdates, authTokenPendingUpdate, sender);
        }

        if (seller.treasury != _seller.treasury) {
            require(_seller.treasury != address(0), INVALID_ADDRESS);
            // Update treasury
            seller.treasury = _seller.treasury;

            // Notify watchers of state change
            emit SellerUpdateApplied(
                _seller.id,
                seller,
                sellerPendingUpdates,
                authToken,
                authTokenPendingUpdate,
                sender
            );
        }
    }

    // Cache protocol lookups for reference
    function optInToSellerUpdate(uint256 _sellerId) external {
        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();
        address sender = msgSender();

        // Get seller pending update
        (
            bool exists,
            Seller storage sellerPendingUpdate,
            AuthToken storage authTokenPendingUpdate
        ) = fetchSellerPendingUpdate(_sellerId);

        require(exists, NO_PENDING_SELLER_ROLE_UPDATE);

        preUpdateSellerCheck(_sellerId, sender, lookups);

        // Get storage location for seller
        (, Seller storage seller, AuthToken storage authToken) = fetchSeller(_sellerId);

        // Approve operator address
        if (sellerPendingUpdate.operator != address(0) && sellerPendingUpdate.operator == sender) {
            delete lookups.sellerIdByOperator[seller.operator];

            // Update operator
            seller.operator = sellerPendingUpdate.operator;

            // Transfer ownership of NFT voucher to new operator
            IBosonVoucher(lookups.cloneAddress[_sellerId]).transferOwnership(sender);

            // Store new seller id by operator mapping
            lookups.sellerIdByOperator[sender] = _sellerId;

            // Delete pending update operator
            delete sellerPendingUpdate.operator;
        }

        // Approve admin address
        if (sellerPendingUpdate.admin != address(0) && sellerPendingUpdate.admin == sender) {
            // Delete old seller id by admin mapping
            delete lookups.sellerIdByAdmin[seller.admin];

            // Update admin
            seller.admin = sellerPendingUpdate.admin;

            // Store new seller id by admin mapping
            lookups.sellerIdByAdmin[sender] = _sellerId;

            // Delete pending update admin
            delete sellerPendingUpdate.admin;
            // Delete auth token for seller id if it exists
            delete protocolEntities().authTokens[_sellerId];
        }

        // Aprove clerk address
        if (sellerPendingUpdate.clerk != address(0) && sellerPendingUpdate.clerk == sender) {
            // Delete old seller id by clerk mapping
            delete lookups.sellerIdByClerk[seller.clerk];

            // Update clerk
            seller.clerk = sellerPendingUpdate.clerk;

            // Store new seller id by clerk mapping
            lookups.sellerIdByClerk[sender] = _sellerId;

            // Delete pending update clerk
            delete sellerPendingUpdate.clerk;
        }

        if (authTokenPendingUpdate.tokenType != AuthTokenType.None) {
            address authTokenContract = lookups.authTokenContracts[authTokenPendingUpdate.tokenType];
            address tokenIdOwner = IERC721(authTokenContract).ownerOf(authTokenPendingUpdate.tokenId);

            if (tokenIdOwner == sender) {
                // Check that auth token is unique to this seller
                uint256 check = lookups.sellerIdByAuthToken[authTokenPendingUpdate.tokenType][
                    authTokenPendingUpdate.tokenId
                ];
                require(check == 0 || check == _sellerId, AUTH_TOKEN_MUST_BE_UNIQUE);

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
            }
        }

        // Notify watchers of state change
        emit SellerUpdateApplied(_sellerId, seller, sellerPendingUpdate, authToken, authTokenPendingUpdate, sender);
    }

    function preUpdateSellerCheck(
        uint256 _sellerId,
        address _role,
        ProtocolLib.ProtocolLookups storage _lookups
    ) internal view {
        // Check that the role is unique to one seller id across all roles -- not used or is used by this seller id.
        if (_role != address(0)) {
            uint256 check1 = _lookups.sellerIdByOperator[_role];
            uint256 check2 = _lookups.sellerIdByClerk[_role];
            uint256 check3 = _lookups.sellerIdByAdmin[_role];

            require(
                (check1 == 0 || check1 == _sellerId) &&
                    (check2 == 0 || check2 == _sellerId) &&
                    (check3 == 0 || check3 == _sellerId),
                SELLER_ADDRESS_MUST_BE_UNIQUE
            );
        }
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
    function getSeller(uint256 _sellerId)
        external
        view
        returns (
            bool exists,
            Seller memory seller,
            AuthToken memory authToken
        )
    {
        return fetchSeller(_sellerId);
    }

    /**
     * @notice Gets the details about a seller by an address associated with that seller: operator, admin, or clerk address.
     * A seller will have either an admin address or an auth token.
     * If seller's admin uses NFT Auth the seller should call `getSellerByAuthToken` instead.
     *
     * @param _associatedAddress - the address associated with the seller. Must be an operator, admin, or clerk address.
     * @return exists - the seller was found
     * @return seller - the seller details. See {BosonTypes.Seller}
     * @return authToken - optional AuthToken struct that specifies an AuthToken type and tokenId that the seller can use to do admin functions
     *                     See {BosonTypes.AuthToken}
     */
    function getSellerByAddress(address _associatedAddress)
        external
        view
        returns (
            bool exists,
            Seller memory seller,
            AuthToken memory authToken
        )
    {
        uint256 sellerId;

        (exists, sellerId) = getSellerIdByOperator(_associatedAddress);
        if (exists) {
            return fetchSeller(sellerId);
        }

        (exists, sellerId) = getSellerIdByAdmin(_associatedAddress);
        if (exists) {
            return fetchSeller(sellerId);
        }

        (exists, sellerId) = getSellerIdByClerk(_associatedAddress);
        if (exists) {
            return fetchSeller(sellerId);
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
    function getSellerByAuthToken(AuthToken calldata _associatedAuthToken)
        external
        view
        returns (
            bool exists,
            Seller memory seller,
            AuthToken memory authToken
        )
    {
        uint256 sellerId;

        (exists, sellerId) = getSellerIdByAuthToken(_associatedAuthToken);
        if (exists) {
            return fetchSeller(sellerId);
        }
    }
}
