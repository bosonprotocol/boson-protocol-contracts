// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.9;

import "../../domain/BosonConstants.sol";
import { BuyerBase } from "../bases/BuyerBase.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";

/**
 * @title BuyerHandlerFacet
 *
 * @notice Handles buyer account management requests and queries.
 */
contract BuyerHandlerFacet is BuyerBase {
    /**
     * @notice Initializes facet.
     */
    function initialize() public {
        // No-op initializer.
        // - needed by the deployment script, which expects a no-args initializer on facets other than the config handler
        // - exception here because IBosonAccountHandler is contributed to by multiple facets which do not have their own individual interfaces
    }

    /**
     * @notice Creates a buyer.
     *
     * Emits a BuyerCreated event if successful.
     *
     * Reverts if:
     * - The buyers region of protocol is paused
     * - Wallet address is zero address
     * - Active is not true
     * - Wallet address is not unique to this buyer
     *
     * @param _buyer - the fully populated struct with buyer id set to 0x0
     */
    function createBuyer(Buyer memory _buyer) external buyersNotPaused nonReentrant {
        createBuyerInternal(_buyer);
    }

    /**
     * @notice Updates a buyer, with the exception of the active flag.
     *         All other fields should be filled, even those staying the same.
     * @dev    Active flag passed in by caller will be ignored. The value from storage will be used.
     *
     * Emits a BuyerUpdated event if successful.
     *
     * Reverts if:
     * - The buyers region of protocol is paused
     * - Caller is not the wallet address associated with the buyer account
     * - Wallet address is zero address
     * - Address is not unique to this buyer
     * - Buyer does not exist
     * - Current wallet address has outstanding vouchers
     *
     * @param _buyer - the fully populated buyer struct
     */
    function updateBuyer(Buyer memory _buyer) external buyersNotPaused nonReentrant {
        // Cache protocol lookups for reference
        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();

        // Check for zero address
        require(_buyer.wallet != address(0), INVALID_ADDRESS);

        bool exists;
        Buyer storage buyer;

        // Check Buyer exists in buyers mapping
        (exists, buyer) = fetchBuyer(_buyer.id);

        // Buyer must already exist
        require(exists, NO_SUCH_BUYER);

        // Get message sender
        address sender = msgSender();

        // Check that msg.sender is the wallet address for this buyer
        require(buyer.wallet == sender, NOT_BUYER_WALLET);

        // Check that current wallet address does not own any vouchers, if changing wallet address
        if (buyer.wallet != _buyer.wallet) {
            require(lookups.voucherCount[_buyer.id] == 0, WALLET_OWNS_VOUCHERS);
        }

        // Check that the wallet address is unique to one buyer id if new
        mapping(address => uint256) storage buyerIds = lookups.buyerIdByWallet;
        uint256 check1 = buyerIds[_buyer.wallet];
        require(check1 == 0 || check1 == _buyer.id, BUYER_ADDRESS_MUST_BE_UNIQUE);

        // Delete current mappings
        delete buyerIds[sender];

        // Ignore active flag passed in by caller and set to value in storage.
        _buyer.active = buyer.active;
        storeBuyer(_buyer);

        // Notify watchers of state change
        emit BuyerUpdated(_buyer.id, _buyer, sender);
    }

    /**
     * @notice Gets the details about a buyer.
     *
     * @param _buyerId - the id of the buyer to check
     * @return exists - whether the buyer was found
     * @return buyer - the buyer details. See {BosonTypes.Buyer}
     */
    function getBuyer(uint256 _buyerId) external view returns (bool exists, Buyer memory buyer) {
        return fetchBuyer(_buyerId);
    }
}
