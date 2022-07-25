// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import { IBosonAccountHandler } from "../../interfaces/handlers/IBosonAccountHandler.sol";
import { IBosonVoucher } from "../../interfaces/clients/IBosonVoucher.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { AccountBase } from "../bases/AccountBase.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";
import {IERC721} from "../../interfaces/IERC721.sol";

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
     * - Admin address is zero address and AuthTokenType == None
     * - AuthTokenType is not unique to this seller
     *
     * @param _seller - the fully populated struct with seller id set to 0x0
     * @param _contractURI - contract metadata URI
     * @param _authToken - optional AuthToken struct that specifies an AuthToken type and tokenId that the user can use to do admin functions
     */
    function createSeller(Seller memory _seller, string calldata _contractURI, AuthToken calldata _authToken) external override {
        // create seller and update structs values to represent true state
        createSellerInternal(_seller, _contractURI, _authToken);
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
    ) external override {
        //Check for zero address
        require(
            _disputeResolver.admin != address(0) &&
                _disputeResolver.operator != address(0) &&
                _disputeResolver.clerk != address(0) &&
                _disputeResolver.treasury != address(0),
            INVALID_ADDRESS
        );

        // Make sure the gas block limit is not hit
        require(_sellerAllowList.length <= protocolLimits().maxAllowedSellers, INVALID_AMOUNT_ALLOWED_SELLERS);

        // Get the next account Id and increment the counter
        uint256 disputeResolverId = protocolCounters().nextAccountId++;

        //check that the addresses are unique to one dispute resolver Id, across all rolls
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
        storeSellerAllowList(disputeResolverId, _sellerAllowList);

        //Notify watchers of state change
        emit DisputeResolverCreated(
            _disputeResolver.id,
            _disputeResolver,
            _disputeResolverFees,
            _sellerAllowList,
            msgSender()
        );
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
     * - Fee percentage is greater than 10000 (100%)
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
     * - Admin address is zero address and AuthTokenType == None
     * - AuthTokenType is not unique to this seller
     *
     * @param _seller - the fully populated seller struct
     * @param _authToken - optional AuthToken struct that specifies an AuthToken type and tokenId that the user can use to do admin functions
     */
    function updateSeller(Seller memory _seller, AuthToken calldata _authToken) external override {
        bool exists;
        Seller storage seller;
        AuthToken storage authToken;

        //Check Seller exists in sellers mapping
        (exists, seller, authToken) = fetchSeller(_seller.id);

        //Seller must already exist
        require(exists, NO_SUCH_SELLER);

        //Check that caller is authorized to call this function
        if(seller.admin == address(0)) {
            address authTokenContract = protocolLookups().authTokenContracts[authToken.tokenType];
            address tokenIdOwner = IERC721(authTokenContract).ownerOf(authToken.tokenId);
            require(tokenIdOwner == msgSender(), NOT_ADMIN);
        } else {
            //Check that msg.sender is authorized to call this function
            require(seller.admin == msgSender(), NOT_ADMIN);
        }

        //Admin address or AuthToken data must be present. A seller can have one or the other
        require(_seller.admin != address(0) || _authToken.tokenType != AuthTokenType.None, ADMIN_OR_AUTH_TOKEN);

        //Check that the addresses are unique to one seller Id across all roles -- not used or are used by this seller id.
        //Checking this seller id is necessary because one or more addresses may not change
        require(
            (protocolLookups().sellerIdByOperator[_seller.operator] == 0 ||
                protocolLookups().sellerIdByOperator[_seller.operator] == _seller.id) &&
                (protocolLookups().sellerIdByOperator[_seller.clerk] == 0 ||
                    protocolLookups().sellerIdByOperator[_seller.clerk] == _seller.id) &&
                (protocolLookups().sellerIdByAdmin[_seller.operator] == 0 ||
                    protocolLookups().sellerIdByAdmin[_seller.operator] == _seller.id) &&
                (protocolLookups().sellerIdByAdmin[_seller.clerk] == 0 ||
                    protocolLookups().sellerIdByAdmin[_seller.clerk] == _seller.id) &&
                (protocolLookups().sellerIdByClerk[_seller.clerk] == 0 ||
                    protocolLookups().sellerIdByClerk[_seller.clerk] == _seller.id) &&
                (protocolLookups().sellerIdByClerk[_seller.operator] == 0 ||
                    protocolLookups().sellerIdByClerk[_seller.operator] == _seller.id),
            SELLER_ADDRESS_MUST_BE_UNIQUE
        );

        //Admin address or AuthToken data must be present in parameters. A seller can have one or the other
        if(_seller.admin == address(0)) {
            require(_authToken.tokenType != AuthTokenType.None, ADMIN_OR_AUTH_TOKEN);

            //Check that auth token is unique to this seller
            require(protocolLookups().sellerIdByAuthToken[_authToken.tokenType][_authToken.tokenId] == 0, AUTH_TOKEN_MUST_BE_UNIQUE);
        } else {
            //Check that the admin address is unique to one seller Id across all roles -- not used or is used by this seller id.
       
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

        //Delete current mappings
        delete protocolLookups().sellerIdByOperator[seller.operator];
        delete protocolLookups().sellerIdByAdmin[seller.admin];
        delete protocolLookups().sellerIdByClerk[seller.clerk];
        delete protocolLookups().sellerIdByAuthToken[_authToken.tokenType][_authToken.tokenId];

        // store this address of existing seller operator to check if you have to transfer the ownership later
        address oldSellerOperator = seller.operator;

        storeSeller(_seller, _authToken);

        // If operator changed, transfer the ownership of NFT voucher
        if (oldSellerOperator != _seller.operator) {
            IBosonVoucher(protocolLookups().cloneAddress[seller.id]).transferOwnership(_seller.operator);
        }

        // Notify watchers of state change
        emit SellerUpdated(_seller.id, _seller, _authToken, msgSender());
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
            require(protocolLookups().voucherCount[_buyer.id] == 0, WALLET_OWNS_VOUCHERS);
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
     * @notice Updates a dispute resolver, not including DisputeResolverFees, allowed seller list or active flag.
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
     * @notice Updates an agent. All fields should be filled, even those staying the same.
     *
     * Emits a AgentUpdated event if successful.
     *
     * Reverts if:
     * - Caller is not the wallet address associated with the agent account
     * - Wallet address is zero address
     * - Wallet address is not unique to this agent
     * - Agent does not exist
     * - Fee percentage is greater than 10000 (100%)
     *
     * @param _agent - the fully populated agent struct
     */
    function updateAgent(Agent memory _agent) external override {
        //Check for zero address
        require(_agent.wallet != address(0), INVALID_ADDRESS);

        bool exists;
        Agent storage agent;

        //Check Agent exists in agents mapping
        (exists, agent) = fetchAgent(_agent.id);

        //Agent must already exist
        require(exists, NO_SUCH_AGENT);

        //Check that msg.sender is the wallet address for this agent
        require(agent.wallet == msgSender(), NOT_AGENT_WALLET);

        // Make sure percentage is less than or equal to 10000
        require(_agent.feePercentage <= 10000, FEE_PERCENTAGE_INVALID);

        //check that the wallet address is unique to one agent Id if new
        require(
            protocolLookups().agentIdByWallet[_agent.wallet] == 0 ||
                protocolLookups().agentIdByWallet[_agent.wallet] == _agent.id,
            AGENT_ADDRESS_MUST_BE_UNIQUE
        );

        //Delete current mappings
        delete protocolLookups().agentIdByWallet[msgSender()];

        storeAgent(_agent);

        // Notify watchers of state change
        emit AgentUpdated(_agent.id, _agent, msgSender());
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
     * @notice Add seller ids to set of ids allowed to chose the given dispute resolver
     *
     * Emits a AllowedSellersAdded event if successful.
     *
     * Reverts if:
     * - Caller is not the admin address associated with the dispute resolver account
     * - Dispute resolver does not exist
     * - Number of seller ids in array exceeds max
     * - Number of seller ids in array is zero
     * - Some seller does not exist
     * - Seller id is already approved
     *
     * @param _disputeResolverId - Id of the dispute resolver
     * @param _sellerAllowList - List of seller ids to add to allowed list
     */
    function addSellersToAllowList(uint256 _disputeResolverId, uint256[] calldata _sellerAllowList) external override {
        // At least one seller id must be specified and the number of ids cannot exceed the maximum number of seller ids to avoid running into block gas limit in a loop
        require(
            _sellerAllowList.length > 0 && _sellerAllowList.length <= protocolLimits().maxAllowedSellers,
            INVALID_AMOUNT_ALLOWED_SELLERS
        );

        bool exists;
        DisputeResolver storage disputeResolver;

        //Check Dispute Resolver from disputeResolvers
        (exists, disputeResolver, ) = fetchDisputeResolver(_disputeResolverId);

        //Dispute Resolver  must already exist
        require(exists, NO_SUCH_DISPUTE_RESOLVER);

        //Check that msg.sender is the admin address for this dispute resolver
        require(disputeResolver.admin == msgSender(), NOT_ADMIN);

        storeSellerAllowList(_disputeResolverId, _sellerAllowList);

        emit AllowedSellersAdded(_disputeResolverId, _sellerAllowList, msgSender());
    }

    /**
     * @notice Remove seller ids from set of ids allowed to chose the given dispute resolver
     *
     * Emits a AllowedSellersRemoved event if successful.
     *
     * Reverts if:
     * - Caller is not the admin address associated with the dispute resolver account
     * - Dispute resolver does not exist
     * - Number of seller ids in array exceeds max
     * - Number of seller ids structs in array is zero
     * - Seller id is not approved
     *
     * @param _disputeResolverId - Id of the dispute resolver
     * @param _sellerAllowList - list of seller ids to remove from allowed list
     */
    function removeSellersFromAllowList(uint256 _disputeResolverId, uint256[] calldata _sellerAllowList)
        external
        override
    {
        // At least one seller id must be specified and the number of ids cannot exceed the maximum number of seller ids to avoid running into block gas limit in a loop
        require(
            _sellerAllowList.length > 0 && _sellerAllowList.length <= protocolLimits().maxAllowedSellers,
            INVALID_AMOUNT_ALLOWED_SELLERS
        );

        bool exists;
        DisputeResolver storage disputeResolver;

        //Check Dispute Resolver from disputeResolvers
        (exists, disputeResolver, ) = fetchDisputeResolver(_disputeResolverId);

        //Dispute Resolver  must already exist
        require(exists, NO_SUCH_DISPUTE_RESOLVER);

        //Check that msg.sender is the admin address for this dispute resolver
        require(disputeResolver.admin == msgSender(), NOT_ADMIN);

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

        emit AllowedSellersRemoved(_disputeResolverId, _sellerAllowList, msgSender());
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
     * @return authToken - optional AuthToken struct that specifies an AuthToken type and tokenId that the user can use to do admin functions
     */
    function getSeller(uint256 _sellerId) external view override returns (bool exists, Seller memory seller, AuthToken memory authToken) {
        return fetchSeller(_sellerId);
    }

    /**
     * @notice Gets the details about a seller using an address associated with that seller: operator, admin, or clerk address.
     *
     * @param _associatedAddress - the address associated with the seller. Must be an operator, admin, or clerk address.
     * @return exists - the seller was found
     * @return seller - the seller details. See {BosonTypes.Seller}
     * @return authToken - optional AuthToken struct that specifies an AuthToken type and tokenId that the user can use to do admin functions
     *                     See {BosonTypes.AuthToken}
     */
    function getSellerByAddress(address _associatedAddress)
        external
        view
        override
        returns (bool exists, Seller memory seller, AuthToken memory authToken)
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
     *         A seller will have either an admin address or an auth token
     *
     * @param _associatedAuthToken - the auth token that may be associated with the seller. 
     * @return exists - the seller was found
     * @return seller - the seller details. See {BosonTypes.Seller}
     * @return authToken - optional AuthToken struct that specifies an AuthToken type and tokenId that the user can use to do admin functions
     *                     See {BosonTypes.AuthToken}
     */
    function getSellerByAuthToken(AuthToken calldata _associatedAuthToken)
        external
        view
        returns (bool exists, Seller memory seller, AuthToken memory authToken)
    {
        uint256 sellerId;
        
       (exists, sellerId) = getSellerIdByAuthToken(_associatedAuthToken);
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
     * @return sellerAllowList - list of sellers that are allowed to chose this dispute resolver
     */
    function getDisputeResolver(uint256 _disputeResolverId)
        public
        view
        override
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
        override
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
     * @notice Gets the details about an agent.
     *
     * @param _agentId - the id of the agent to check
     * @return exists - the agent was found
     * @return agent - the agent details. See {BosonTypes.Agent}
     */
    function getAgent(uint256 _agentId) external view returns (bool exists, Agent memory agent) {
        return fetchAgent(_agentId);
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
     * @notice Returns the inforamtion if given sellers are allowed to chose the given dispute resolver
     *
     * @param _disputeResolverId - id of dispute resolver to check
     * @param _sellerIds - list of sellers ids to check
     * @return sellerAllowed - array with indicator (true/false) if seller is allowed to chose the dispute resolver. Index in this array corresponds to indices of the incoming _sellerIds
     */
    function areSellersAllowed(uint256 _disputeResolverId, uint256[] calldata _sellerIds)
        external
        view
        override
        returns (bool[] memory sellerAllowed)
    {
        sellerAllowed = new bool[](_sellerIds.length);
        ProtocolLib.ProtocolLookups storage pl = protocolLookups();

        (bool exists, , ) = fetchDisputeResolver(_disputeResolverId);

        // we populate sellerAllowed only if id really belongs to DR, otherwise return array filled with false
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

    /**
     * @notice Stores seller id to allowed list mapping in storage
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

        // loop over incoming seller ids and store them to the mapping
        for (uint256 i = 0; i < _sellerAllowList.length; i++) {
            uint256 sellerId = _sellerAllowList[i];
            //Check Seller exists in sellers mapping
            (bool exists, , ) = fetchSeller(sellerId);

            //Seller must already exist
            require(exists, NO_SUCH_SELLER);

            //Seller should not be approved already
            require(pl.allowedSellerIndex[_disputeResolverId][sellerId] == 0, SELLER_ALREADY_APPROVED);

            //Update the mappings
            pl.allowedSellers[_disputeResolverId].push(sellerId);
            pl.allowedSellerIndex[_disputeResolverId][sellerId] = pl.allowedSellers[_disputeResolverId].length; //Set index mapping. Should be index in allowedSellers array + 1
        }
    }
}
