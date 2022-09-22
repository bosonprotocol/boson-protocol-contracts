// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "./../../domain/BosonConstants.sol";
import { IBosonAccountEvents } from "../../interfaces/events/IBosonAccountEvents.sol";
import { ProtocolBase } from "./ProtocolBase.sol";
import { ProtocolLib } from "./../libs/ProtocolLib.sol";
import { BosonTypes } from "../../domain/BosonTypes.sol";
import { IInitializableVoucherClone } from "../../interfaces/IInitializableVoucherClone.sol";

/**
 * @title SellerBase
 *
 * @dev Provides methods for seller creation that can be shared accross facets
 */
contract SellerBase is ProtocolBase, IBosonAccountEvents {
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
    function createSellerInternal(
        Seller memory _seller,
        AuthToken calldata _authToken,
        VoucherInitValues calldata _voucherInitValues
    ) internal {
        // Cache protocol lookups for reference
        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();

        // Check active is not set to false
        require(_seller.active, MUST_BE_ACTIVE);

        // Admin address or AuthToken data must be present. A seller can have one or the other
        require(
            (_seller.admin == address(0) && _authToken.tokenType != AuthTokenType.None) ||
                (_seller.admin != address(0) && _authToken.tokenType == AuthTokenType.None),
            ADMIN_OR_AUTH_TOKEN
        );

        // Check that the addresses are unique to one seller id, accross all roles. These addresses should always be checked. Treasury is not checked
        require(
            lookups.sellerIdByOperator[_seller.operator] == 0 &&
                lookups.sellerIdByOperator[_seller.clerk] == 0 &&
                lookups.sellerIdByAdmin[_seller.operator] == 0 &&
                lookups.sellerIdByAdmin[_seller.clerk] == 0 &&
                lookups.sellerIdByClerk[_seller.operator] == 0 &&
                lookups.sellerIdByClerk[_seller.clerk] == 0,
            SELLER_ADDRESS_MUST_BE_UNIQUE
        );

        // Do other uniqueness checks based on auth type
        if (_seller.admin == address(0)) {
            // Check that auth token is unique to this seller
            require(
                lookups.sellerIdByAuthToken[_authToken.tokenType][_authToken.tokenId] == 0,
                AUTH_TOKEN_MUST_BE_UNIQUE
            );
        } else {
            // Check that the admin address is unique to one seller id, accross all roles
            require(
                lookups.sellerIdByOperator[_seller.admin] == 0 &&
                    lookups.sellerIdByAdmin[_seller.admin] == 0 &&
                    lookups.sellerIdByClerk[_seller.admin] == 0,
                SELLER_ADDRESS_MUST_BE_UNIQUE
            );
        }

        // Get the next account id and increment the counter
        uint256 sellerId = protocolCounters().nextAccountId++;
        _seller.id = sellerId;
        storeSeller(_seller, _authToken);

        // Create clone and store its address cloneAddress
        address voucherCloneAddress = cloneBosonVoucher(sellerId, _seller.operator, _voucherInitValues);
        lookups.cloneAddress[sellerId] = voucherCloneAddress;

        // Notify watchers of state change
        emit SellerCreated(sellerId, _seller, voucherCloneAddress, _authToken, msgSender());
    }

    /**
     * @notice Validates seller struct and stores it to storage, along with auth token if present.
     *
     * Reverts if:
     * - Address values are zero address
     * - Addresses are not unique to this seller
     *
     * @param _seller - the fully populated struct with seller id set
     * @param _authToken - optional AuthToken struct that specifies an AuthToken type and tokenId that the seller can use to do admin functions
     */

    function storeSeller(Seller memory _seller, AuthToken calldata _authToken) internal {
        // Cache protocol lookups for reference
        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();

        // Check for zero address
        require(
            _seller.operator != address(0) && _seller.clerk != address(0) && _seller.treasury != address(0),
            INVALID_ADDRESS
        );

        // Get storage location for seller
        (, Seller storage seller, AuthToken storage authToken) = fetchSeller(_seller.id);

        // Set seller props individually since memory structs can't be copied to storage
        seller.id = _seller.id;
        seller.operator = _seller.operator;
        seller.admin = _seller.admin;
        seller.clerk = _seller.clerk;
        seller.treasury = _seller.treasury;
        seller.active = _seller.active;

        // Auth token passed in
        if (_authToken.tokenType != AuthTokenType.None) {
            // Store auth token
            authToken.tokenId = _authToken.tokenId;
            authToken.tokenType = _authToken.tokenType;

            // Store seller by auth token reference
            lookups.sellerIdByAuthToken[_authToken.tokenType][_authToken.tokenId] = _seller.id;
        } else {
            // Empty auth token passed in
            // Store admin address reference
            lookups.sellerIdByAdmin[_seller.admin] = _seller.id;
        }

        // Map the seller's other addresses to the seller id. It's not necessary to map the treasury address, as it only receives funds
        lookups.sellerIdByOperator[_seller.operator] = _seller.id;
        lookups.sellerIdByClerk[_seller.clerk] = _seller.id;
    }

    /**
     * @notice Creates a minimal clone of the Boson Voucher Contract.
     *
     * @param _sellerId - id of the seller
     * @param _operator - address of the operator
     * @param _voucherInitValues - the fully populated BosonTypes.VoucherInitValues struct
     * @return cloneAddress - the address of newly created clone
     */
    function cloneBosonVoucher(
        uint256 _sellerId,
        address _operator,
        VoucherInitValues calldata _voucherInitValues
    ) internal returns (address cloneAddress) {
        // Pointer to stored addresses
        ProtocolLib.ProtocolAddresses storage pa = protocolAddresses();

        // Load beacon proxy contract address
        bytes20 targetBytes = bytes20(pa.beaconProxy);

        // create a minimal clone
        assembly {
            let clone := mload(0x40)
            mstore(clone, 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000000000000000000000)
            mstore(add(clone, 0x14), targetBytes)
            mstore(add(clone, 0x28), 0x5af43d82803e903d91602b57fd5bf30000000000000000000000000000000000)
            cloneAddress := create(0, clone, 0x37)
        }

        // Initialize the clone
        IInitializableVoucherClone(cloneAddress).initialize(pa.voucherBeacon);
        IInitializableVoucherClone(cloneAddress).initializeVoucher(_sellerId, _operator, _voucherInitValues);
    }
}
