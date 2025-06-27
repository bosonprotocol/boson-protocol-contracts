// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import "./../../domain/BosonConstants.sol";
import { IBosonAccountEvents } from "../../interfaces/events/IBosonAccountEvents.sol";
import { ProtocolBase } from "./ProtocolBase.sol";

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
        if (_buyer.wallet == address(0)) revert InvalidAddress();

        // Get the next account id and increment the counter
        uint256 buyerId = protocolCounters().nextAccountId++;

        _buyer.id = buyerId;
        storeBuyer(_buyer);

        //Notify watchers of state change
        emit BuyerCreated(_buyer.id, _buyer, _msgSender());
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

        if (exists) {
            // Fetch the existing buyer account
            (, Buyer storage buyer) = fetchBuyer(buyerId);

            // Make sure buyer account is active
            if (!buyer.active) revert MustBeActive();
        } else {
            // Create the buyer account
            Buyer memory newBuyer;
            newBuyer.wallet = _buyer;
            newBuyer.active = true;

            createBuyerInternal(newBuyer);
            buyerId = newBuyer.id;
        }
    }
}
