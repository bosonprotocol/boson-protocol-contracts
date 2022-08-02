// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import "../../domain/BosonConstants.sol";
import { BuyerBase } from "../bases/BuyerBase.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";

contract BuyerHandlerFacet is BuyerBase {
    /**
     * @notice Facet Initializer
     */
    function initialize() public {
        // No-op initializer.
        // - needed by the deployment script, which expects a no-args initializer on facets other than the config handler
        // - exception here because IBosonAccountHandler is contributed to by multiple facets which do not have their own individual interfaces
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
    function createBuyer(Buyer memory _buyer) external {
        createBuyerInternal(_buyer);
    }

    /**
     * @notice Updates a buyer. All fields should be filled, even those staying the same. The wallet address cannot be updated if the current wallet address has oustanding vouchers
     *
     * Emits a BuyerUpdated event if successful.
     *
     * Reverts if:
     * - Caller is not the wallet address associated with the buyer account
     * - Wallet address is zero address
     * - Address is not unique to this buyer
     * - Buyer does not exist
     * - Current wallet address has oustanding vouchers
     *
     * @param _buyer - the fully populated buyer struct
     */
    function updateBuyer(Buyer memory _buyer) external {
        //Check for zero address
        require(_buyer.wallet != address(0), INVALID_ADDRESS);

        bool exists;
        Buyer storage buyer;

        //Check Buyer exists in buyers mapping
        (exists, buyer) = fetchBuyer(_buyer.id);

        //Buyer must already exist
        require(exists, NO_SUCH_BUYER);

        //Check that msg.sender is the wallet address for this buyer
        require(buyer.wallet == msgSender(), NOT_BUYER_WALLET);

        //Check that current wallet address does not own any vouchers, if changing wallet address
        if (buyer.wallet != _buyer.wallet) {
            require(protocolLookups().voucherCount[_buyer.id] == 0, WALLET_OWNS_VOUCHERS);
        }

        //check that the wallet address is unique to one buyer Id if new
        require(
            protocolLookups().buyerIdByWallet[_buyer.wallet] == 0 ||
                protocolLookups().buyerIdByWallet[_buyer.wallet] == _buyer.id,
            BUYER_ADDRESS_MUST_BE_UNIQUE
        );

        //Delete current mappings
        delete protocolLookups().buyerIdByWallet[msgSender()];

        storeBuyer(_buyer);

        // Notify watchers of state change
        emit BuyerUpdated(_buyer.id, _buyer, msgSender());
    }

    /**
     * @notice Gets the details about a buyer.
     *
     * @param _buyerId - the id of the buyer to check
     * @return exists - the buyer was found
     * @return buyer - the buyer details. See {BosonTypes.Buyer}
     */
    function getBuyer(uint256 _buyerId) external view returns (bool exists, Buyer memory buyer) {
        return fetchBuyer(_buyerId);
    }
}
