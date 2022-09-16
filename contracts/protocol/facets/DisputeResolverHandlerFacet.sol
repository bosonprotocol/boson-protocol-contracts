// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import "../../domain/BosonConstants.sol";
import { IBosonAccountEvents } from "../../interfaces/events/IBosonAccountEvents.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { ProtocolBase } from "../bases/ProtocolBase.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";

/**
 * @title DisputeResolverHandlerFacet
 *
 * @notice Handles dispute resolver account management requests and queries
 */
contract DisputeResolverHandlerFacet is IBosonAccountEvents, ProtocolBase {
    /**
     * @notice Initializes facet.
     */
    function initialize() public {
        // No-op initializer.
        // - needed by the deployment script, which expects a no-args initializer on facets other than the config handler
        // - exception here because IBosonAccountHandler is contributed to by multiple facets which do not have their own individual interfaces
    }

    /**
     * @notice Creates a dispute resolver. Dispute resolver must be activated before it can participate in the protocol.
     *
     * Emits a DisputeResolverCreated event if successful.
     *
     * Reverts if:
     * - The dispute resolvers region of protocol is paused
     * - Any address is zero address
     * - Any address is not unique to this dispute resolver
     * - Number of DisputeResolverFee structs in array exceeds max
     * - DisputeResolverFee array contains duplicates
     * - EscalationResponsePeriod is invalid
     * - Number of seller ids in _sellerAllowList array exceeds max
     * - Some seller does not exist
     * - Some seller id is duplicated
     *
     * @param _disputeResolver - the fully populated struct with dispute resolver id set to 0x0
     * @param _disputeResolverFees - array of fees dispute resolver charges per token type. Zero address is native currency. Can be empty.
     * @param _sellerAllowList - list of ids of sellers that can choose this dispute resolver. If empty, there are no restrictions on which seller can chose it.
     */
    function createDisputeResolver(
        DisputeResolver memory _disputeResolver,
        DisputeResolverFee[] calldata _disputeResolverFees,
        uint256[] calldata _sellerAllowList
    ) external disputeResolversNotPaused nonReentrant {
        // Check for zero address
        require(
            _disputeResolver.admin != address(0) &&
                _disputeResolver.operator != address(0) &&
                _disputeResolver.clerk != address(0) &&
                _disputeResolver.treasury != address(0),
            INVALID_ADDRESS
        );

        // Make sure the gas block limit is not hit
        require(_sellerAllowList.length <= protocolLimits().maxAllowedSellers, INVALID_AMOUNT_ALLOWED_SELLERS);

        // Get the next account id and increment the counter
        uint256 disputeResolverId = protocolCounters().nextAccountId++;

        //check that the addresses are unique to one dispute resolver id, across all rolls
        require(
            protocolLookups().disputeResolverIdByOperator[_disputeResolver.operator] == 0 &&
                protocolLookups().disputeResolverIdByOperator[_disputeResolver.admin] == 0 &&
                protocolLookups().disputeResolverIdByOperator[_disputeResolver.clerk] == 0 &&
                protocolLookups().disputeResolverIdByAdmin[_disputeResolver.admin] == 0 &&
                protocolLookups().disputeResolverIdByAdmin[_disputeResolver.operator] == 0 &&
                protocolLookups().disputeResolverIdByAdmin[_disputeResolver.clerk] == 0 &&
                protocolLookups().disputeResolverIdByClerk[_disputeResolver.clerk] == 0 &&
                protocolLookups().disputeResolverIdByClerk[_disputeResolver.operator] == 0 &&
                protocolLookups().disputeResolverIdByClerk[_disputeResolver.admin] == 0,
            DISPUTE_RESOLVER_ADDRESS_MUST_BE_UNIQUE
        );

        _disputeResolver.id = disputeResolverId;

        // The number of fees cannot exceed the maximum number of dispute resolver fees to avoid running into block gas limit in a loop
        require(
            _disputeResolverFees.length <= protocolLimits().maxFeesPerDisputeResolver,
            INVALID_AMOUNT_DISPUTE_RESOLVER_FEES
        );

        // Get storage location for dispute resolver fees
        (, , DisputeResolverFee[] storage disputeResolverFees) = fetchDisputeResolver(_disputeResolver.id);

        // Set dispute resolver fees. Must loop because calldata structs cannot be converted to storage structs
        for (uint256 i = 0; i < _disputeResolverFees.length; i++) {
            require(
                protocolLookups().disputeResolverFeeTokenIndex[_disputeResolver.id][
                    _disputeResolverFees[i].tokenAddress
                ] == 0,
                DUPLICATE_DISPUTE_RESOLVER_FEES
            );
            disputeResolverFees.push(_disputeResolverFees[i]);

            protocolLookups().disputeResolverFeeTokenIndex[_disputeResolver.id][
                _disputeResolverFees[i].tokenAddress
            ] = disputeResolverFees.length; // Set index mapping. Should be index in disputeResolverFees array + 1
        }

        // Ignore supplied active flag and set to false. Dispute resolver must be activated by protocol.
        _disputeResolver.active = false;

        storeDisputeResolver(_disputeResolver);
        storeSellerAllowList(disputeResolverId, _sellerAllowList);

        // Notify watchers of state change
        emit DisputeResolverCreated(
            _disputeResolver.id,
            _disputeResolver,
            _disputeResolverFees,
            _sellerAllowList,
            msgSender()
        );
    }

    /**
     * @notice Updates a dispute resolver, not including DisputeResolverFees, allowed seller list or active flag.
     *         All DisputeResolver fields should be filled, even those staying the same.
     *         Use removeFeesFromDisputeResolver and addFeesToDisputeResolver to add and remove fees.
     *         Use addSellersToAllowList and removeSellersFromAllowList to add and remove allowed sellers.
     * @dev    Active flag passed in by caller will be ignored. The value from storage will be used.
     *
     * Emits a DisputeResolverUpdated event if successful.
     *
     * Reverts if:
     * - The dispute resolvers region of protocol is paused
     * - Caller is not the admin address associated with the dispute resolver account
     * - Any address is zero address
     * - Any address is not unique to this dispute resolver
     * - Dispute resolver does not exist
     *
     * @param _disputeResolver - the fully populated buydispute resolver struct
     */
    function updateDisputeResolver(DisputeResolver memory _disputeResolver)
        external
        disputeResolversNotPaused
        nonReentrant
    {
        //Check for zero address
        require(
            _disputeResolver.admin != address(0) &&
                _disputeResolver.operator != address(0) &&
                _disputeResolver.clerk != address(0) &&
                _disputeResolver.treasury != address(0),
            INVALID_ADDRESS
        );

        bool exists;
        DisputeResolver storage disputeResolver;

        // Check dispute resolver and dispute resolver Fees from disputeResolvers and disputeResolverFees mappings
        (exists, disputeResolver, ) = fetchDisputeResolver(_disputeResolver.id);

        // Dispute resolver must already exist
        require(exists, NO_SUCH_DISPUTE_RESOLVER);

        // Get message sender
        address sender = msgSender();

        // Check that msg.sender is the admin address for this dispute resolver
        require(disputeResolver.admin == sender, NOT_ADMIN);

        //check that the addresses are unique to one dispute resolverId if new, across all roles
        require(
            (protocolLookups().disputeResolverIdByOperator[_disputeResolver.operator] == 0 ||
                protocolLookups().disputeResolverIdByOperator[_disputeResolver.operator] == _disputeResolver.id) &&
                (protocolLookups().disputeResolverIdByOperator[_disputeResolver.admin] == 0 ||
                    protocolLookups().disputeResolverIdByOperator[_disputeResolver.admin] == _disputeResolver.id) &&
                (protocolLookups().disputeResolverIdByOperator[_disputeResolver.clerk] == 0 ||
                    protocolLookups().disputeResolverIdByOperator[_disputeResolver.clerk] == _disputeResolver.id) &&
                (protocolLookups().disputeResolverIdByAdmin[_disputeResolver.admin] == 0 ||
                    protocolLookups().disputeResolverIdByAdmin[_disputeResolver.admin] == _disputeResolver.id) &&
                (protocolLookups().disputeResolverIdByAdmin[_disputeResolver.operator] == 0 ||
                    protocolLookups().disputeResolverIdByAdmin[_disputeResolver.operator] == _disputeResolver.id) &&
                (protocolLookups().disputeResolverIdByAdmin[_disputeResolver.clerk] == 0 ||
                    protocolLookups().disputeResolverIdByAdmin[_disputeResolver.clerk] == _disputeResolver.id) &&
                (protocolLookups().disputeResolverIdByClerk[_disputeResolver.clerk] == 0 ||
                    protocolLookups().disputeResolverIdByClerk[_disputeResolver.clerk] == _disputeResolver.id) &&
                (protocolLookups().disputeResolverIdByClerk[_disputeResolver.operator] == 0 ||
                    protocolLookups().disputeResolverIdByClerk[_disputeResolver.operator] == _disputeResolver.id) &&
                (protocolLookups().disputeResolverIdByClerk[_disputeResolver.admin] == 0 ||
                    protocolLookups().disputeResolverIdByClerk[_disputeResolver.admin] == _disputeResolver.id),
            DISPUTE_RESOLVER_ADDRESS_MUST_BE_UNIQUE
        );

        // Delete current mappings
        delete protocolLookups().disputeResolverIdByOperator[disputeResolver.operator];
        delete protocolLookups().disputeResolverIdByAdmin[disputeResolver.admin];
        delete protocolLookups().disputeResolverIdByClerk[disputeResolver.clerk];

        // Ignore supplied active flag and keep value already stored. Dispute resolver cannot self-activate.
        _disputeResolver.active = disputeResolver.active;
        storeDisputeResolver(_disputeResolver);

        // Notify watchers of state change
        emit DisputeResolverUpdated(_disputeResolver.id, _disputeResolver, sender);
    }

    /**
     * @notice Adds DisputeResolverFees to an existing dispute resolver.
     *
     * Emits a DisputeResolverFeesAdded event if successful.
     *
     * Reverts if:
     * - The dispute resolvers region of protocol is paused
     * - Caller is not the admin address associated with the dispute resolver account
     * - Dispute resolver does not exist
     * - Number of DisputeResolverFee structs in array exceeds max
     * - Number of DisputeResolverFee structs in array is zero
     * - DisputeResolverFee array contains duplicates
     *
     * @param _disputeResolverId - id of the dispute resolver
     * @param _disputeResolverFees - list of fees dispute resolver charges per token type. Zero address is native currency. See {BosonTypes.DisputeResolverFee}
     */
    function addFeesToDisputeResolver(uint256 _disputeResolverId, DisputeResolverFee[] calldata _disputeResolverFees)
        external
        disputeResolversNotPaused
        nonReentrant
    {
        bool exists;
        DisputeResolver storage disputeResolver;
        DisputeResolverFee[] storage disputeResolverFees;

        // Check dispute resolver and dispute resolver Fees from disputeResolvers and disputeResolverFees mappings
        (exists, disputeResolver, disputeResolverFees) = fetchDisputeResolver(_disputeResolverId);

        // Dispute resolver must already exist
        require(exists, NO_SUCH_DISPUTE_RESOLVER);

        // Get message sender
        address sender = msgSender();

        // Check that msg.sender is the admin address for this dispute resolver
        require(disputeResolver.admin == sender, NOT_ADMIN);

        // At least one fee must be specified and the number of fees cannot exceed the maximum number of dispute resolver fees to avoid running into block gas limit in a loop
        require(
            _disputeResolverFees.length > 0 &&
                _disputeResolverFees.length <= protocolLimits().maxFeesPerDisputeResolver,
            INVALID_AMOUNT_DISPUTE_RESOLVER_FEES
        );

        // Set dispute resolver fees. Must loop because calldata structs cannot be converted to storage structs
        for (uint256 i = 0; i < _disputeResolverFees.length; i++) {
            require(
                protocolLookups().disputeResolverFeeTokenIndex[_disputeResolverId][
                    _disputeResolverFees[i].tokenAddress
                ] == 0,
                DUPLICATE_DISPUTE_RESOLVER_FEES
            );
            disputeResolverFees.push(_disputeResolverFees[i]);
            protocolLookups().disputeResolverFeeTokenIndex[_disputeResolverId][
                _disputeResolverFees[i].tokenAddress
            ] = disputeResolverFees.length; // Set index mapping. Should be index in disputeResolverFees array + 1
        }

        emit DisputeResolverFeesAdded(_disputeResolverId, _disputeResolverFees, sender);
    }

    /**
     * @notice Removes DisputeResolverFees from  an existing dispute resolver.
     *
     * Emits a DisputeResolverFeesRemoved event if successful.
     *
     * Reverts if:
     * - The dispute resolvers region of protocol is paused
     * - Caller is not the admin address associated with the dispute resolver account
     * - Dispute resolver does not exist
     * - Number of DisputeResolverFee structs in array exceeds max
     * - Number of DisputeResolverFee structs in array is zero
     * - DisputeResolverFee does not exist for the dispute resolver
     *
     * @param _disputeResolverId - id of the dispute resolver
     * @param _feeTokenAddresses - list of adddresses of dispute resolver fee tokens to remove
     */
    function removeFeesFromDisputeResolver(uint256 _disputeResolverId, address[] calldata _feeTokenAddresses)
        external
        disputeResolversNotPaused
        nonReentrant
    {
        bool exists;
        DisputeResolver storage disputeResolver;
        DisputeResolverFee[] storage disputeResolverFees;

        // Check dispute resolver and dispute resolver fees from disputeResolvers and disputeResolverFees mappings
        (exists, disputeResolver, disputeResolverFees) = fetchDisputeResolver(_disputeResolverId);

        // Dispute resolver must already exist
        require(exists, NO_SUCH_DISPUTE_RESOLVER);

        // Get message sender
        address sender = msgSender();

        // Check that msg.sender is the admin address for this dispute resolver
        require(disputeResolver.admin == sender, NOT_ADMIN);

        // At least one fee must be specified and the number of fees cannot exceed the maximum number of dispute resolver fees to avoid running into block gas limit in a loop
        require(
            _feeTokenAddresses.length > 0 && _feeTokenAddresses.length <= protocolLimits().maxFeesPerDisputeResolver,
            INVALID_AMOUNT_DISPUTE_RESOLVER_FEES
        );

        // Set dispute resolver fees. Must loop because calldata structs cannot be converted to storage structs
        for (uint256 i = 0; i < _feeTokenAddresses.length; i++) {
            require(
                protocolLookups().disputeResolverFeeTokenIndex[_disputeResolverId][_feeTokenAddresses[i]] != 0,
                DISPUTE_RESOLVER_FEE_NOT_FOUND
            );
            uint256 disputeResolverFeeArrayIndex = protocolLookups().disputeResolverFeeTokenIndex[_disputeResolverId][
                _feeTokenAddresses[i]
            ] - 1; //Get the index in the DisputeResolverFees array, which is 1 less than the disputeResolverFeeTokenIndex index

            uint256 lastTokenIndex = disputeResolverFees.length - 1;
            if (disputeResolverFeeArrayIndex != lastTokenIndex) {
                // if index == len - 1 then only pop and delete are needed
                // Need to fill gap caused by delete if more than one element in storage array
                DisputeResolverFee memory disputeResolverFeeToMove = disputeResolverFees[lastTokenIndex];
                disputeResolverFees[disputeResolverFeeArrayIndex] = disputeResolverFeeToMove; // Copy the last DisputeResolverFee struct in the array to this index to fill the gap
                protocolLookups().disputeResolverFeeTokenIndex[_disputeResolverId][
                    disputeResolverFeeToMove.tokenAddress
                ] = disputeResolverFeeArrayIndex + 1; // Reset index mapping. Should be index in disputeResolverFees array + 1
            }
            disputeResolverFees.pop(); // Delete last DisputeResolverFee struct in the array, which was just moved to fill the gap
            delete protocolLookups().disputeResolverFeeTokenIndex[_disputeResolverId][_feeTokenAddresses[i]]; // Delete from index mapping
        }

        emit DisputeResolverFeesRemoved(_disputeResolverId, _feeTokenAddresses, sender);
    }

    /**
     * @notice Adds seller ids to set of ids allowed to choose the given dispute resolver for an offer.
     *
     * Emits an AllowedSellersAdded event if successful.
     *
     * Reverts if:
     * - The dispute resolvers region of protocol is paused
     * - Caller is not the admin address associated with the dispute resolver account
     * - Dispute resolver does not exist
     * - Number of seller ids in array exceeds max
     * - Number of seller ids in array is zero
     * - Some seller does not exist
     * - Seller id is already approved
     *
     * @param _disputeResolverId - id of the dispute resolver
     * @param _sellerAllowList - List of seller ids to add to allowed list
     */
    function addSellersToAllowList(uint256 _disputeResolverId, uint256[] calldata _sellerAllowList)
        external
        disputeResolversNotPaused
        nonReentrant
    {
        // At least one seller id must be specified and the number of ids cannot exceed the maximum number of seller ids to avoid running into block gas limit in a loop
        require(
            _sellerAllowList.length > 0 && _sellerAllowList.length <= protocolLimits().maxAllowedSellers,
            INVALID_AMOUNT_ALLOWED_SELLERS
        );

        bool exists;
        DisputeResolver storage disputeResolver;

        // Check dispute Resolver from disputeResolvers
        (exists, disputeResolver, ) = fetchDisputeResolver(_disputeResolverId);

        // Dispute resolver must already exist
        require(exists, NO_SUCH_DISPUTE_RESOLVER);

        // Get message sender
        address sender = msgSender();

        // Check that msg.sender is the admin address for this dispute resolver
        require(disputeResolver.admin == sender, NOT_ADMIN);

        storeSellerAllowList(_disputeResolverId, _sellerAllowList);

        emit AllowedSellersAdded(_disputeResolverId, _sellerAllowList, sender);
    }

    /**
     * @notice Removes seller ids from set of ids allowed to choose the given dispute resolver for an offer.
     *
     * Emits an AllowedSellersRemoved event if successful.
     *
     * Reverts if:
     * - The dispute resolvers region of protocol is paused
     * - Caller is not the admin address associated with the dispute resolver account
     * - Dispute resolver does not exist
     * - Number of seller ids in array exceeds max
     * - Number of seller ids structs in array is zero
     * - Seller id is not approved
     *
     * @param _disputeResolverId - id of the dispute resolver
     * @param _sellerAllowList - list of seller ids to remove from allowed list
     */
    function removeSellersFromAllowList(uint256 _disputeResolverId, uint256[] calldata _sellerAllowList)
        external
        disputeResolversNotPaused
        nonReentrant
    {
        // At least one seller id must be specified and the number of ids cannot exceed the maximum number of seller ids to avoid running into block gas limit in a loop
        require(
            _sellerAllowList.length > 0 && _sellerAllowList.length <= protocolLimits().maxAllowedSellers,
            INVALID_AMOUNT_ALLOWED_SELLERS
        );

        bool exists;
        DisputeResolver storage disputeResolver;

        // Check dispute resolver from disputeResolvers
        (exists, disputeResolver, ) = fetchDisputeResolver(_disputeResolverId);

        // Dispute resolver must already exist
        require(exists, NO_SUCH_DISPUTE_RESOLVER);

        // Get message sender
        address sender = msgSender();

        // Check that msg.sender is the admin address for this dispute resolver
        require(disputeResolver.admin == sender, NOT_ADMIN);

        ProtocolLib.ProtocolLookups storage pl = protocolLookups();

        for (uint256 i = 0; i < _sellerAllowList.length; i++) {
            uint256 sellerToRemoveIndex = pl.allowedSellerIndex[_disputeResolverId][_sellerAllowList[i]];
            require(sellerToRemoveIndex > 0, SELLER_NOT_APPROVED);

            // remove index mapping
            delete pl.allowedSellerIndex[_disputeResolverId][_sellerAllowList[i]];

            // reduce for 1 to get actual index value
            sellerToRemoveIndex--;

            uint256 lastIndex = pl.allowedSellers[_disputeResolverId].length - 1; // since allowedSellerIndex > 0, length at this point cannot be 0 therefore we don't worry about overflow

            // if index to remove is not the last index we put the last element in its place
            if (sellerToRemoveIndex != lastIndex) {
                uint256 lastSellerId = pl.allowedSellers[_disputeResolverId][lastIndex];
                pl.allowedSellers[_disputeResolverId][sellerToRemoveIndex] = lastSellerId;
                pl.allowedSellerIndex[_disputeResolverId][lastSellerId] = sellerToRemoveIndex + 1;
            }

            // remove last element
            pl.allowedSellers[_disputeResolverId].pop();
        }

        emit AllowedSellersRemoved(_disputeResolverId, _sellerAllowList, sender);
    }

    /**
     * @notice Sets the active flag for this dispute resolver to true.
     *
     * @dev Only callable by the protocol ADMIN role.
     *
     * Emits a DisputeResolverActivated event if successful.
     *
     * Reverts if:
     * - The dispute resolvers region of protocol is paused
     * - Caller does not have the ADMIN role
     * - Dispute resolver does not exist
     *
     * @param _disputeResolverId - id of the dispute resolver
     */
    function activateDisputeResolver(uint256 _disputeResolverId)
        external
        disputeResolversNotPaused
        onlyRole(ADMIN)
        nonReentrant
    {
        bool exists;
        DisputeResolver storage disputeResolver;

        // Check dispute resolver and dispute resolver fees from disputeResolvers and disputeResolverFees mappings
        (exists, disputeResolver, ) = fetchDisputeResolver(_disputeResolverId);

        // Dispute resolver must already exist
        require(exists, NO_SUCH_DISPUTE_RESOLVER);

        disputeResolver.active = true;

        emit DisputeResolverActivated(_disputeResolverId, disputeResolver, msgSender());
    }

    /**
     * @notice Gets the details about a dispute resolver.
     *
     * @param _disputeResolverId - the id of the dispute resolver to check
     * @return exists - the dispute resolver was found
     * @return disputeResolver - the dispute resolver details. See {BosonTypes.DisputeResolver}
     * @return disputeResolverFees - list of fees dispute resolver charges per token type. Zero address is native currency. See {BosonTypes.DisputeResolverFee}
     * @return sellerAllowList - list of sellers that are allowed to choose this dispute resolver
     */
    function getDisputeResolver(uint256 _disputeResolverId)
        public
        view
        returns (
            bool exists,
            DisputeResolver memory disputeResolver,
            DisputeResolverFee[] memory disputeResolverFees,
            uint256[] memory sellerAllowList
        )
    {
        (exists, disputeResolver, disputeResolverFees) = fetchDisputeResolver(_disputeResolverId);
        if (exists) {
            sellerAllowList = protocolLookups().allowedSellers[_disputeResolverId];
        }
    }

    /**
     * @notice Gets the details about a dispute resolver by an address associated with that dispute resolver: operator, admin, or clerk address.
     *
     * @param _associatedAddress - the address associated with the dispute resolver. Must be an operator, admin, or clerk address.
     * @return exists - the dispute resolver  was found
     * @return disputeResolver - the dispute resolver details. See {BosonTypes.DisputeResolver}
     * @return disputeResolverFees - list of fees dispute resolver charges per token type. Zero address is native currency. See {BosonTypes.DisputeResolverFee}
     * @return sellerAllowList - list of sellers that are allowed to chose this dispute resolver
     */
    function getDisputeResolverByAddress(address _associatedAddress)
        external
        view
        returns (
            bool exists,
            DisputeResolver memory disputeResolver,
            DisputeResolverFee[] memory disputeResolverFees,
            uint256[] memory sellerAllowList
        )
    {
        uint256 disputeResolverId;

        (exists, disputeResolverId) = getDisputeResolverIdByOperator(_associatedAddress);
        if (exists) {
            return getDisputeResolver(disputeResolverId);
        }

        (exists, disputeResolverId) = getDisputeResolverIdByAdmin(_associatedAddress);
        if (exists) {
            return getDisputeResolver(disputeResolverId);
        }

        (exists, disputeResolverId) = getDisputeResolverIdByClerk(_associatedAddress);
        if (exists) {
            return getDisputeResolver(disputeResolverId);
        }
    }

    /**
     * @notice Checks whether given sellers are allowed to choose the given dispute resolver.
     *
     * @param _disputeResolverId - id of dispute resolver to check
     * @param _sellerIds - list of seller ids to check
     * @return sellerAllowed - array with indicator (true/false) if seller is allowed to choose the dispute resolver. Index in this array corresponds to indices of the incoming _sellerIds
     */
    function areSellersAllowed(uint256 _disputeResolverId, uint256[] calldata _sellerIds)
        external
        view
        returns (bool[] memory sellerAllowed)
    {
        sellerAllowed = new bool[](_sellerIds.length);
        ProtocolLib.ProtocolLookups storage pl = protocolLookups();

        (bool exists, , ) = fetchDisputeResolver(_disputeResolverId);

        // We populate sellerAllowed only if id really belongs to DR, otherwise return array filled with false
        if (exists) {
            if (pl.allowedSellers[_disputeResolverId].length == 0) {
                // DR allows everyone, just make sure ids really belong to the sellers
                for (uint256 i = 0; i < _sellerIds.length; i++) {
                    (exists, , ) = fetchSeller(_sellerIds[i]);
                    sellerAllowed[i] = exists;
                }
            } else {
                // DR is selective. Check for every seller if they are allowed for given _disputeResolverId
                for (uint256 i = 0; i < _sellerIds.length; i++) {
                    sellerAllowed[i] = pl.allowedSellerIndex[_disputeResolverId][_sellerIds[i]] > 0; // true if on the list, false otherwise
                }
            }
        }
    }

    /**
     * @notice Stores DisputeResolver struct in storage.
     *
     * Reverts if:
     * - Escalation period is greater than the max escalaction period
     *
     * @param _disputeResolver - the fully populated struct with dispute resolver id set
     */
    function storeDisputeResolver(DisputeResolver memory _disputeResolver) internal {
        // Escalation period must be greater than zero and less than or equal to the max allowed
        require(
            _disputeResolver.escalationResponsePeriod > 0 &&
                _disputeResolver.escalationResponsePeriod <= protocolLimits().maxEscalationResponsePeriod,
            INVALID_ESCALATION_PERIOD
        );

        // Get storage location for dispute resolver
        (, DisputeResolver storage disputeResolver, ) = fetchDisputeResolver(_disputeResolver.id);

        // Set dispute resolver props individually since memory structs can't be copied to storage
        disputeResolver.id = _disputeResolver.id;
        disputeResolver.escalationResponsePeriod = _disputeResolver.escalationResponsePeriod;
        disputeResolver.operator = _disputeResolver.operator;
        disputeResolver.admin = _disputeResolver.admin;
        disputeResolver.clerk = _disputeResolver.clerk;
        disputeResolver.treasury = _disputeResolver.treasury;
        disputeResolver.metadataUri = _disputeResolver.metadataUri;
        disputeResolver.active = _disputeResolver.active;

        // Map the dispute resolver's addresses to the dispute resolver id.
        protocolLookups().disputeResolverIdByOperator[_disputeResolver.operator] = _disputeResolver.id;
        protocolLookups().disputeResolverIdByAdmin[_disputeResolver.admin] = _disputeResolver.id;
        protocolLookups().disputeResolverIdByClerk[_disputeResolver.clerk] = _disputeResolver.id;
    }

    /**
     * @notice Stores seller id to allowed list mapping in storage.
     *
     * Reverts if:
     * - Some seller does not exist
     * - Some seller id is already approved
     *
     * @param _disputeResolverId - id of dispute resolver that is giving the permission
     * @param _sellerAllowList - list of sellers ids added to allow list
     */
    function storeSellerAllowList(uint256 _disputeResolverId, uint256[] calldata _sellerAllowList) internal {
        ProtocolLib.ProtocolLookups storage pl = protocolLookups();

        // Loop over incoming seller ids and store them to the mapping
        for (uint256 i = 0; i < _sellerAllowList.length; i++) {
            uint256 sellerId = _sellerAllowList[i];
            // Check Seller exists in sellers mapping
            (bool exists, , ) = fetchSeller(sellerId);

            // Seller must already exist
            require(exists, NO_SUCH_SELLER);

            // Seller should not be approved already
            require(pl.allowedSellerIndex[_disputeResolverId][sellerId] == 0, SELLER_ALREADY_APPROVED);

            // Update the mappings
            pl.allowedSellers[_disputeResolverId].push(sellerId);
            pl.allowedSellerIndex[_disputeResolverId][sellerId] = pl.allowedSellers[_disputeResolverId].length; //Set index mapping. Should be index in allowedSellers array + 1
        }
    }
}
