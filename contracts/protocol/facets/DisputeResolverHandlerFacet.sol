// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import "../../domain/BosonConstants.sol";
import { IBosonAccountEvents } from "../../interfaces/events/IBosonAccountEvents.sol";
import { IBosonDisputeResolverHandler } from "../../interfaces/handlers/IBosonDisputeResolverHandler.sol";
import { ProtocolBase } from "../bases/ProtocolBase.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";

/**
 * @title DisputeResolverHandlerFacet
 *
 * @notice Handles dispute resolver account management requests and queries
 */
contract DisputeResolverHandlerFacet is IBosonDisputeResolverHandler, IBosonAccountEvents, ProtocolBase {
    /**
     * @notice Initializes facet.
     */
    function initialize() public {
        // No-op initializer.
        // - needed by the deployment script, which expects a no-args initializer on facets other than the config handler
        // - exception here because IBosonAccountHandler is contributed to by multiple facets which do not have their own individual interfaces
    }

    /**
     * @notice Creates a dispute resolver.
     *
     * Emits a DisputeResolverCreated event if successful.
     *
     * Reverts if:
     * - Caller is not the supplied admin and assistant
     * - Supplied clerk is not a zero address
     * - The dispute resolvers region of protocol is paused
     * - Any address is zero address
     * - Any address is not unique to this dispute resolver
     * - EscalationResponsePeriod is invalid
     * - Some seller does not exist
     * - Some seller id is duplicated
     * - DisputeResolver is not active (if active == false)
     * - Fee amount is a non-zero value. Protocol doesn't yet support fees for dispute resolvers
     *
     * @param _disputeResolver - the fully populated struct with dispute resolver id set to 0x0
     * @param _disputeResolverFees - list of fees dispute resolver charges per token type. Zero address is native currency. See {BosonTypes.DisputeResolverFee}
     *                               feeAmount will be ignored because protocol doesn't yet support fees yet but DR still needs to provide array of fees to choose supported tokens
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
        if (
            _disputeResolver.admin == address(0) ||
            _disputeResolver.assistant == address(0) ||
            _disputeResolver.treasury == address(0)
        ) revert InvalidAddress();

        // Check active is not set to false
        if (!_disputeResolver.active) revert MustBeActive();

        // Scope to avoid stack too deep errors
        {
            // Get message sender
            address sender = _msgSender();

            // Check that caller is the supplied admin and assistant
            if (_disputeResolver.admin != sender || _disputeResolver.assistant != sender) revert NotAdminAndAssistant();
            if (_disputeResolver.clerk != address(0)) revert ClerkDeprecated();
        }

        // Get the next account id and increment the counter
        uint256 disputeResolverId = protocolCounters().nextAccountId++;

        // Check that the addresses are unique to one dispute resolver id, across all rolls
        mapping(address => uint256) storage disputeResolverIdByAssistant = lookups.disputeResolverIdByAssistant;
        mapping(address => uint256) storage disputeResolverIdByAdmin = lookups.disputeResolverIdByAdmin;
        if (
            disputeResolverIdByAssistant[_disputeResolver.assistant] != 0 ||
            disputeResolverIdByAssistant[_disputeResolver.admin] != 0 ||
            disputeResolverIdByAdmin[_disputeResolver.admin] != 0 ||
            disputeResolverIdByAdmin[_disputeResolver.assistant] != 0
        ) {
            revert DisputeResolverAddressMustBeUnique();
        }

        // Scope to avoid stack too deep errors
        {
            // Cache protocol limits for reference
            ProtocolLib.ProtocolLimits storage limits = protocolLimits();

            // Escalation period must be greater than zero and less than or equal to the max allowed
            if (
                _disputeResolver.escalationResponsePeriod == 0 ||
                _disputeResolver.escalationResponsePeriod > limits.maxEscalationResponsePeriod
            ) revert InvalidEscalationPeriod();
        }

        _disputeResolver.id = disputeResolverId;

        // Get storage location for dispute resolver fees
        (, , DisputeResolverFee[] storage disputeResolverFees) = fetchDisputeResolver(_disputeResolver.id);

        // Set dispute resolver fees. Must loop because calldata structs cannot be converted to storage structs
        mapping(address => uint256) storage disputeResolverFeeTokens = lookups.disputeResolverFeeTokenIndex[
            _disputeResolver.id
        ];

        for (uint256 i = 0; i < _disputeResolverFees.length; ) {
            if (disputeResolverFeeTokens[_disputeResolverFees[i].tokenAddress] != 0)
                revert DuplicateDisputeResolverFees();

            // Protocol doesn't yet support DR fees
            if (_disputeResolverFees[i].feeAmount != 0) revert FeeAmountNotYetSupported();

            disputeResolverFees.push(_disputeResolverFees[i]);

            // Set index mapping. Should be index in disputeResolverFees array + 1
            disputeResolverFeeTokens[_disputeResolverFees[i].tokenAddress] = disputeResolverFees.length;

            unchecked {
                i++;
            }
        }

        storeDisputeResolver(_disputeResolver);
        storeSellerAllowList(disputeResolverId, _sellerAllowList);

        // Notify watchers of state change
        emit DisputeResolverCreated(
            _disputeResolver.id,
            _disputeResolver,
            _disputeResolverFees,
            _sellerAllowList,
            _msgSender()
        );
    }

    /**
     * @notice Updates treasury address, escalationResponsePeriod or metadataUri if changed. Puts admin and assistant in pending queue, if changed.
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
     * Emits a DisputeResolverUpdatePending event if the dispute resolver has requested an update for admin or assistant.
     * Owner(s) of new addresses for admin, assistant must opt-in to the update.
     *
     * Reverts if:
     * - The dispute resolvers region of protocol is paused
     * - Caller is not the admin address of the stored dispute resolver
     * - Any address is zero address
     * - Any address is not unique to this dispute resolver
     * - Supplied clerk is not a zero address
     * - Dispute resolver does not exist
     * - EscalationResponsePeriod is invalid
     * - No field has been updated or requested to be updated
     *
     * @param _disputeResolver - the fully populated dispute resolver struct
     */
    function updateDisputeResolver(
        DisputeResolver memory _disputeResolver
    ) external disputeResolversNotPaused nonReentrant {
        // Cache protocol lookups for reference
        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();

        // Check for zero address
        if (
            _disputeResolver.admin == address(0) ||
            _disputeResolver.assistant == address(0) ||
            _disputeResolver.treasury == address(0)
        ) {
            revert InvalidAddress();
        }
        if (_disputeResolver.clerk != address(0)) revert ClerkDeprecated();

        bool exists;
        DisputeResolver storage disputeResolver;

        // Check dispute resolver and dispute resolver Fees from disputeResolvers and disputeResolverFees mappings
        (exists, disputeResolver, ) = fetchDisputeResolver(_disputeResolver.id);

        // Dispute resolver must already exist
        if (!exists) revert NoSuchDisputeResolver();

        // Get message sender
        address sender = _msgSender();

        // Check that caller is the admin address for this dispute resolver
        if (disputeResolver.admin != sender) revert NotAdmin();

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

        if (_disputeResolver.assistant != disputeResolver.assistant) {
            preUpdateDisputeResolverCheck(_disputeResolver.id, _disputeResolver.assistant, lookups);

            // If assistant address exists, assistant address owner must approve the update to prevent front-running
            disputeResolverPendingUpdate.assistant = _disputeResolver.assistant;
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
            if (
                _disputeResolver.escalationResponsePeriod == 0 ||
                _disputeResolver.escalationResponsePeriod > protocolLimits().maxEscalationResponsePeriod
            ) {
                revert InvalidEscalationPeriod();
            }

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

        if (!updateApplied && !needsApproval) revert NoUpdateApplied();
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
     * - Dispute resolver tries to update the clerk
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
        address sender = _msgSender();

        // Get disputeResolver pending update
        (bool exists, DisputeResolver storage disputeResolverPendingUpdate) = fetchDisputeResolverPendingUpdate(
            _disputeResolverId
        );

        if (!exists) revert NoPendingUpdateForAccount();

        bool updateApplied;

        // Get storage location for disputeResolver
        (, DisputeResolver storage disputeResolver, ) = fetchDisputeResolver(_disputeResolverId);

        for (uint256 i = 0; i < _fieldsToUpdate.length; ) {
            DisputeResolverUpdateFields role = _fieldsToUpdate[i];

            if (role == DisputeResolverUpdateFields.Admin && disputeResolverPendingUpdate.admin != address(0)) {
                // Approve admin update
                if (disputeResolverPendingUpdate.admin != sender) revert UnauthorizedCallerUpdate();

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
                role == DisputeResolverUpdateFields.Assistant && disputeResolverPendingUpdate.assistant != address(0)
            ) {
                // Approve assistant update
                if (disputeResolverPendingUpdate.assistant != sender) revert UnauthorizedCallerUpdate();

                preUpdateDisputeResolverCheck(_disputeResolverId, sender, lookups);

                // Delete old disputeResolver id by assistant mapping
                delete lookups.disputeResolverIdByAssistant[disputeResolver.assistant];

                // Update assistant
                disputeResolver.assistant = sender;

                // Store new disputeResolver id by assistant mapping
                lookups.disputeResolverIdByAssistant[sender] = _disputeResolverId;

                // Delete pending update assistant
                delete disputeResolverPendingUpdate.assistant;

                updateApplied = true;
            } else if (role == DisputeResolverUpdateFields.Clerk) {
                revert ClerkDeprecated();
            }

            unchecked {
                i++;
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
     * - Number of DisputeResolverFee structs in array is zero
     * - DisputeResolverFee array contains duplicates
     * - Fee amount is a non-zero value. Protocol doesn't yet support fees for dispute resolvers
     *
     * @param _disputeResolverId - id of the dispute resolver
     * @param _disputeResolverFees - list of fees dispute resolver charges per token type. Zero address is native currency. See {BosonTypes.DisputeResolverFee}
     *                               feeAmount will be ignored because protocol doesn't yet support fees yet but DR still needs to provide array of fees to choose supported tokens
     */
    function addFeesToDisputeResolver(
        uint256 _disputeResolverId,
        DisputeResolverFee[] calldata _disputeResolverFees
    ) external disputeResolversNotPaused nonReentrant {
        // Cache protocol lookups for reference
        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();

        bool exists;
        DisputeResolver storage disputeResolver;
        DisputeResolverFee[] storage disputeResolverFees;

        // Check dispute resolver and dispute resolver Fees from disputeResolvers and disputeResolverFees mappings
        (exists, disputeResolver, disputeResolverFees) = fetchDisputeResolver(_disputeResolverId);

        // Dispute resolver must already exist
        if (!exists) revert NoSuchDisputeResolver();

        // Get message sender
        address sender = _msgSender();

        // Check that msg.sender is the admin address for this dispute resolver
        if (disputeResolver.admin != sender) revert NotAdmin();

        // At least one fee must be specified
        if (_disputeResolverFees.length == 0) revert InexistentDisputeResolverFees();

        // Set dispute resolver fees. Must loop because calldata structs cannot be converted to storage structs
        for (uint256 i = 0; i < _disputeResolverFees.length; ) {
            if (lookups.disputeResolverFeeTokenIndex[_disputeResolverId][_disputeResolverFees[i].tokenAddress] != 0)
                revert DuplicateDisputeResolverFees();

            // Protocol doesn't yet support DR fees
            if (_disputeResolverFees[i].feeAmount != 0) revert FeeAmountNotYetSupported();

            disputeResolverFees.push(_disputeResolverFees[i]);
            lookups.disputeResolverFeeTokenIndex[_disputeResolverId][
                _disputeResolverFees[i].tokenAddress
            ] = disputeResolverFees.length; // Set index mapping. Should be index in disputeResolverFees array + 1

            unchecked {
                i++;
            }
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
     * - Number of DisputeResolverFee structs in array is zero
     * - DisputeResolverFee does not exist for the dispute resolver
     *
     * @param _disputeResolverId - id of the dispute resolver
     * @param _feeTokenAddresses - list of addresses of dispute resolver fee tokens to remove
     */
    function removeFeesFromDisputeResolver(
        uint256 _disputeResolverId,
        address[] calldata _feeTokenAddresses
    ) external disputeResolversNotPaused nonReentrant {
        // Cache protocol lookups for reference
        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();

        bool exists;
        DisputeResolver storage disputeResolver;
        DisputeResolverFee[] storage disputeResolverFees;

        // Check dispute resolver and dispute resolver fees from disputeResolvers and disputeResolverFees mappings
        (exists, disputeResolver, disputeResolverFees) = fetchDisputeResolver(_disputeResolverId);

        // Dispute resolver must already exist
        if (!exists) revert NoSuchDisputeResolver();

        // Get message sender
        address sender = _msgSender();

        // Check that msg.sender is the admin address for this dispute resolver
        if (disputeResolver.admin != sender) revert NotAdmin();

        // At least one fee must be specified and
        if (_feeTokenAddresses.length == 0) revert InexistentDisputeResolverFees();

        // Set dispute resolver fees. Must loop because calldata structs cannot be converted to storage structs
        for (uint256 i = 0; i < _feeTokenAddresses.length; ) {
            if (lookups.disputeResolverFeeTokenIndex[_disputeResolverId][_feeTokenAddresses[i]] == 0)
                revert DisputeResolverFeeNotFound();

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

            unchecked {
                i++;
            }
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
     * - Number of seller ids in array is zero
     * - Some seller does not exist
     * - Seller id is already approved
     *
     * @param _disputeResolverId - id of the dispute resolver
     * @param _sellerAllowList - list of seller ids to add to allowed list
     */
    function addSellersToAllowList(
        uint256 _disputeResolverId,
        uint256[] calldata _sellerAllowList
    ) external disputeResolversNotPaused nonReentrant {
        // At least one seller id must be specified
        if (_sellerAllowList.length == 0) revert InexistentAllowedSellersList();

        bool exists;
        DisputeResolver storage disputeResolver;

        // Check dispute Resolver from disputeResolvers
        (exists, disputeResolver, ) = fetchDisputeResolver(_disputeResolverId);

        // Dispute resolver must already exist
        if (!exists) revert NoSuchDisputeResolver();

        // Get message sender
        address sender = _msgSender();

        // Check that msg.sender is the admin address for this dispute resolver
        if (disputeResolver.admin != sender) revert NotAdmin();

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
     * - Number of seller ids structs in array is zero
     * - Seller id is not approved
     *
     * @param _disputeResolverId - id of the dispute resolver
     * @param _sellerAllowList - list of seller ids to remove from allowed list
     */
    function removeSellersFromAllowList(
        uint256 _disputeResolverId,
        uint256[] calldata _sellerAllowList
    ) external disputeResolversNotPaused nonReentrant {
        // Cache protocol lookups for reference
        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();

        // At least one seller id must be specified
        if (_sellerAllowList.length == 0) revert InexistentAllowedSellersList();

        bool exists;
        DisputeResolver storage disputeResolver;

        // Check dispute resolver from disputeResolvers
        (exists, disputeResolver, ) = fetchDisputeResolver(_disputeResolverId);

        // Dispute resolver must already exist
        if (!exists) revert NoSuchDisputeResolver();

        // Get message sender
        address sender = _msgSender();

        // Check that msg.sender is the admin address for this dispute resolver
        if (disputeResolver.admin != sender) revert NotAdmin();

        for (uint256 i = 0; i < _sellerAllowList.length; ) {
            uint256 sellerToRemoveIndex = lookups.allowedSellerIndex[_disputeResolverId][_sellerAllowList[i]];
            if (sellerToRemoveIndex == 0) revert SellerNotApproved();

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

            unchecked {
                i++;
            }
        }

        emit AllowedSellersRemoved(_disputeResolverId, _sellerAllowList, sender);
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
    function getDisputeResolver(
        uint256 _disputeResolverId
    )
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
            disputeResolver.clerk = address(0);
            sellerAllowList = protocolLookups().allowedSellers[_disputeResolverId];
        }
    }

    /**
     * @notice Gets the details about a dispute resolver by an address associated with that dispute resolver: assistant, or admin address.
     *
     * @param _associatedAddress - the address associated with the dispute resolver. Must be an assistant or admin address.
     * @return exists - the dispute resolver was found
     * @return disputeResolver - the dispute resolver details. See {BosonTypes.DisputeResolver}
     * @return disputeResolverFees - list of fees dispute resolver charges per token type. Zero address is native currency. See {BosonTypes.DisputeResolverFee}
     * @return sellerAllowList - list of sellers that are allowed to chose this dispute resolver
     */
    function getDisputeResolverByAddress(
        address _associatedAddress
    )
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

        (exists, disputeResolverId) = getDisputeResolverIdByAssistant(_associatedAddress);

        if (exists) {
            return getDisputeResolver(disputeResolverId);
        }

        (exists, disputeResolverId) = getDisputeResolverIdByAdmin(_associatedAddress);

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
    function areSellersAllowed(
        uint256 _disputeResolverId,
        uint256[] calldata _sellerIds
    ) external view returns (bool[] memory sellerAllowed) {
        // Cache protocol lookups for reference
        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();

        sellerAllowed = new bool[](_sellerIds.length);

        (bool exists, , ) = fetchDisputeResolver(_disputeResolverId);

        // We populate sellerAllowed only if id really belongs to DR, otherwise return array filled with false
        if (exists) {
            if (lookups.allowedSellers[_disputeResolverId].length == 0) {
                // DR allows everyone, just make sure ids really belong to the sellers
                for (uint256 i = 0; i < _sellerIds.length; ) {
                    (exists, , ) = fetchSeller(_sellerIds[i]);
                    sellerAllowed[i] = exists;

                    unchecked {
                        i++;
                    }
                }
            } else {
                // DR is selective. Check for every seller if they are allowed for given _disputeResolverId
                for (uint256 i = 0; i < _sellerIds.length; ) {
                    sellerAllowed[i] = lookups.allowedSellerIndex[_disputeResolverId][_sellerIds[i]] > 0; // true if on the list, false otherwise

                    unchecked {
                        i++;
                    }
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
        disputeResolver.assistant = _disputeResolver.assistant;
        disputeResolver.admin = _disputeResolver.admin;
        disputeResolver.treasury = _disputeResolver.treasury;
        disputeResolver.metadataUri = _disputeResolver.metadataUri;
        disputeResolver.active = _disputeResolver.active;

        // Map the dispute resolver's addresses to the dispute resolver id.
        lookups.disputeResolverIdByAssistant[_disputeResolver.assistant] = _disputeResolver.id;
        lookups.disputeResolverIdByAdmin[_disputeResolver.admin] = _disputeResolver.id;
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
        for (uint256 i = 0; i < _sellerAllowList.length; ) {
            uint256 sellerId = _sellerAllowList[i];
            // Check Seller exists in sellers mapping
            (bool exists, , ) = fetchSeller(sellerId);

            // Seller must already exist
            if (!exists) revert NoSuchSeller();

            // Seller should not be approved already
            if (lookups.allowedSellerIndex[_disputeResolverId][sellerId] != 0) revert SellerAlreadyApproved();

            // Update the mappings
            lookups.allowedSellers[_disputeResolverId].push(sellerId);
            lookups.allowedSellerIndex[_disputeResolverId][sellerId] = lookups
                .allowedSellers[_disputeResolverId]
                .length; //Set index mapping. Should be index in allowedSellers array + 1

            unchecked {
                i++;
            }
        }
    }

    /**
     * @notice Pre update dispute resolver checks
     *
     * Reverts if:
     *   - Address has already been used by another dispute resolver as assistant or admin
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
        uint256 check1 = _lookups.disputeResolverIdByAssistant[_role];
        uint256 check2 = _lookups.disputeResolverIdByAdmin[_role];

        if ((check1 != 0 && check1 != _disputeResolverId) || (check2 != 0 && check2 != _disputeResolverId)) {
            revert DisputeResolverAddressMustBeUnique();
        }
    }

    /**
     * @notice Fetches a given dispute resolver pending update from storage by id
     *
     * @param _disputeResolverId - the id of the dispute resolver
     * @return exists - whether the dispute resolver pending update exists
     * @return disputeResolverPendingUpdate - the dispute resolver pending update details. See {BosonTypes.DisputeResolver}
     */
    function fetchDisputeResolverPendingUpdate(
        uint256 _disputeResolverId
    ) internal view returns (bool exists, DisputeResolver storage disputeResolverPendingUpdate) {
        // Cache protocol entities for reference
        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();

        // Get the dispute resolver pending update slot
        disputeResolverPendingUpdate = lookups.pendingAddressUpdatesByDisputeResolver[_disputeResolverId];

        // Determine existence
        exists =
            disputeResolverPendingUpdate.admin != address(0) ||
            disputeResolverPendingUpdate.assistant != address(0);
    }
}
