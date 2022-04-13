// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import { IBosonOrchestrationHandler } from "../../interfaces/IBosonOrchestrationHandler.sol";
import { IBosonAccountHandler } from "../../interfaces/IBosonAccountHandler.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { OfferBase } from "../OfferBase.sol";

/**
 * @title OrchestrationHandlerFacet
 *
 * @notice Combines creation of multiple entities (accounts, offers, groups, twins, bundles) in a single transaction
 */
contract OrchestrationHandlerFacet is OfferBase, IBosonOrchestrationHandler {

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
     * - seller does not exist
     * - Valid from date is greater than valid until date
     * - Valid until date is not in the future
     * - Buyer cancel penalty is greater than price
     * - Voided is set to true
     *
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     */
    function createSellerAndOffer(
        Seller calldata _seller,
        Offer memory _offer
    )
    external
    
    {   
        IBosonAccountHandler(address(this)).createSeller(_seller);    
        
        // create offer and update structs values to represent true state
        (uint256 offerId, uint256 sellerId) = createOfferInternal(_offer);
        _offer.id = offerId;
        _offer.sellerId = sellerId;

        emit OfferCreated(offerId, sellerId, _offer);
    }  
}