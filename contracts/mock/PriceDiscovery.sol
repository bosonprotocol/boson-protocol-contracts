// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts (last updated v4.8.0) (metatx/MockForwarder.sol)
pragma solidity ^0.8.9;

import "../interfaces/IERC20.sol";
import "../interfaces/IERC721.sol";

/**
 * @dev Simple price discovery contract used in tests
 *
 * This contract simluates external price discovery mechanism.
 * When user commits to an offer, protocol talks to this contract to validate the exchange.
 */
contract PriceDiscovery {
    struct Order {
        address seller;
        address buyer;
        address voucherContract; // sold by seller
        uint256 tokenId; // is exchange id
        address exchangeToken;
        uint256 price;
    }

    /**
     * @dev simple fulfillOrder that does not perform any checks
     * It just transfers the voucher and exchange token to the buyer
     * If any of the transfers fail, the whole transaction will revert
     */
    function fulfilOrder(Order calldata _order) external {
        // transfer voucher
        try IERC721(_order.voucherContract).transferFrom(_order.seller, _order.buyer, _order.tokenId) {} catch (
            bytes memory reason
        ) {
            if (reason.length == 0) {
                revert("Voucher transfer failed");
            } else {
                /// @solidity memory-safe-assembly
                assembly {
                    revert(add(32, reason), mload(reason))
                }
            }
        }

        // transfer exchange token
        try IERC20(_order.exchangeToken).transferFrom(_order.buyer, _order.seller, _order.price) {} catch (
            bytes memory reason
        ) {
            if (reason.length == 0) {
                revert("Voucher transfer failed");
            } else {
                /// @solidity memory-safe-assembly
                assembly {
                    revert(add(32, reason), mload(reason))
                }
            }
        }
    }
}
