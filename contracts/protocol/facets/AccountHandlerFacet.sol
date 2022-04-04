// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;


import { IBosonAccountHandler } from "../../interfaces/IBosonAccountHandler.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { ProtocolBase } from "../ProtocolBase.sol";
import { ProtocolLib } from "../ProtocolLib.sol";

contract AccountHandlerFacet is IBosonAccountHandler, ProtocolBase {

    /**
     * @notice Facet Initializer
     */
    function initialize()
    public
    onlyUnInitialized(type(IBosonAccountHandler).interfaceId)
    {
        DiamondLib.addSupportedInterface(type(IBosonAccountHandler).interfaceId);
    }

    /**
     * @notice Creates a seller
     *
     * Emits a SellerCreated event if successful.
     *
     * Reverts if:
     * - Seller is not active (if active == false)
     *
     * @param _seller - the fully populated struct with seller id set to 0x0
     */
    function createSeller(Seller memory _seller)
    external
    override
    {
        //Check active is not set to false
        require(_seller.active, MUST_BE_ACTIVE);

        // Get the next account Id and increment the counter
        uint256 sellerId = protocolCounters().nextAccountId++;

        _seller.id = sellerId;
        storeSeller(_seller);

        //Map the seller's addresses to the sellerId. It's not necessary to map the treasury address, as it only receives funds
        protocolStorage().sellerIdByOperator[_seller.operator] = sellerId;
        protocolStorage().sellerIdByAdmin[_seller.admin] = sellerId;
        protocolStorage().sellerIdByClerk[_seller.clerk] = sellerId;

        // Notify watchers of state change
        emit SellerCreated(_seller.id, _seller);
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
    function createBuyer(Buyer memory _buyer) 
    external
    override
    {
        //Check active is not set to false
        require(_buyer.active, MUST_BE_ACTIVE);

        // Get the next account Id and increment the counter
        uint256 buyerId = protocolCounters().nextAccountId++;

        _buyer.id = buyerId;
        storeBuyer(_buyer);

        //Map the buyer's wallet address to the buyerId.
        protocolStorage().buyerIdByWallet[_buyer.wallet] = buyerId;

        //Notify watchers of state change
        emit BuyerCreated(_buyer.id, _buyer);

    }
  
    /**
     * @notice Gets the details about a seller.
     *
     * @param _sellerId - the id of the seller to check
     * @return exists - the seller was found
     * @return seller - the seller details. See {BosonTypes.Seller}
     */
    function getSeller(uint256 _sellerId)
    external
    override
    view
    returns(bool exists, Seller memory seller) 
    {
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
    override
    view 
    returns (bool exists, Seller memory seller)
    {
        uint sellerId;

        (exists, sellerId) = getSellerIdByOperator(_associatedAddress);
        if(exists) {
            return fetchSeller(sellerId);
        } 

        (exists, sellerId) = getSellerIdByAdmin(_associatedAddress);
        if(exists) {
            return fetchSeller(sellerId);
        } 

        (exists, sellerId) = getSellerIdByClerk(_associatedAddress);
        if(exists) {
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
    function getBuyer(uint256 _buyerId)
    external
    override
    view 
    returns (bool exists, Buyer memory buyer)
    {
        return fetchBuyer(_buyerId);
    }

    /**
     * @notice Gets the next account Id that can be assigned to an account.
     *
     * @return nextAccountId - the account Id
     */
    function getNextAccountId()
    external
    override
    view 
    returns(uint256 nextAccountId) {
        nextAccountId = protocolCounters().nextAccountId;
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
   
    function storeSeller(Seller memory _seller) internal 
    {
        //Check for zero address
        require(_seller.admin != address(0) &&  
                _seller.operator != address(0) && 
                _seller.clerk != address(0) && 
                _seller.treasury != address(0), 
                INVALID_ADDRESS);

        //check that the addresses are unique to one seller Id
        require(protocolStorage().sellerIdByOperator[_seller.operator] == 0 && 
                protocolStorage().sellerIdByAdmin[_seller.admin] == 0 && 
                protocolStorage().sellerIdByClerk[_seller.clerk] == 0,  
                SELLER_ADDRESS_MUST_BE_UNIQUE);

        // Get storage location for seller
        (,Seller storage seller) = fetchSeller(_seller.id);

        // Set seller props individually since memory structs can't be copied to storage
        seller.id = _seller.id;
        seller.operator = _seller.operator;
        seller.admin = _seller.admin;
        seller.clerk = _seller.clerk;
        seller.treasury = _seller.treasury;
        seller.active = _seller.active;
       
    }

    /**
     * @notice Validates buyer struct and stores it to storage
     *
     * Reverts if:
     * - Wallet address is zero address
     * - Wallet address is not unique to this buyer
     *
     * @param _buyer - the fully populated struct with seller id set
     */
   
    function storeBuyer(Buyer memory _buyer) internal 
    {
        //Check for zero address
        require(_buyer.wallet != address(0), INVALID_ADDRESS);

        //check that the wallet address is unique to one buyer Id
        require(protocolStorage().buyerIdByWallet[_buyer.wallet] == 0,BUYER_ADDRESS_MUST_BE_UNIQUE);

        // Get storage location for buyer
        (,Buyer storage buyer) = fetchBuyer(_buyer.id);

        // Set buyer props individually since memory structs can't be copied to storage
        buyer.id = _buyer.id;
        buyer.wallet = _buyer.wallet;
        buyer.active = _buyer.active;
    }

   

}