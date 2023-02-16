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
    function fulfilOrder(Order calldata _order) external payable {
        // transfer voucher
        try IERC721(_order.voucherContract).safeTransferFrom(_order.seller, msg.sender, _order.tokenId) {} catch (
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
        if (_order.exchangeToken == address(0)) {
            (bool success, ) = payable(_order.seller).call{ value: _order.price }("");
            require(success, "Token transfer failed");

            // return any extra ETH to the buyer
            if (msg.value > _order.price) {
                (success, ) = payable(msg.sender).call{ value: msg.value - _order.price }("");
                require(success, "ETH return failed");
            }
        } else
            try IERC20(_order.exchangeToken).transferFrom(msg.sender, _order.seller, _order.price) {} catch (
                bytes memory reason
            ) {
                if (reason.length == 0) {
                    revert("Token transfer failed");
                } else {
                    /// @solidity memory-safe-assembly
                    assembly {
                        revert(add(32, reason), mload(reason))
                    }
                }
            }
    }
}
