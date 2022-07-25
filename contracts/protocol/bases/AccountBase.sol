// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { IBosonAccountEvents } from "../../interfaces/events/IBosonAccountEvents.sol";
import { ProtocolBase } from "./../bases/ProtocolBase.sol";
import { ProtocolLib } from "./../libs/ProtocolLib.sol";

/**
 * @title AccountBase
 *
 * @dev Provides methods for seller creation that can be shared accross facets
 */
contract AccountBase is ProtocolBase, IBosonAccountEvents {
    enum StoreType {
        CREATE,
        UPDATE
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
     * @param _contractURI - contract metadata URI
     */
    function createSellerInternal(Seller memory _seller, string calldata _contractURI) internal {
        //Check active is not set to false
        require(_seller.active, MUST_BE_ACTIVE);

        // Get the next account Id and increment the counter
        uint256 sellerId = protocolCounters().nextAccountId++;

        //check that the addresses are unique to one seller Id, accross all roles
        require(
            protocolLookups().sellerIdByOperator[_seller.operator] == 0 &&
                protocolLookups().sellerIdByOperator[_seller.admin] == 0 &&
                protocolLookups().sellerIdByOperator[_seller.clerk] == 0 &&
                protocolLookups().sellerIdByAdmin[_seller.admin] == 0 &&
                protocolLookups().sellerIdByAdmin[_seller.operator] == 0 &&
                protocolLookups().sellerIdByAdmin[_seller.clerk] == 0 &&
                protocolLookups().sellerIdByClerk[_seller.clerk] == 0 &&
                protocolLookups().sellerIdByClerk[_seller.operator] == 0 &&
                protocolLookups().sellerIdByClerk[_seller.admin] == 0,
            SELLER_ADDRESS_MUST_BE_UNIQUE
        );

        _seller.id = sellerId;
        storeSeller(_seller);

        // create clone and store its address cloneAddress
        address voucherCloneAddress = cloneBosonVoucher(sellerId, _seller.operator, _contractURI);
        protocolLookups().cloneAddress[sellerId] = voucherCloneAddress;

        // Notify watchers of state change
        emit SellerCreated(sellerId, _seller, voucherCloneAddress, msgSender());
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
    function createBuyerInternal(Buyer memory _buyer) internal {
        //Check for zero address
        require(_buyer.wallet != address(0), INVALID_ADDRESS);

        //Check active is not set to false
        require(_buyer.active, MUST_BE_ACTIVE);

        // Get the next account Id and increment the counter
        uint256 buyerId = protocolCounters().nextAccountId++;

        //check that the wallet address is unique to one buyer Id
        require(protocolLookups().buyerIdByWallet[_buyer.wallet] == 0, BUYER_ADDRESS_MUST_BE_UNIQUE);

        _buyer.id = buyerId;
        storeBuyer(_buyer, StoreType.CREATE);

        //Notify watchers of state change
        emit BuyerCreated(_buyer.id, _buyer, msgSender());
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
    function createAgentInternal(Agent memory _agent) internal {
        //Check for zero address
        require(_agent.wallet != address(0), INVALID_ADDRESS);

        //Check active is not set to false
        require(_agent.active, MUST_BE_ACTIVE);

        // Make sure percentage is less than or equal to 10000
        require(_agent.feePercentage <= 10000, FEE_PERCENTAGE_INVALID);

        // Get the next account Id and increment the counter
        uint256 agentId = protocolCounters().nextAccountId++;

        //check that the wallet address is unique to one agent Id
        require(protocolLookups().agentIdByWallet[_agent.wallet] == 0, AGENT_ADDRESS_MUST_BE_UNIQUE);

        _agent.id = agentId;
        storeAgent(_agent);

        //Notify watchers of state change
        emit AgentCreated(_agent.id, _agent, msgSender());
    }

    /**
     * @notice Stores buyer struct in storage
     *
     * @param _buyer - the fully populated struct with buyer id set
     * @param _type - this is either create or update type from the StoreType enum.
     */
    function storeBuyer(Buyer memory _buyer, StoreType _type) internal {
        // Get storage location for buyer
        (, Buyer storage buyer) = fetchBuyer(_buyer.id);

        // Set buyer props individually since memory structs can't be copied to storage
        buyer.id = _buyer.id;
        buyer.wallet = _buyer.wallet;
        buyer.active = (_type == StoreType.CREATE ? _buyer.active : buyer.active);

        //Map the buyer's wallet address to the buyerId.
        protocolLookups().buyerIdByWallet[_buyer.wallet] = _buyer.id;
    }

    /**
     * @notice Validates seller struct and stores it to storage
     *
     * Reverts if:
     * - Address values are zero address
     * - Addresses are not unique to this seller
     *
     * @param _seller - the fully populated struct with seller id set
     */

    function storeSeller(Seller memory _seller) internal {
        //Check for zero address
        require(
            _seller.admin != address(0) &&
                _seller.operator != address(0) &&
                _seller.clerk != address(0) &&
                _seller.treasury != address(0),
            INVALID_ADDRESS
        );

        // Get storage location for seller
        (, Seller storage seller) = fetchSeller(_seller.id);

        // Set seller props individually since memory structs can't be copied to storage
        seller.id = _seller.id;
        seller.operator = _seller.operator;
        seller.admin = _seller.admin;
        seller.clerk = _seller.clerk;
        seller.treasury = _seller.treasury;
        seller.active = _seller.active;

        //Map the seller's addresses to the seller Id. It's not necessary to map the treasury address, as it only receives funds
        protocolLookups().sellerIdByOperator[_seller.operator] = _seller.id;
        protocolLookups().sellerIdByAdmin[_seller.admin] = _seller.id;
        protocolLookups().sellerIdByClerk[_seller.clerk] = _seller.id;
    }

    /**
     * @notice Stores agent struct in storage
     *
     * @param _agent - the fully populated struct with agent id set
     */
    function storeAgent(Agent memory _agent) internal {
        // Get storage location for agent
        (, Agent storage agent) = fetchAgent(_agent.id);

        // Set agent props individually since memory structs can't be copied to storage
        agent.id = _agent.id;
        agent.wallet = _agent.wallet;
        agent.active = _agent.active;
        agent.feePercentage = _agent.feePercentage;

        //Map the agent's wallet address to the agentId.
        protocolLookups().agentIdByWallet[_agent.wallet] = _agent.id;
    }

    /**
     * @notice Creates a minimal clone of the Boson Voucher Contract
     *
     * @param _operator - address of the operator
     * @return cloneAddress - the address of newly created clone
     */
    function cloneBosonVoucher(
        uint256 _sellerId,
        address _operator,
        string calldata _contractURI
    ) internal returns (address cloneAddress) {
        // Pointer to stored addresses
        ProtocolLib.ProtocolAddresses storage pa = protocolAddresses();

        // Load beacon proxy contract address
        bytes20 targetBytes = bytes20(pa.beaconProxyAddress);

        // create a minimal clone
        assembly {
            let clone := mload(0x40)
            mstore(clone, 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000000000000000000000)
            mstore(add(clone, 0x14), targetBytes)
            mstore(add(clone, 0x28), 0x5af43d82803e903d91602b57fd5bf30000000000000000000000000000000000)
            cloneAddress := create(0, clone, 0x37)
        }

        // Initialize the clone
        IInitializableClone(cloneAddress).initialize(pa.voucherBeaconAddress);
        IInitializableClone(cloneAddress).initializeVoucher(_sellerId, _operator, _contractURI);
    }
}

interface IInitializableClone {
    function initialize(address _beaconAddress) external;

    function initializeVoucher(
        uint256 _sellerId,
        address _newOwner,
        string calldata _newContractURI
    ) external;
}
