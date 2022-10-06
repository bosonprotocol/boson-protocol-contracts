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
        if (seller.admin == address(0)) {
            address authTokenContract = lookups.authTokenContracts[authToken.tokenType];
            address tokenIdOwner = IERC721(authTokenContract).ownerOf(authToken.tokenId);
            require(tokenIdOwner == sender, NOT_ADMIN);
        } else {
            require(seller.admin == sender, NOT_ADMIN);
        }

        // Check that the passed in addresses are unique to one seller id across all roles -- not used or are used by this seller id.
        // Checking this seller id is necessary because one or more addresses may not change
        {
            uint256 check1 = lookups.sellerIdByOperator[_seller.operator];
            uint256 check2 = lookups.sellerIdByOperator[_seller.clerk];
            uint256 check3 = lookups.sellerIdByAdmin[_seller.operator];
            uint256 check4 = lookups.sellerIdByAdmin[_seller.clerk];
            uint256 check5 = lookups.sellerIdByClerk[_seller.operator];
            uint256 check6 = lookups.sellerIdByClerk[_seller.clerk];
            require(
                (check1 == 0 || check1 == _seller.id) &&
                    (check2 == 0 || check2 == _seller.id) &&
                    (check3 == 0 || check3 == _seller.id) &&
                    (check4 == 0 || check4 == _seller.id) &&
                    (check5 == 0 || check5 == _seller.id) &&
                    (check6 == 0 || check6 == _seller.id),
                SELLER_ADDRESS_MUST_BE_UNIQUE
            );
        }

        // Admin address or AuthToken data must be present in parameters. A seller can have one or the other. Check passed in parameters
        if (_seller.admin == address(0)) {
            // Check that auth token is unique to this seller
            uint256 check = lookups.sellerIdByAuthToken[_authToken.tokenType][_authToken.tokenId];
            require(check == 0 || check == _seller.id, AUTH_TOKEN_MUST_BE_UNIQUE);
        } else {
            // Check that the admin address is unique to one seller id across all roles -- not used or is used by this seller id.
            uint256 check1 = lookups.sellerIdByOperator[_seller.admin];
            uint256 check2 = lookups.sellerIdByAdmin[_seller.admin];
            uint256 check3 = lookups.sellerIdByClerk[_seller.admin];
            require(
                (check1 == 0 || check1 == _seller.id) &&
                    (check2 == 0 || check2 == _seller.id) &&
                    (check3 == 0 || check3 == _seller.id),
                SELLER_ADDRESS_MUST_BE_UNIQUE
            );
        }

        // Delete current mappings
        delete lookups.sellerIdByOperator[seller.operator];
        delete lookups.sellerIdByAdmin[seller.admin];
        delete lookups.sellerIdByClerk[seller.clerk];
        delete lookups.sellerIdByAuthToken[authToken.tokenType][authToken.tokenId];
        delete protocolEntities().authTokens[seller.id];

        // Store this address of existing seller operator to check if you have to transfer the ownership later
        address oldSellerOperator = seller.operator;

        // Ignore active flag passed in by caller and set to value in storage.
        _seller.active = seller.active;
        storeSeller(_seller, _authToken);

        // If operator changed, transfer the ownership of NFT voucher
        if (oldSellerOperator != _seller.operator) {
            IBosonVoucher(lookups.cloneAddress[seller.id]).transferOwnership(_seller.operator);
        }

        // Notify watchers of state change
        emit SellerUpdated(_seller.id, _seller, _authToken, sender);
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
