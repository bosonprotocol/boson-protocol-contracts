// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import { IBosonAccountHandler } from "../../interfaces/handlers/IBosonAccountHandler.sol";
import { IBosonVoucher } from "../../interfaces/clients/IBosonVoucher.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { AccountBase } from "../bases/AccountBase.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";

contract AccountHandlerFacet is IBosonAccountHandler, AccountBase {
    /**
     * @notice Facet Initializer
     */
    function initialize() public onlyUnInitialized(type(IBosonAccountHandler).interfaceId) {
        DiamondLib.addSupportedInterface(type(IBosonAccountHandler).interfaceId);
    }

    /**
     * @notice Creates a seller
     *
     * Emits a SellerCreated event if successful.
     *
     * Reverts if:
     * - Address values are zero address
     * - Addresses are not unique to this seller
     * - Seller is not active (if active == false)
     *
     * @param _seller - the fully populated struct with seller id set to 0x0
     */
    function createSeller(Seller memory _seller) external override {
        // create seller and update structs values to represent true state
        createSellerInternal(_seller);
    }

    /**
     * @notice Creates a Buyer
     *
     * Emits an BuyerCreated event if successful.
     *
     * Reverts if:
     * - Wallet address is zero address
     * - Active is not true
     * - Wallet address is not unique to this buyer
     *
     * @param _buyer - the fully populated struct with buyer id set to 0x0
     */
    function createBuyer(Buyer memory _buyer) external override {
        createBuyerInternal(_buyer);
    }

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
     * @param _disputeResolverFees - array of fees dispute resolver charges per token type. Zero address is native currency. Can be empty.
     */
    function createDisputeResolver(
        DisputeResolver memory _disputeResolver,
        DisputeResolverFee[] calldata _disputeResolverFees
    ) external override {
        //Check for zero address
        require(
            _disputeResolver.admin != address(0) &&
                _disputeResolver.operator != address(0) &&
                _disputeResolver.clerk != address(0) &&
                _disputeResolver.treasury != address(0),
            INVALID_ADDRESS
        );

        // Get the next account Id and increment the counter
        uint256 disputeResolverId = protocolCounters().nextAccountId++;

        //check that the addresses are unique to one dispute resolver Id
        require(
            protocolLookups().disputeResolverIdByOperator[_disputeResolver.operator] == 0 &&
                protocolLookups().disputeResolverIdByAdmin[_disputeResolver.admin] == 0 &&
                protocolLookups().disputeResolverIdByClerk[_disputeResolver.clerk] == 0,
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

        //Set dispute resolver fees. Must loop because calldata structs cannot be converted to storage structs
        for (uint256 i = 0; i < _disputeResolverFees.length; i++) {
            require(
                protocolLookups().disputeResolverFeeTokenIndex[_disputeResolver.id][
                    _disputeResolverFees[i].tokenAddress
                ] == 0,
                DUPLICATE_DISPUTE_RESOLVER_FEES
            );
            disputeResolverFees.push(
                DisputeResolverFee(
                    _disputeResolverFees[i].tokenAddress,
                    _disputeResolverFees[i].tokenName,
                    _disputeResolverFees[i].feeAmount
                )
            );
            protocolLookups().disputeResolverFeeTokenIndex[_disputeResolver.id][
                _disputeResolverFees[i].tokenAddress
            ] = disputeResolverFees.length; //Set index mapping. Should be index in disputeResolverFees array + 1
        }

        //Ignore supplied active flag and set to false. Dispute Resolver must be activated by protocol.
        _disputeResolver.active = false;

        storeDisputeResolver(_disputeResolver);

        //Notify watchers of state change
        emit DisputeResolverCreated(_disputeResolver.id, _disputeResolver, _disputeResolverFees, msgSender());
    }

    /**
     * @notice Creates a marketplace agent
     *
     * Emits an AgentCreated event if successful.
     *
     * Reverts if:
     * - Wallet address is zero address
     * - Active is not true
     * - Wallet address is not unique to this agent
     *
     * @param _agent - the fully populated struct with agent id set to 0x0
     */
    function createAgent(Agent memory _agent) external override {
        createAgentInternal(_agent);
    }

    /**
     * @notice Updates a seller. All fields should be filled, even those staying the same.
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
    function updateSeller(Seller memory _seller) external override {
        bool exists;
        Seller storage seller;

        //Check Seller exists in sellers mapping
        (exists, seller) = fetchSeller(_seller.id);

        //Seller must already exist
        require(exists, NO_SUCH_SELLER);

        //Check that msg.sender is the admin address for this seller
        require(seller.admin == msgSender(), NOT_ADMIN);

        //Check that the addresses are unique to one seller Id -- not used or are used by this seller id. Checking this seller id is necessary because one or more addresses may not change
        require(
            (protocolLookups().sellerIdByOperator[_seller.operator] == 0 ||
                protocolLookups().sellerIdByOperator[_seller.operator] == _seller.id) &&
                (protocolLookups().sellerIdByAdmin[_seller.admin] == 0 ||
                    protocolLookups().sellerIdByAdmin[_seller.admin] == _seller.id) &&
                (protocolLookups().sellerIdByClerk[_seller.clerk] == 0 ||
                    protocolLookups().sellerIdByClerk[_seller.clerk] == _seller.id),
            SELLER_ADDRESS_MUST_BE_UNIQUE
        );

        //Delete current mappings
        delete protocolLookups().sellerIdByOperator[_seller.operator];
        delete protocolLookups().sellerIdByAdmin[_seller.admin];
        delete protocolLookups().sellerIdByClerk[_seller.clerk];

        storeSeller(_seller);

        // Notify watchers of state change
        emit SellerUpdated(_seller.id, _seller, msgSender());
    }

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
    function updateBuyer(Buyer memory _buyer) external override {
        //Check for zero address
        require(_buyer.wallet != address(0), INVALID_ADDRESS);

        bool exists;
        Buyer storage buyer;

        //Check Buyer exists in buyers mapping
        (exists, buyer) = fetchBuyer(_buyer.id);

        //Buyer must already exist
        require(exists, NO_SUCH_BUYER);

        //Check that msg.sender is the wallet address for this buyer
        require(buyer.wallet == msgSender(), NOT_BUYER_WALLET);

        //Check that current wallet address does not own any vouchers, if changing wallet address
        if (buyer.wallet != _buyer.wallet) {
            IBosonVoucher bosonVoucher = IBosonVoucher(protocolAddresses().voucherAddress);
            require(bosonVoucher.balanceOf(buyer.wallet) == 0, WALLET_OWNS_VOUCHERS);
        }

        //check that the wallet address is unique to one buyer Id if new
        require(
            protocolLookups().buyerIdByWallet[_buyer.wallet] == 0 ||
                protocolLookups().buyerIdByWallet[_buyer.wallet] == _buyer.id,
            BUYER_ADDRESS_MUST_BE_UNIQUE
        );

        //Delete current mappings
        delete protocolLookups().buyerIdByWallet[msgSender()];

        storeBuyer(_buyer);

        // Notify watchers of state change
        emit BuyerUpdated(_buyer.id, _buyer, msgSender());
    }

    /**
     * @notice Updates a dispute resolver, not including DisputeResolverFees or active flag.
     * All DisputeResolver fields should be filled, even those staying the same.
     * Use addFeesToDisputeResolver and removeFeesFromDisputeResolver
     *
     * Emits a DisputeResolverUpdated event if successful.
     *
     * Reverts if:
     * - Caller is not the admin address associated with the dispute resolver account
     * - Any address is zero address
     * - Any address is not unique to this dispute resolver
     * - Dispute resolver does not exist
     *
     * @param _disputeResolver - the fully populated buydispute resolver struct
     */
    function updateDisputeResolver(DisputeResolver memory _disputeResolver) external override {
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

        //Check Dispute Resolver and Dispute Resolver Fees from  disputeResolvers and disputeResolverFees mappings
        (exists, disputeResolver, ) = fetchDisputeResolver(_disputeResolver.id);

        //Dispute Resolver  must already exist
        require(exists, NO_SUCH_DISPUTE_RESOLVER);

        //Check that msg.sender is the admin address for this dispute resolver
        require(disputeResolver.admin == msgSender(), NOT_ADMIN);

        //check that the addresses are unique to one dispute resolverId if new
        require(
            (protocolLookups().disputeResolverIdByOperator[_disputeResolver.operator] == 0 ||
                protocolLookups().disputeResolverIdByOperator[_disputeResolver.operator] == _disputeResolver.id) &&
                (protocolLookups().disputeResolverIdByAdmin[_disputeResolver.admin] == 0 ||
                    protocolLookups().disputeResolverIdByAdmin[_disputeResolver.admin] == _disputeResolver.id) &&
                (protocolLookups().disputeResolverIdByClerk[_disputeResolver.clerk] == 0 ||
                    protocolLookups().disputeResolverIdByClerk[_disputeResolver.clerk] == _disputeResolver.id),
            DISPUTE_RESOLVER_ADDRESS_MUST_BE_UNIQUE
        );

        //Delete current mappings
        delete protocolLookups().disputeResolverIdByOperator[disputeResolver.operator];
        delete protocolLookups().disputeResolverIdByAdmin[disputeResolver.admin];
        delete protocolLookups().disputeResolverIdByClerk[disputeResolver.clerk];

        //Ignore supplied active flag and keep value already stored. Dispute Resolver cannot self-activate.
        _disputeResolver.active = disputeResolver.active;
        storeDisputeResolver(_disputeResolver);

        // Notify watchers of state change
        emit DisputeResolverUpdated(_disputeResolver.id, _disputeResolver, msgSender());
    }

    /**
     * @notice Add DisputeResolverFees to an existing dispute resolver
     *
     * Emits a DisputeResolverFeesAdded event if successful.
     *
     * Reverts if:
     * - Caller is not the admin address associated with the dispute resolver account
     * - Dispute resolver does not exist
     * - Number of DisputeResolverFee structs in array exceeds max
     * - Number of DisputeResolverFee structs in array is zero
     * - DisputeResolverFee array contains duplicates
     *
     * @param _disputeResolverId - Id of the dispute resolver
     * @param _disputeResolverFees - list of fees dispute resolver charges per token type. Zero address is native currency. See {BosonTypes.DisputeResolverFee}
     */
    function addFeesToDisputeResolver(uint256 _disputeResolverId, DisputeResolverFee[] calldata _disputeResolverFees)
        external
        override
    {
        bool exists;
        DisputeResolver storage disputeResolver;
        DisputeResolverFee[] storage disputeResolverFees;

        //Check Dispute Resolver and Dispute Resolver Fees from  disputeResolvers and disputeResolverFees mappings
        (exists, disputeResolver, disputeResolverFees) = fetchDisputeResolver(_disputeResolverId);

        //Dispute Resolver  must already exist
        require(exists, NO_SUCH_DISPUTE_RESOLVER);

        //Check that msg.sender is the admin address for this dispute resolver
        require(disputeResolver.admin == msgSender(), NOT_ADMIN);

        // At least one fee must be specified and the number of fees cannot exceed the maximum number of dispute resolver fees to avoid running into block gas limit in a loop
        require(
            _disputeResolverFees.length > 0 &&
                _disputeResolverFees.length <= protocolLimits().maxFeesPerDisputeResolver,
            INVALID_AMOUNT_DISPUTE_RESOLVER_FEES
        );

        //Set dispute resolver fees. Must loop because calldata structs cannot be converted to storage structs
        for (uint256 i = 0; i < _disputeResolverFees.length; i++) {
            require(
                protocolLookups().disputeResolverFeeTokenIndex[_disputeResolverId][
                    _disputeResolverFees[i].tokenAddress
                ] == 0,
                DUPLICATE_DISPUTE_RESOLVER_FEES
            );
            disputeResolverFees.push(
                DisputeResolverFee(
                    _disputeResolverFees[i].tokenAddress,
                    _disputeResolverFees[i].tokenName,
                    _disputeResolverFees[i].feeAmount
                )
            );
            protocolLookups().disputeResolverFeeTokenIndex[_disputeResolverId][
                _disputeResolverFees[i].tokenAddress
            ] = disputeResolverFees.length; //Set index mapping. Should be index in disputeResolverFees array + 1
        }

        emit DisputeResolverFeesAdded(_disputeResolverId, _disputeResolverFees, msgSender());
    }

    /**
     * @notice Remove DisputeResolverFees from  an existing dispute resolver
     *
     * Emits a DisputeResolverFeesRemoved event if successful.
     *
     * Reverts if:
     * - Caller is not the admin address associated with the dispute resolver account
     * - Dispute resolver does not exist
     * - Number of DisputeResolverFee structs in array exceeds max
     * - Number of DisputeResolverFee structs in array is zero
     * - DisputeResolverFee does not exist for the dispute resolver
     *
     * @param _disputeResolverId - Id of the dispute resolver
     * @param _feeTokenAddresses - list of adddresses of dispute resolver fee tokens to remove
     */
    function removeFeesFromDisputeResolver(uint256 _disputeResolverId, address[] calldata _feeTokenAddresses)
        external
        override
    {
        bool exists;
        DisputeResolver storage disputeResolver;
        DisputeResolverFee[] storage disputeResolverFees;

        //Check Dispute Resolver and Dispute Resolver Fees from  disputeResolvers and disputeResolverFees mappings
        (exists, disputeResolver, disputeResolverFees) = fetchDisputeResolver(_disputeResolverId);

        //Dispute Resolver  must already exist
        require(exists, NO_SUCH_DISPUTE_RESOLVER);

        //Check that msg.sender is the admin address for this dispute resolver
        require(disputeResolver.admin == msgSender(), NOT_ADMIN);

        // At least one fee must be specified and the number of fees cannot exceed the maximum number of dispute resolver fees to avoid running into block gas limit in a loop
        require(
            _feeTokenAddresses.length > 0 && _feeTokenAddresses.length <= protocolLimits().maxFeesPerDisputeResolver,
            INVALID_AMOUNT_DISPUTE_RESOLVER_FEES
        );

        //Set dispute resolver fees. Must loop because calldata structs cannot be converted to storage structs
        for (uint256 i = 0; i < _feeTokenAddresses.length; i++) {
            require(
                protocolLookups().disputeResolverFeeTokenIndex[_disputeResolverId][_feeTokenAddresses[i]] != 0,
                DISPUTE_RESOLVER_FEE_NOT_FOUND
            );
            uint256 disputeResolverFeeArrayIndex = protocolLookups().disputeResolverFeeTokenIndex[_disputeResolverId][
                _feeTokenAddresses[i]
            ] - 1; //Get the index in the DisputeResolverFees array, which is 1 less than the disputeResolverFeeTokenIndex index
            delete disputeResolverFees[disputeResolverFeeArrayIndex]; //Delete DisputeResolverFee struct at this index
            if (disputeResolverFees.length > 1) {
                //Need to fill gap caused by delete if more than one element in storage array
                DisputeResolverFee memory disputeResolverFeeToMove = disputeResolverFees[
                    disputeResolverFees.length - 1
                ];
                disputeResolverFees[disputeResolverFeeArrayIndex] = disputeResolverFeeToMove; //Copy the last DisputeResolverFee struct in the array to this index to fill the gap
                protocolLookups().disputeResolverFeeTokenIndex[_disputeResolverId][
                    disputeResolverFeeToMove.tokenAddress
                ] = disputeResolverFeeArrayIndex + 1; //Reset index mapping. Should be index in disputeResolverFees array + 1
            }
            disputeResolverFees.pop(); // Delete last DisputeResolverFee struct in the array, which was just moved to fill the gap
            delete protocolLookups().disputeResolverFeeTokenIndex[_disputeResolverId][_feeTokenAddresses[i]]; //Delete from index mapping
        }

        emit DisputeResolverFeesRemoved(_disputeResolverId, _feeTokenAddresses, msgSender());
    }

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
    function activateDisputeResolver(uint256 _disputeResolverId) external override onlyRole(ADMIN) {
        bool exists;
        DisputeResolver storage disputeResolver;

        //Check Dispute Resolver and Dispute Resolver Fees from  disputeResolvers and disputeResolverFees mappings
        (exists, disputeResolver, ) = fetchDisputeResolver(_disputeResolverId);

        //Dispute Resolver  must already exist
        require(exists, NO_SUCH_DISPUTE_RESOLVER);

        disputeResolver.active = true;

        emit DisputeResolverActivated(_disputeResolverId, disputeResolver, msgSender());
    }

    /**
     * @notice Gets the details about a seller.
     *
     * @param _sellerId - the id of the seller to check
     * @return exists - the seller was found
     * @return seller - the seller details. See {BosonTypes.Seller}
     */
    function getSeller(uint256 _sellerId) external view override returns (bool exists, Seller memory seller) {
        return fetchSeller(_sellerId);
    }

    /**
     * @notice Gets the details about a seller using an address associated with that seller: operator, admin, or clerk address.
     *
     * @param _associatedAddress - the address associated with the seller. Must be an operator, admin, or clerk address.
     * @return exists - the seller was found
     * @return seller - the seller details. See {BosonTypes.Seller}
     */
    function getSellerByAddress(address _associatedAddress)
        external
        view
        override
        returns (bool exists, Seller memory seller)
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
     * @notice Gets the details about a buyer.
     *
     * @param _buyerId - the id of the buyer to check
     * @return exists - the buyer was found
     * @return buyer - the buyer details. See {BosonTypes.Buyer}
     */
    function getBuyer(uint256 _buyerId) external view override returns (bool exists, Buyer memory buyer) {
        return fetchBuyer(_buyerId);
    }

    /**
     * @notice Gets the details about a dispute resolver.
     *
     * @param _disputeResolverId - the id of the rdispute esolver to check
     * @return exists - the dispute resolver was found
     * @return disputeResolver - the dispute resolver details. See {BosonTypes.DisputeResolver}
     * @return disputeResolverFees - list of fees dispute resolver charges per token type. Zero address is native currency. See {BosonTypes.DisputeResolverFee}
     */
    function getDisputeResolver(uint256 _disputeResolverId)
        external
        view
        override
        returns (
            bool exists,
            DisputeResolver memory disputeResolver,
            DisputeResolverFee[] memory disputeResolverFees
        )
    {
        return fetchDisputeResolver(_disputeResolverId);
    }

    /**
     * @notice Gets the details about a dispute resolver by an address associated with that dispute resolver: operator, admin, or clerk address.
     *
     * @param _associatedAddress - the address associated with the dispute resolver. Must be an operator, admin, or clerk address.
     * @return exists - the dispute resolver  was found
     * @return disputeResolver - the dispute resolver details. See {BosonTypes.DisputeResolver}
     * @return disputeResolverFees - list of fees dispute resolver charges per token type. Zero address is native currency. See {BosonTypes.DisputeResolverFee}
     */
    function getDisputeResolverByAddress(address _associatedAddress)
        external
        view
        override
        returns (
            bool exists,
            DisputeResolver memory disputeResolver,
            DisputeResolverFee[] memory disputeResolverFees
        )
    {
        uint256 disputeResolverId;

        (exists, disputeResolverId) = getDisputeResolverIdByOperator(_associatedAddress);
        if (exists) {
            return fetchDisputeResolver(disputeResolverId);
        }

        (exists, disputeResolverId) = getDisputeResolverIdByAdmin(_associatedAddress);
        if (exists) {
            return fetchDisputeResolver(disputeResolverId);
        }

        (exists, disputeResolverId) = getDisputeResolverIdByClerk(_associatedAddress);
        if (exists) {
            return fetchDisputeResolver(disputeResolverId);
        }
    }

    /**
     * @notice Gets the next account Id that can be assigned to an account.
     *
     * @return nextAccountId - the account Id
     */
    function getNextAccountId() external view override returns (uint256 nextAccountId) {
        nextAccountId = protocolCounters().nextAccountId;
    }

    /**
     * @notice Stores DisputeResolver struct in storage
     *
     * @param _disputeResolver - the fully populated struct with dispute resolver id set
     */

    function storeDisputeResolver(DisputeResolver memory _disputeResolver) internal {
        // escalation period must be greater than zero and less than or equal to the max allowed
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

        //Map the dispute resolver's addresses to the dispute resolver Id.
        protocolLookups().disputeResolverIdByOperator[_disputeResolver.operator] = _disputeResolver.id;
        protocolLookups().disputeResolverIdByAdmin[_disputeResolver.admin] = _disputeResolver.id;
        protocolLookups().disputeResolverIdByClerk[_disputeResolver.clerk] = _disputeResolver.id;
    }
}
