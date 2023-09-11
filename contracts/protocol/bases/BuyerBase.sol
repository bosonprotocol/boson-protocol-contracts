// SPDX-License-Identifier: MIT
pragma solidity 0.8.21;

import "./../../domain/BosonConstants.sol";
import { IBosonAccountEvents } from "../../interfaces/events/IBosonAccountEvents.sol";
import { ProtocolBase } from "./ProtocolBase.sol";
import { ProtocolLib } from "./../libs/ProtocolLib.sol";

/**
 * @title BuyerBase
 *
 * @notice Provides methods for buyer creation that can be shared across facets.
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

        // Get the next account id and increment the counter
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

    /**
     * @notice Checks if buyer exists for buyer address. If not, account is created for buyer address.
     *
     * Reverts if buyer exists but is inactive.
     *
     * @param _buyer - the buyer address to check
     * @return buyerId - the buyer id
     */
    function getValidBuyer(address payable _buyer) internal returns (uint256 buyerId) {
        // Find or create the account associated with the specified buyer address
        bool exists;
        (exists, buyerId) = getBuyerIdByWallet(_buyer);

        if (!exists) {
            // Create the buyer account
            Buyer memory newBuyer;
            newBuyer.wallet = _buyer;
            newBuyer.active = true;

            createBuyerInternal(newBuyer);
            buyerId = newBuyer.id;
        } else {
            // Fetch the existing buyer account
            (, Buyer storage buyer) = fetchBuyer(buyerId);

            // Make sure buyer account is active
            require(buyer.active, MUST_BE_ACTIVE);
        }
    }
}
