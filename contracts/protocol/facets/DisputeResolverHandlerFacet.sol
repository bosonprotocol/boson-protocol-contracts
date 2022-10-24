// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.9;

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
     * - Caller is not the supplied admin, operator and clerk
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
        // Cache protocol lookups for reference
        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();

        // Check for zero address
        require(
            _disputeResolver.admin != address(0) &&
                _disputeResolver.operator != address(0) &&
                _disputeResolver.clerk != address(0) &&
                _disputeResolver.treasury != address(0),
            INVALID_ADDRESS
        );

        {
            // Get message sender
            address sender = msgSender();

            // Check that caller is the supplied operator and clerk
            require(
                _disputeResolver.admin == sender &&
                    _disputeResolver.operator == sender &&
                    _disputeResolver.clerk == sender,
                NOT_ADMIN_OPERATOR_AND_CLERK
            );
        }

        // Make sure the gas block limit is not hit
        require(_sellerAllowList.length <= protocolLimits().maxAllowedSellers, INVALID_AMOUNT_ALLOWED_SELLERS);

        // Get the next account id and increment the counter
        uint256 disputeResolverId = protocolCounters().nextAccountId++;

        // Check that the addresses are unique to one dispute resolver id, across all rolls
        mapping(address => uint256) storage disputeResolverIdByOperator = lookups.disputeResolverIdByOperator;
        mapping(address => uint256) storage disputeResolverIdByAdmin = lookups.disputeResolverIdByAdmin;
        mapping(address => uint256) storage disputeResolverIdByClerk = lookups.disputeResolverIdByClerk;
        require(
            disputeResolverIdByOperator[_disputeResolver.operator] == 0 &&
                disputeResolverIdByOperator[_disputeResolver.admin] == 0 &&
                disputeResolverIdByOperator[_disputeResolver.clerk] == 0 &&
                disputeResolverIdByAdmin[_disputeResolver.admin] == 0 &&
                disputeResolverIdByAdmin[_disputeResolver.operator] == 0 &&
                disputeResolverIdByAdmin[_disputeResolver.clerk] == 0 &&
                disputeResolverIdByClerk[_disputeResolver.clerk] == 0 &&
                disputeResolverIdByClerk[_disputeResolver.operator] == 0 &&
                disputeResolverIdByClerk[_disputeResolver.admin] == 0,
            DISPUTE_RESOLVER_ADDRESS_MUST_BE_UNIQUE
        );

        _disputeResolver.id = disputeResolverId;

        // The number of fees cannot exceed the maximum number of dispute resolver fees to avoid running into block gas limit in a loop
        require(
            _disputeResolverFees.length <= protocolLimits().maxFeesPerDisputeResolver,
            INVALID_AMOUNT_DISPUTE_RESOLVER_FEES
        );

        // Escalation period must be greater than zero and less than or equal to the max allowed
        require(
            _disputeResolver.escalationResponsePeriod > 0 &&
                _disputeResolver.escalationResponsePeriod <= protocolLimits().maxEscalationResponsePeriod,
            INVALID_ESCALATION_PERIOD
        );

        // Get storage location for dispute resolver fees
        (, , DisputeResolverFee[] storage disputeResolverFees) = fetchDisputeResolver(_disputeResolver.id);

        // Set dispute resolver fees. Must loop because calldata structs cannot be converted to storage structs
        mapping(address => uint256) storage disputeResolverFeeTokens = lookups.disputeResolverFeeTokenIndex[
            _disputeResolver.id
        ];
        for (uint256 i = 0; i < _disputeResolverFees.length; i++) {
            require(
                disputeResolverFeeTokens[_disputeResolverFees[i].tokenAddress] == 0,
                DUPLICATE_DISPUTE_RESOLVER_FEES
            );
            disputeResolverFees.push(_disputeResolverFees[i]);

            // Set index mapping. Should be index in disputeResolverFees array + 1
            disputeResolverFeeTokens[_disputeResolverFees[i].tokenAddress] = disputeResolverFees.length;
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
     * @notice Updates treasury address, escalationResponsePeriod or metadataUri if changed. Puts admin, operator and clerk in pending queue, if changed.
     *         Pending updates can be completed by calling the optInToDisputeResolverUpdate function.
     *
     *         Update doesn't include DisputeResolverFees, allowed seller list or active flag.
     *         All DisputeResolver fields should be filled, even those staying the same.
     *         Use removeFeesFromDisputeResolver and addFeesToDisputeResolver to add and remove fees.
     *         Use addSellersToAllowList and removeSellersFromAllowList to add and remove allowed sellers.
     *
     * @dev    Active flag passed in by caller will be ignored. The value from storage will be used.
     *
     * Emits a DisputeResolverUpdated event if successful.
     * Emits a DisputeResolverUpdatePending event if the dispute resolver has requested an update for admin, clerk or operator.
     * Owner(s) of new addresses for admin, clerk, operator must opt-in to the update.
     *
     * Reverts if:
     * - The dispute resolvers region of protocol is paused
     * - Caller is not the admin address of the stored dispute resolver
     * - Any address is zero address
     * - Any address is not unique to this dispute resolver
     * - Dispute resolver does not exist
     * - EscalationResponsePeriod is invalid
     *
     * @param _disputeResolver - the fully populated dispute resolver struct
     */
    function updateDisputeResolver(DisputeResolver memory _disputeResolver)
        external
        disputeResolversNotPaused
        nonReentrant
    {
        // Cache protocol lookups for reference
        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();

        // Check for zero address
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

        // Clean old dispute resolver pending update data if exists
        delete lookups.pendingAddressUpdatesByDisputeResolver[_disputeResolver.id];

        bool needsApproval;
        (, DisputeResolver storage disputeResolverPendingUpdate) = fetchDisputeResolverPendingUpdate(
            _disputeResolver.id
        );

        if (_disputeResolver.admin != disputeResolver.admin) {
            preUpdateDisputeResolverCheck(_disputeResolver.id, _disputeResolver.admin, lookups);

            // If admin address exists, admin address owner must approve the update to prevent front-running
            disputeResolverPendingUpdate.admin = _disputeResolver.admin;
            needsApproval = true;
        }

        if (_disputeResolver.operator != disputeResolver.operator) {
            preUpdateDisputeResolverCheck(_disputeResolver.id, _disputeResolver.operator, lookups);

            // If operator address exists, operator address owner must approve the update to prevent front-running
            disputeResolverPendingUpdate.operator = _disputeResolver.operator;
            needsApproval = true;
        }

        if (_disputeResolver.clerk != disputeResolver.clerk) {
            preUpdateDisputeResolverCheck(_disputeResolver.id, _disputeResolver.clerk, lookups);

            // If clerk address exists, clerk address owner must approve the update to prevent front-running
            disputeResolverPendingUpdate.clerk = _disputeResolver.clerk;
            needsApproval = true;
        }

        bool updateApplied;

        if (_disputeResolver.treasury != disputeResolver.treasury) {
            // Update treasury
            disputeResolver.treasury = _disputeResolver.treasury;

            updateApplied = true;
        }

        if (_disputeResolver.escalationResponsePeriod != disputeResolver.escalationResponsePeriod) {
            // Escalation period must be greater than zero and less than or equal to the max allowed
            require(
                _disputeResolver.escalationResponsePeriod > 0 &&
                    _disputeResolver.escalationResponsePeriod <= protocolLimits().maxEscalationResponsePeriod,
                INVALID_ESCALATION_PERIOD
            );

            // Update escalation response period
            disputeResolver.escalationResponsePeriod = _disputeResolver.escalationResponsePeriod;

            updateApplied = true;
        }

        if (keccak256(bytes(_disputeResolver.metadataUri)) != keccak256(bytes(disputeResolver.metadataUri))) {
            // Update metadata URI
            disputeResolver.metadataUri = _disputeResolver.metadataUri;

            updateApplied = true;
        }

        if (needsApproval) {
            // Notify watchers of state change
            emit DisputeResolverUpdatePending(_disputeResolver.id, disputeResolverPendingUpdate, sender);
        }

        if (updateApplied) {
            // Notify watchers of state change
            emit DisputeResolverUpdateApplied(
                _disputeResolver.id,
                disputeResolver,
                disputeResolverPendingUpdate,
                sender
            );
        }
    }

    /**
     * @notice Opt-in to a pending dispute resolver update
     *
     * Emits a DisputeResolverUpdateApplied event if successful.
     *
     * Reverts if:
     * - The dispute resolver region of protocol is paused
     * - Addresses are not unique to this dispute resolver
     * - Caller address is not pending update for the field being updated
     * - No pending update exists for this dispute resolver
     *
     * @param _disputeResolverId - disputeResolver id
     * @param _fieldsToUpdate - fields to update, see DisputeResolverUpdateFields enum
     */
    function optInToDisputeResolverUpdate(
        uint256 _disputeResolverId,
        DisputeResolverUpdateFields[] calldata _fieldsToUpdate
    ) external disputeResolversNotPaused nonReentrant {
        // Cache protocol lookups and sender for reference
        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();
        address sender = msgSender();

        // Get disputeResolver pending update
        (bool exists, DisputeResolver storage disputeResolverPendingUpdate) = fetchDisputeResolverPendingUpdate(
            _disputeResolverId
        );

        require(exists, NO_PENDING_UPDATE_FOR_ACCOUNT);

        bool updateApplied;

        // Get storage location for disputeResolver
        (, DisputeResolver storage disputeResolver, ) = fetchDisputeResolver(_disputeResolverId);

        for (uint256 i = 0; i < _fieldsToUpdate.length; i++) {
            DisputeResolverUpdateFields role = _fieldsToUpdate[i];

            if (role == DisputeResolverUpdateFields.Admin && disputeResolverPendingUpdate.admin != address(0)) {
                // Approve admin update
                require(disputeResolverPendingUpdate.admin == sender, UNAUTHORIZED_CALLER_UPDATE);

                preUpdateDisputeResolverCheck(_disputeResolverId, sender, lookups);

                // Delete old disputeResolver id by admin mapping
                delete lookups.disputeResolverIdByAdmin[disputeResolver.admin];

                // Update admin
                disputeResolver.admin = sender;

                // Store new disputeResolver id by admin mapping
                lookups.disputeResolverIdByAdmin[sender] = _disputeResolverId;

                // Delete pending update admin
                delete disputeResolverPendingUpdate.admin;

                updateApplied = true;
            } else if (
                role == DisputeResolverUpdateFields.Operator && disputeResolverPendingUpdate.operator != address(0)
            ) {
                // Approve operator update
                require(disputeResolverPendingUpdate.operator == sender, UNAUTHORIZED_CALLER_UPDATE);

                preUpdateDisputeResolverCheck(_disputeResolverId, sender, lookups);

                // Delete old disputeResolver id by operator mapping
                delete lookups.disputeResolverIdByOperator[disputeResolver.operator];

                // Update operator
                disputeResolver.operator = sender;

                // Store new disputeResolver id by operator mapping
                lookups.disputeResolverIdByOperator[sender] = _disputeResolverId;

                // Delete pending update operator
                delete disputeResolverPendingUpdate.operator;

                updateApplied = true;
            } else if (role == DisputeResolverUpdateFields.Clerk && disputeResolverPendingUpdate.clerk != address(0)) {
                // Aprove clerk update
                require(disputeResolverPendingUpdate.clerk == sender, UNAUTHORIZED_CALLER_UPDATE);

                preUpdateDisputeResolverCheck(_disputeResolverId, sender, lookups);

                // Delete old disputeResolver id by clerk mapping
                delete lookups.disputeResolverIdByClerk[disputeResolver.clerk];

                // Update clerk
                disputeResolver.clerk = sender;

                // Store new disputeResolver id by clerk mapping
                lookups.disputeResolverIdByClerk[sender] = _disputeResolverId;

                // Delete pending update clerk
                delete disputeResolverPendingUpdate.clerk;

                updateApplied = true;
            }
        }

        if (updateApplied) {
            // Notify watchers of state change
            emit DisputeResolverUpdateApplied(
                _disputeResolverId,
                disputeResolver,
                disputeResolverPendingUpdate,
                sender
            );
        }
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
        // Cache protocol lookups for reference
        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();

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
                lookups.disputeResolverFeeTokenIndex[_disputeResolverId][_disputeResolverFees[i].tokenAddress] == 0,
                DUPLICATE_DISPUTE_RESOLVER_FEES
            );
            disputeResolverFees.push(_disputeResolverFees[i]);
            lookups.disputeResolverFeeTokenIndex[_disputeResolverId][
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
     * @param _feeTokenAddresses - list of addresses of dispute resolver fee tokens to remove
     */
    function removeFeesFromDisputeResolver(uint256 _disputeResolverId, address[] calldata _feeTokenAddresses)
        external
        disputeResolversNotPaused
        nonReentrant
    {
        // Cache protocol lookups for reference
        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();

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
                lookups.disputeResolverFeeTokenIndex[_disputeResolverId][_feeTokenAddresses[i]] != 0,
                DISPUTE_RESOLVER_FEE_NOT_FOUND
            );
            uint256 disputeResolverFeeArrayIndex = lookups.disputeResolverFeeTokenIndex[_disputeResolverId][
                _feeTokenAddresses[i]
            ] - 1; //Get the index in the DisputeResolverFees array, which is 1 less than the disputeResolverFeeTokenIndex index

            uint256 lastTokenIndex = disputeResolverFees.length - 1;
            if (disputeResolverFeeArrayIndex != lastTokenIndex) {
                // if index == len - 1 then only pop and delete are needed
                // Need to fill gap caused by delete if more than one element in storage array
                DisputeResolverFee memory disputeResolverFeeToMove = disputeResolverFees[lastTokenIndex];
                disputeResolverFees[disputeResolverFeeArrayIndex] = disputeResolverFeeToMove; // Copy the last DisputeResolverFee struct in the array to this index to fill the gap
                lookups.disputeResolverFeeTokenIndex[_disputeResolverId][disputeResolverFeeToMove.tokenAddress] =
                    disputeResolverFeeArrayIndex +
                    1; // Reset index mapping. Should be index in disputeResolverFees array + 1
            }
            disputeResolverFees.pop(); // Delete last DisputeResolverFee struct in the array, which was just moved to fill the gap
            delete lookups.disputeResolverFeeTokenIndex[_disputeResolverId][_feeTokenAddresses[i]]; // Delete from index mapping
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
     * @param _sellerAllowList - list of seller ids to add to allowed list
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
        // Cache protocol lookups for reference
        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();

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

        for (uint256 i = 0; i < _sellerAllowList.length; i++) {
            uint256 sellerToRemoveIndex = lookups.allowedSellerIndex[_disputeResolverId][_sellerAllowList[i]];
            require(sellerToRemoveIndex > 0, SELLER_NOT_APPROVED);

            // remove index mapping
            delete lookups.allowedSellerIndex[_disputeResolverId][_sellerAllowList[i]];

            // reduce for 1 to get actual index value
            sellerToRemoveIndex--;

            uint256 lastIndex = lookups.allowedSellers[_disputeResolverId].length - 1; // since allowedSellerIndex > 0, length at this point cannot be 0 therefore we don't worry about overflow

            // if index to remove is not the last index we put the last element in its place
            if (sellerToRemoveIndex != lastIndex) {
                uint256 lastSellerId = lookups.allowedSellers[_disputeResolverId][lastIndex];
                lookups.allowedSellers[_disputeResolverId][sellerToRemoveIndex] = lastSellerId;
                lookups.allowedSellerIndex[_disputeResolverId][lastSellerId] = sellerToRemoveIndex + 1;
            }

            // remove last element
            lookups.allowedSellers[_disputeResolverId].pop();
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
     * @return exists - the dispute resolver was found
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
        // Cache protocol lookups for reference
        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();

        sellerAllowed = new bool[](_sellerIds.length);

        (bool exists, , ) = fetchDisputeResolver(_disputeResolverId);

        // We populate sellerAllowed only if id really belongs to DR, otherwise return array filled with false
        if (exists) {
            if (lookups.allowedSellers[_disputeResolverId].length == 0) {
                // DR allows everyone, just make sure ids really belong to the sellers
                for (uint256 i = 0; i < _sellerIds.length; i++) {
                    (exists, , ) = fetchSeller(_sellerIds[i]);
                    sellerAllowed[i] = exists;
                }
            } else {
                // DR is selective. Check for every seller if they are allowed for given _disputeResolverId
                for (uint256 i = 0; i < _sellerIds.length; i++) {
                    sellerAllowed[i] = lookups.allowedSellerIndex[_disputeResolverId][_sellerIds[i]] > 0; // true if on the list, false otherwise
                }
            }
        }
    }

    /**
     * @notice Stores DisputeResolver struct in storage.
     *
     * @param _disputeResolver - the fully populated struct with dispute resolver id set
     */
    function storeDisputeResolver(DisputeResolver memory _disputeResolver) internal {
        // Cache protocol lookups for reference
        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();

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
        lookups.disputeResolverIdByOperator[_disputeResolver.operator] = _disputeResolver.id;
        lookups.disputeResolverIdByAdmin[_disputeResolver.admin] = _disputeResolver.id;
        lookups.disputeResolverIdByClerk[_disputeResolver.clerk] = _disputeResolver.id;
    }

    /**
     * @notice Stores seller id to allowed list mapping in storage.
     *
     * Reverts if:
     * - Some seller does not exist
     * - Some seller id is already approved
     *
     * @param _disputeResolverId - id of dispute resolver that is giving the permission
     * @param _sellerAllowList - list of seller ids added to allow list
     */
    function storeSellerAllowList(uint256 _disputeResolverId, uint256[] calldata _sellerAllowList) internal {
        // Cache protocol lookups for reference
        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();

        // Loop over incoming seller ids and store them to the mapping
        for (uint256 i = 0; i < _sellerAllowList.length; i++) {
            uint256 sellerId = _sellerAllowList[i];
            // Check Seller exists in sellers mapping
            (bool exists, , ) = fetchSeller(sellerId);

            // Seller must already exist
            require(exists, NO_SUCH_SELLER);

            // Seller should not be approved already
            require(lookups.allowedSellerIndex[_disputeResolverId][sellerId] == 0, SELLER_ALREADY_APPROVED);

            // Update the mappings
            lookups.allowedSellers[_disputeResolverId].push(sellerId);
            lookups.allowedSellerIndex[_disputeResolverId][sellerId] = lookups
                .allowedSellers[_disputeResolverId]
                .length; //Set index mapping. Should be index in allowedSellers array + 1
        }
    }

    /**
     * @notice Pre update dispute resolver checks
     *
     * Reverts if:
     *   - Address has already been used by another dispute resolver as operator, admin, or clerk
     *
     * @param _disputeResolverId - the id of the disputeResolver to check
     * @param _role - the address to check
     * @param _lookups - the lookups struct
     */
    function preUpdateDisputeResolverCheck(
        uint256 _disputeResolverId,
        address _role,
        ProtocolLib.ProtocolLookups storage _lookups
    ) internal view {
        // Check that the role is unique to one dispute resolver id across all roles -- not used or is used by this dispute resolver id.
        if (_role != address(0)) {
            uint256 check1 = _lookups.disputeResolverIdByOperator[_role];
            uint256 check2 = _lookups.disputeResolverIdByClerk[_role];
            uint256 check3 = _lookups.disputeResolverIdByAdmin[_role];

            require(
                (check1 == 0 || check1 == _disputeResolverId) &&
                    (check2 == 0 || check2 == _disputeResolverId) &&
                    (check3 == 0 || check3 == _disputeResolverId),
                DISPUTE_RESOLVER_ADDRESS_MUST_BE_UNIQUE
            );
        }
    }

    /**
     * @notice Fetches a given dispute resolver pending update from storage by id
     *
     * @param _disputeResolverId - the id of the dispute resolver
     * @return exists - whether the dispute resolver pending update exists
     * @return disputeResolverPendingUpdate - the dispute resolver pending update details. See {BosonTypes.DisputeResolver}
     */
    function fetchDisputeResolverPendingUpdate(uint256 _disputeResolverId)
        internal
        view
        returns (bool exists, DisputeResolver storage disputeResolverPendingUpdate)
    {
        // Cache protocol entities for reference
        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();

        // Get the dispute resolver pending update slot
        disputeResolverPendingUpdate = lookups.pendingAddressUpdatesByDisputeResolver[_disputeResolverId];

        // Determine existence
        exists =
            disputeResolverPendingUpdate.admin != address(0) ||
            disputeResolverPendingUpdate.operator != address(0) ||
            disputeResolverPendingUpdate.clerk != address(0);
    }
}
