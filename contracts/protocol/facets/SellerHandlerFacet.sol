// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import "../../domain/BosonConstants.sol";
import { IBosonVoucher } from "../../interfaces/clients/IBosonVoucher.sol";
import { SellerBase } from "../bases/SellerBase.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";
import { IERC721 } from "../../interfaces/IERC721.sol";

/**
 * @title SellerHandlerFacet
 *
 * @notice Handles Seller account management requests and queries
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
            address authTokenContract = protocolLookups().authTokenContracts[authToken.tokenType];
            address tokenIdOwner = IERC721(authTokenContract).ownerOf(authToken.tokenId);
            require(tokenIdOwner == sender, NOT_ADMIN);
        } else {
            require(seller.admin == sender, NOT_ADMIN);
        }

        // Check that the passed in addresses are unique to one seller id across all roles -- not used or are used by this seller id.
        // Checking this seller id is necessary because one or more addresses may not change
        require(
            (protocolLookups().sellerIdByOperator[_seller.operator] == 0 ||
                protocolLookups().sellerIdByOperator[_seller.operator] == _seller.id) &&
                (protocolLookups().sellerIdByOperator[_seller.clerk] == 0 ||
                    protocolLookups().sellerIdByOperator[_seller.clerk] == _seller.id) &&
                (protocolLookups().sellerIdByAdmin[_seller.operator] == 0 ||
                    protocolLookups().sellerIdByAdmin[_seller.operator] == _seller.id) &&
                (protocolLookups().sellerIdByAdmin[_seller.clerk] == 0 ||
                    protocolLookups().sellerIdByAdmin[_seller.clerk] == _seller.id) &&
                (protocolLookups().sellerIdByClerk[_seller.operator] == 0 ||
                    protocolLookups().sellerIdByClerk[_seller.operator] == _seller.id) &&
                (protocolLookups().sellerIdByClerk[_seller.clerk] == 0 ||
                    protocolLookups().sellerIdByClerk[_seller.clerk] == _seller.id),
            SELLER_ADDRESS_MUST_BE_UNIQUE
        );

        // Admin address or AuthToken data must be present in parameters. A seller can have one or the other. Check passed in parameters
        if (_seller.admin == address(0)) {
            // Check that auth token is unique to this seller
            require(
                protocolLookups().sellerIdByAuthToken[_authToken.tokenType][_authToken.tokenId] == 0 ||
                    protocolLookups().sellerIdByAuthToken[_authToken.tokenType][_authToken.tokenId] == _seller.id,
                AUTH_TOKEN_MUST_BE_UNIQUE
            );
        } else {
            // Check that the admin address is unique to one seller id across all roles -- not used or is used by this seller id.

            require(
                (protocolLookups().sellerIdByOperator[_seller.admin] == 0 ||
                    protocolLookups().sellerIdByOperator[_seller.admin] == _seller.id) &&
                    (protocolLookups().sellerIdByAdmin[_seller.admin] == 0 ||
                        protocolLookups().sellerIdByAdmin[_seller.admin] == _seller.id) &&
                    (protocolLookups().sellerIdByClerk[_seller.admin] == 0 ||
                        protocolLookups().sellerIdByClerk[_seller.admin] == _seller.id),
                SELLER_ADDRESS_MUST_BE_UNIQUE
            );
        }

        // Delete current mappings
        delete protocolLookups().sellerIdByOperator[seller.operator];
        delete protocolLookups().sellerIdByAdmin[seller.admin];
        delete protocolLookups().sellerIdByClerk[seller.clerk];
        delete protocolLookups().sellerIdByAuthToken[authToken.tokenType][authToken.tokenId];
        delete protocolEntities().authTokens[seller.id];

        // Store this address of existing seller operator to check if you have to transfer the ownership later
        address oldSellerOperator = seller.operator;

        // Ignore active flag passed in by caller and set to value in storage.
        _seller.active = seller.active;
        storeSeller(_seller, _authToken);

        // If operator changed, transfer the ownership of NFT voucher
        if (oldSellerOperator != _seller.operator) {
            IBosonVoucher(protocolLookups().cloneAddress[seller.id]).transferOwnership(_seller.operator);
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
