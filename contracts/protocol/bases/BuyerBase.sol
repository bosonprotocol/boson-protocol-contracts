// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "./../../domain/BosonConstants.sol";
import { IBosonAccountEvents } from "../../interfaces/events/IBosonAccountEvents.sol";
import { ProtocolBase } from "./ProtocolBase.sol";
import { ProtocolLib } from "./../libs/ProtocolLib.sol";

/**
 * @title BuyerBase
 *
 * @notice Provides methods for buyer creation that can be shared accross facets
 */
contract BuyerBase is ProtocolBase, IBosonAccountEvents {
    /**
     * @notice Creates a Buyer.
     *
     * Emits a BuyerCreated event if successful.
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

        // Get the next accouni id and increment the counter
        uint256 buyerId = protocolCounters().nextAccountId++;

        //check that the wallet address is unique to one buyer id
        require(protocolLookups().buyerIdByWallet[_buyer.wallet] == 0, BUYER_ADDRESS_MUST_BE_UNIQUE);

        _buyer.id = buyerId;
        storeBuyer(_buyer);

        //Notify watchers of state change
        emit BuyerCreated(_buyer.id, _buyer, msgSender());
    }

    /**
     * @notice Stores buyer struct in storage.
     *
     * @param _buyer - the fully populated struct with buyer id set
     */
    function storeBuyer(Buyer memory _buyer) internal {
        // Get storage location for buyer
        (, Buyer storage buyer) = fetchBuyer(_buyer.id);

        // Set buyer props individually since memory structs can't be copied to storage
        buyer.id = _buyer.id;
        buyer.wallet = _buyer.wallet;
        buyer.active = _buyer.active;

        //Map the buyer's wallet address to the buyerId.
        protocolLookups().buyerIdByWallet[_buyer.wallet] = _buyer.id;
    }
}
