// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import { IBosonOrchestrationHandler } from "../../interfaces/IBosonOrchestrationHandler.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { AccountBase } from "../bases/AccountBase.sol";
import { OfferBase } from "../bases/OfferBase.sol";

/**
 * @title OrchestrationHandlerFacet
 *
 * @notice Combines creation of multiple entities (accounts, offers, groups, twins, bundles) in a single transaction
 */
contract OrchestrationHandlerFacet is AccountBase, OfferBase, IBosonOrchestrationHandler {

    /**
     * @notice Facet Initializer
     */
    function initialize()
    public
    onlyUnInitialized(type(IBosonOrchestrationHandler).interfaceId)
    {
        DiamondLib.addSupportedInterface(type(IBosonOrchestrationHandler).interfaceId);
    }

    /**
     * @notice Creates a seller and an offer in a single transaction.
     *
     * Emits a SellerCreated and an OfferCreated event if successful.
     *
     * Reverts if:
     * - caller is not the same as operator address
     * - in seller struct:
     *   - Address values are zero address
     *   - Addresses are not unique to this seller
     *   - Seller is not active (if active == false)
     * - in offer struc
     *   - Valid from date is greater than valid until date
     *   - Valid until date is not in the future
     *   - Buyer cancel penalty is greater than price
     *   - Voided is set to true
     *
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     */
    function createSellerAndOffer(
        Seller memory _seller,
        Offer memory _offer
    )
    external
    
    {   
        // Caller should be the operator, specified in seller
        require(_seller.operator == msg.sender, NOT_OPERATOR);

        // create seller and update structs values to represent true state
        uint256 sellerId = createSellerInternal(_seller);
        _seller.id = sellerId;
        
        // create offer and update structs values to represent true state
        (uint256 offerId, ) = createOfferInternal(_offer);
        _offer.id = offerId;
        _offer.sellerId = sellerId;

        // Notify watchers of state change
        emit SellerCreated(sellerId, _seller);
        emit OfferCreated(offerId, sellerId, _offer);
    }  
}