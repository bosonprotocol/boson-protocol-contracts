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

    /**
     * @notice Creates a seller
     *
     * Reverts if:
     * - Address values are zero address
     * - Addresses are not unique to this seller
     * - Seller is not active (if active == false)
     *
     * @param _seller - the fully populated struct with seller id set to 0x0
     * @return sellerId id of newly created seller
     */
    function createSellerInternal(Seller memory _seller) internal returns (uint256 sellerId) {
        //Check active is not set to false
        require(_seller.active, MUST_BE_ACTIVE);

        // Get the next account Id and increment the counter
        sellerId = protocolCounters().nextAccountId++;

        //check that the addresses are unique to one seller Id
        require(protocolStorage().sellerIdByOperator[_seller.operator] == 0 && 
                protocolStorage().sellerIdByAdmin[_seller.admin] == 0 && 
                protocolStorage().sellerIdByClerk[_seller.clerk] == 0,  
                SELLER_ADDRESS_MUST_BE_UNIQUE);

        _seller.id = sellerId;
        storeSeller(_seller);

        // Notify watchers of state change
        emit SellerCreated(sellerId, _seller);

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

        // Get storage location for seller
        (,Seller storage seller) = fetchSeller(_seller.id);

        // Set seller props individually since memory structs can't be copied to storage
        seller.id = _seller.id;
        seller.operator = _seller.operator;
        seller.admin = _seller.admin;
        seller.clerk = _seller.clerk;
        seller.treasury = _seller.treasury;
        seller.active = _seller.active;

        //Map the seller's addresses to the seller Id. It's not necessary to map the treasury address, as it only receives funds
        protocolStorage().sellerIdByOperator[_seller.operator] = _seller.id;
        protocolStorage().sellerIdByAdmin[_seller.admin] = _seller.id;
        protocolStorage().sellerIdByClerk[_seller.clerk] = _seller.id;
       
    }
}
