// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;


import { IBosonAccountHandler } from "../../interfaces/handlers/IBosonAccountHandler.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { AccountBase } from "../bases/AccountBase.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";

contract AccountHandlerFacet is IBosonAccountHandler, AccountBase {

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
     * - Address values are zero address
     * - Addresses are not unique to this seller
     * - Seller is not active (if active == false)
     *
     * @param _seller - the fully populated struct with seller id set to 0x0
     */
    function createSeller(Seller memory _seller)
    external
    override
    {
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
     * @notice Updates a seller. All fiels should be filled, even those staying the same.
     *
     * Emits a SellerUpdated event if successful.
     *
     * Reverts if:
     * - Address values are zero address
     * - Addresses are not unique to this seller
     * - Caller is not the admin address of the seller
     * - Seller does not exist
     *
     * @param _seller - the fully populated struct with seller id set to 0x0
     */
    function updateSeller(Seller memory _seller)
    external
    override
    {
        bool exists;
        Seller storage seller;

        //Check Seller exists in sellers mapping
        (exists, seller) = fetchSeller(_seller.id);

        //Seller must already exist
        require(exists, NO_SUCH_SELLER);

        //Check that msg.sender is the admin address for this seller
        require(seller.admin  == msg.sender, NOT_ADMIN); 

        //Check that the addresses are unique to one seller Id -- not used or are used by this seller id. Checking this seller id is necessary because one or more addresses may not change
        require((protocolStorage().sellerIdByOperator[_seller.operator] == 0 || protocolStorage().sellerIdByOperator[_seller.operator] == _seller.id) && 
                (protocolStorage().sellerIdByAdmin[_seller.admin] == 0 || protocolStorage().sellerIdByAdmin[_seller.admin]  == _seller.id) && 
                (protocolStorage().sellerIdByClerk[_seller.clerk] == 0 || protocolStorage().sellerIdByClerk[_seller.clerk]  == _seller.id),  
                SELLER_ADDRESS_MUST_BE_UNIQUE);

   
        //Delete current mappings
        delete protocolStorage().sellerIdByOperator[_seller.operator];
        delete protocolStorage().sellerIdByAdmin[_seller.admin];
        delete protocolStorage().sellerIdByClerk[_seller.clerk];
   

        storeSeller(_seller);

        // Notify watchers of state change
        emit SellerUpdated(_seller.id, _seller);
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