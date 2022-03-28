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
     * - Seller is not active (active == false)
     *
     * @param _seller - the fully populated struct with seller id set to 0x0
     */
    function createSeller(Seller memory _seller)
    external
    override
    {
        //Check active is not set to false
        require(_seller.active, SELLER_MUBT_BE_ACTIVE);

        // Get the next account Id and increment the counter
        uint256 sellerId = protocolCounters().nextAccountId++;

        _seller.id = sellerId;
        storeSeller(_seller);

        //Map the seller's addresses to the sellerId. It's not necessary to map the treasury address, as it only receives funds
        protocolStorage().sellerByOperator[_seller.operator] = sellerId;
        protocolStorage().sellerByAdmin[_seller.admin] = sellerId;
        protocolStorage().sellerByClerk[_seller.clerk] = sellerId;

        // Notify watchers of state change
        emit SellerCreated(_seller.id, _seller);
    }
  
    /**
     * @notice Validates seller struct and stores it to storage
     *
     * Reverts if:
     * - Addresses are the zero address
     *
     * @param _seller - the fully populated struct with seller id set
     */
   
    function storeSeller(Seller memory _seller) internal 
    {
        //Check for zero address
        require(_seller.admin != address(0) &&  _seller.operator != address(0) && _seller.clerk != address(0) && _seller.treasury != address(0), INVALID_ADDRESS);

        //check that the addresses are unique to one seller Id
        require(protocolStorage().sellerByOperator[_seller.operator] == 0 && protocolStorage().sellerByAdmin[_seller.admin] == 0 && protocolStorage().sellerByClerk[_seller.clerk] == 0,  SELLER_ADDRESS_MUST_BE_UNIQUE);

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
     * @notice Gets the details about a seller.
     *
     * @param _sellerId - the id of the seller to check
     * @return exists - the seller was found
     * @return seller - the seller details. See {BosonTypes.Seller}
     */
    function getSeller(uint256 _sellerId)
    external
    view
    returns(bool exists, Seller memory seller) 
    {
        return fetchSeller(_sellerId);
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

}