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
        if (_authToken.tokenType != AuthTokenType.None) {
            address authTokenContract = lookups.authTokenContracts[authToken.tokenType];
            address tokenIdOwner = IERC721(authTokenContract).ownerOf(authToken.tokenId);
            require(tokenIdOwner == sender, NOT_ADMIN);
        } else {
            require(seller.admin == sender, NOT_ADMIN);
        }

        sellerPreUpdateChecks(_seller.id, _seller.admin, lookups);
        sellerPreUpdateChecks(_seller.id, _seller.operator, lookups);
        sellerPreUpdateChecks(_seller.id, _seller.clerk, lookups);

        // Clean old seller pending update data if exists
        delete lookups.sellerPendingUpdates[_seller.id];

        bool needsApproval;

        // Admin address or AuthToken data must be present in parameters. A seller can have one or the other. Check passed in parameters
        if (_authToken.tokenType != AuthTokenType.None) {
            // Check that auth token is unique to this seller
            uint256 check = lookups.sellerIdByAuthToken[_authToken.tokenType][_authToken.tokenId];
            require(check == 0 || check == _seller.id, AUTH_TOKEN_MUST_BE_UNIQUE);

            // Store auth token
            authToken.tokenId = _authToken.tokenId;
            authToken.tokenType = _authToken.tokenType;

            delete lookups.sellerIdByAuthToken[authToken.tokenType][authToken.tokenId];

            // Store seller by auth token reference
            lookups.sellerIdByAuthToken[_authToken.tokenType][_authToken.tokenId] = _seller.id;

            // Remove previous admin address if it exists
            delete lookups.sellerIdByAdmin[seller.admin];
            delete seller.admin;
        } else {
            if (_seller.admin != seller.admin) {
                require(_seller.admin != address(0), INVALID_ADDRESS);
                // If admin address exists, admin address owner must approve the update for prevent front-running
                lookups.sellerPendingUpdates[_seller.id].admin = _seller.admin;
                needsApproval = true;
            }
        }

        if (seller.treasury != _seller.treasury) {
            require(_seller.treasury != address(0), INVALID_ADDRESS);
            // Update treasury
            seller.treasury = _seller.treasury;
        }

        if (_seller.operator != seller.operator) {
            require(_seller.operator != address(0), INVALID_ADDRESS);
            // Operator address owner must approve the update for prevent front-running
            lookups.sellerPendingUpdates[_seller.id].operator = _seller.operator;
            needsApproval = true;
        }

        if (_seller.clerk != seller.clerk) {
            require(_seller.clerk != address(0), INVALID_ADDRESS);
            // Clerk address owner must approve the update for prevent front-running
            lookups.sellerPendingUpdates[_seller.id].clerk = _seller.clerk;
            needsApproval = true;
        }

        if (needsApproval) {
            lookups.sellerPendingUpdates[_seller.id].id = _seller.id;
            emit SellerUpdateRolesRequested(_seller.id, _seller, sender);
        }

        // Notify watchers of state change
        emit SellerUpdated(_seller.id, seller, _authToken, sender);
    }

    function approveSellerUpdate(uint256 _sellerId) external {
        // Cache protocol lookups for reference
        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();
        address sender = msgSender();

        // Get seller pending update
        Seller storage _sellerPendingUpdate = lookups.sellerPendingUpdates[_sellerId];

        require(
            _sellerPendingUpdate.admin != address(0) ||
                _sellerPendingUpdate.operator != address(0) ||
                _sellerPendingUpdate.clerk != address(0),
            NO_PENDING_SELLER_ROLE_UPDATE
        );

        sellerPreUpdateChecks(_sellerId, _sellerPendingUpdate.admin, lookups);
        sellerPreUpdateChecks(_sellerId, _sellerPendingUpdate.operator, lookups);
        sellerPreUpdateChecks(_sellerId, _sellerPendingUpdate.clerk, lookups);

        // Get storage location for seller
        (, Seller storage seller, ) = fetchSeller(_sellerId);

        // Approve operator address
        if (_sellerPendingUpdate.operator == sender) {
            // If operator changed, update the operator and transfer the ownership of NFT voucher
            if (seller.operator != _sellerPendingUpdate.operator) {
                delete lookups.sellerIdByOperator[seller.operator];

                // Update operator
                seller.operator = _sellerPendingUpdate.operator;

                // Transfer ownership of NFT voucher to new operator
                IBosonVoucher(lookups.cloneAddress[seller.id]).transferOwnership(seller.operator);

                // Store new seller id by operator mapping
                lookups.sellerIdByOperator[sender] = _sellerId;
            }

            // Delete pending update operator
            delete _sellerPendingUpdate.operator;
        }

        // Approve admin address
        if (_sellerPendingUpdate.admin == sender) {
            if (seller.admin != _sellerPendingUpdate.admin) {
                // Delete old seller id by admin mapping
                delete lookups.sellerIdByAdmin[seller.admin];

                // Update admin
                seller.admin = _sellerPendingUpdate.admin;

                // Store new seller id by admin mapping
                lookups.sellerIdByAdmin[sender] = _sellerId;
            }

            // Delete pending update admin
            delete _sellerPendingUpdate.admin;
            // Delete auth token for seller id if it exists
            delete protocolEntities().authTokens[seller.id];
        }

        // Aprove clerk address
        if (_sellerPendingUpdate.clerk == sender) {
            if (seller.clerk != _sellerPendingUpdate.clerk) {
                // Delete old seller id by clerk mapping
                delete lookups.sellerIdByClerk[seller.clerk];

                // Update clerk
                seller.clerk = _sellerPendingUpdate.clerk;

                // Store new seller id by clerk mapping
                lookups.sellerIdByClerk[sender] = _sellerId;
            }

            // Delete pending update clerk
            delete _sellerPendingUpdate.clerk;
        }

        // Notify watchers of state change
        emit SellerUpdateRolesApproved(_sellerId, seller, sender);
    }

    function sellerPreUpdateChecks(
        uint256 _sellerId,
        address _role,
        ProtocolLib.ProtocolLookups storage _lookups
    ) internal view {
        // Check that the role is unique to one seller id across all roles -- not used or are used by this seller id.
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
