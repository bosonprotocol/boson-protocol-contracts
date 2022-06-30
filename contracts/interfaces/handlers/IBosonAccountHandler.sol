// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import {BosonTypes} from "../../domain/BosonTypes.sol";
import {IBosonAccountEvents} from "../events/IBosonAccountEvents.sol";

/**
 * @title IBosonAccountHandler
 *
 * @notice Handles creation, update, retrieval of accounts within the protocol.
 *
 * The ERC-165 identifier for this interface is: 0x2cf25a22
 */
interface IBosonAccountHandler is IBosonAccountEvents {

    /**
     * @notice Creates a seller
     *
     * Emits a SellerCreated event if successful.
     *
     * Reverts if:
     * - Address values are zero address
     * - Active is not true
     * - Addresses are not unique to this seller
     *
     * @param _seller - the fully populated struct with seller id set to 0x0
     */
    function createSeller(BosonTypes.Seller memory _seller) external;

    /**
     * @notice Creates a Buyer
     *
     * Emits a BuyerCreated event if successful.
     *
     * Reverts if:
     * - Wallet address is zero address
     * - Active is not true
     * - Wallet address is not unique to this buyer
     *
     * @param _buyer - the fully populated struct with buyer id set to 0x0
     */
    function createBuyer(BosonTypes.Buyer memory _buyer) external;

    /**
     * @notice Creates a Dispute Resolver. Dispute Resolver must be activated before it can participate in the protocol.
     *
     * Emits a DisputeResolverCreated event if successful.
     *
     * Reverts if:
     * - Any address is zero address
     * - Any address is not unique to this dispute resolver
     * - Number of DisputeResolverFee structs in array exceeds max
     * - DisputeResolverFee array contains duplicates
     * - EscalationResponsePeriod is invalid
     *
     * @param _disputeResolver - the fully populated struct with dispute resolver id set to 0x0
     * @param _disputeResolverFees - array of fees dispute resolver charges per token type. Zero address is native currence. Can be empty.
     */
    function createDisputeResolver(BosonTypes.DisputeResolver memory _disputeResolver, BosonTypes.DisputeResolverFee[] calldata _disputeResolverFees) external;

    /**
     * @notice Updates a seller
     *
     * Emits a SellerUpdated event if successful.
     *
     * Reverts if:
     * - Address values are zero address
     * - Addresses are not unique to this seller
     * - Caller is not the admin address of the seller
     * - Seller does not exist
     *
     * @param _seller - the fully populated seller struct
     */
    function updateSeller(BosonTypes.Seller memory _seller) external;

    /**
     * @notice Updates a buyer. All fields should be filled, even those staying the same. The wallet address cannot be updated if the current wallet address has oustanding vouchers
     *
     * Emits a BuyerUpdated event if successful.
     *
     * Reverts if:
     * - Caller is not the wallet address associated with the buyer account
     * - Wallet address is zero address
     * - Address is not unique to this buyer
     * - Buyer does not exist
     * - Current wallet address has oustanding vouchers
     *
     * @param _buyer - the fully populated buyer struct
     */
    function updateBuyer(BosonTypes.Buyer memory _buyer) external;

    /**
     * @notice Updates a dispute resolver, not including DisputeResolverFees or active flag. 
     * All DisputeResolver fields should be filled, even those staying the same.
     * Use removeFeesFromDisputeResolver
     * 
     * Emits a DisputeResolverUpdated event if successful.
     *
     * Reverts if:
     * - Caller is not the admin address associated with the dispute resolver account
     * - Any address is zero address
     * - Any address is not unique to this dispute resolver
     * - Dispute resolver does not exist
     *
     * @param _disputeResolver - the fully populated dispute resolver struct
     */
    function updateDisputeResolver(BosonTypes.DisputeResolver memory _disputeResolver) external;

    /**
     * @notice Add DisputeResolverFees to an existing disputeResolver
     * 
     * Emits a DisputeResolverFeesAdded event if successful.
     *
     * Reverts if:
     * - Caller is not the admin address associated with the dipute resolver account
     * - Dispute resolver does not exist
     * - Number of DisputeResolverFee structs in array is zero
     * - Number of DisputeResolverFee structs in array exceeds max
     * - DisputeResolverFee array contains duplicates
     *
     * @param _disputeResolverId - Id of the dispute resolver
     * @param _disputeResolverFees - list of fees dispute resolver charges per token type. Zero address is native currency. See {BosonTypes.DisputeResolverFee}
     */
    function addFeesToDisputeResolver(uint256 _disputeResolverId, BosonTypes.DisputeResolverFee[] calldata _disputeResolverFees) external;

    /**
     * @notice Remove DisputeResolverFees from  an existing disputeResolver
     * 
     * Emits a DisputeResolverFeesRemoved event if successful.
     *
     * Reverts if:
     * - Caller is not the admin address associated with the dipute resolver account
     * - Dispute resolver does not exist
     * - Number of DisputeResolverFee structs in array is zero
     * - Number of DisputeResolverFee structs in array exceeds max
     * - DisputeResolverFee does not exist for the dispute resolver
     *
     * @param _disputeResolverId - Id of the dispute resolver
     * @param _feeTokenAddresses - list of adddresses of dispute resolver fee tokens to remove
     */
    function removeFeesFromDisputeResolver(uint256 _disputeResolverId, address[] calldata _feeTokenAddresses) external;

    /**
     * @notice Set the active flag for this Dispute Resolver to true. Only callable by the protocol ADMIN role.
     * 
     * Emits a DisputeResolverActivated event if successful.
     *
     * Reverts if:
     * - Caller does not have the ADMIN role
     * - Dispute resolver does not exist
     *
     * @param _disputeResolverId - Id of the dispute resolver
     */
    function activateDisputeResolver(uint256 _disputeResolverId) external;

    /**
     * @notice Gets the details about a seller.
     *
     * @param _sellerId - the id of the seller to check
     * @return exists - the seller was found
     * @return seller - the seller details. See {BosonTypes.Seller}
     */
    function getSeller(uint256 _sellerId) external view returns (bool exists, BosonTypes.Seller memory seller);

    /**
     * @notice Gets the details about a seller by an address associated with that seller: operator, admin, or clerk address.
     *
     * @param _associatedAddress - the address associated with the seller. Must be an operator, admin, or clerk address.
     * @return exists - the seller was found
     * @return seller - the seller details. See {BosonTypes.Seller}
     */
    function getSellerByAddress(address _associatedAddress)
        external
        view
        returns (bool exists, BosonTypes.Seller memory seller);

    /**
     * @notice Gets the details about a buyer.
     *
     * @param _buyerId - the id of the buyer to check
     * @return exists - the buyer was found
     * @return buyer - the buyer details. See {BosonTypes.Buyer}
     */
    function getBuyer(uint256 _buyerId) external view returns (bool exists, BosonTypes.Buyer memory buyer);

    /**
     * @notice Gets the details about a dispute resolver.
     *
     * @param _disputeResolverId - the id of the resolver to check
     * @return exists - the resolver was found
     * @return disputeResolver - the resolver details. See {BosonTypes.DisputeResolver}
     * @return disputeResolverFees - list of fees dispute resolver charges per token type. Zero address is native currency. See {BosonTypes.DisputeResolverFee}
     */
    function getDisputeResolver(uint256 _disputeResolverId) external view returns (bool exists, BosonTypes.DisputeResolver memory disputeResolver, BosonTypes.DisputeResolverFee[] memory disputeResolverFees);

    /**
     * @notice Gets the details about a dispute resolver by an address associated with that seller: operator, admin, or clerk address.
     *
     * @param _associatedAddress - the address associated with the dispute resolver. Must be an operator, admin, or clerk address.
     * @return exists - the dispute resolver was found
     * @return disputeResolver - the dispute resolver details. See {BosonTypes.DisputeResolver}
     * @return disputeResolverFees - list of fees dispute resolver charges per token type. Zero address is native currency. See {BosonTypes.DisputeResolverFee}
     */
    function getDisputeResolverByAddress(address _associatedAddress)
        external
        view
        returns (bool exists, BosonTypes.DisputeResolver memory disputeResolver, BosonTypes.DisputeResolverFee[] memory disputeResolverFees);

    /**
     * @notice Gets the next account Id that can be assigned to an account.
     *
     *  Does not increment the counter.
     *
     * @return nextAccountId - the account Id
     */
    function getNextAccountId() external view returns (uint256 nextAccountId);
}
