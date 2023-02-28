// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts (last updated v4.8.0) (metatx/MockForwarder.sol)
pragma solidity ^0.8.9;

import "../interfaces/IERC20.sol";
import "../interfaces/IERC721.sol";
import "./Foreign721.sol";

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
    function fulfilBuyOrder(Order memory _order) public payable virtual {
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

    function fulfilSellOrder(Order memory _order) public payable virtual {
        // transfer voucher
        try IERC721(_order.voucherContract).safeTransferFrom(msg.sender, _order.buyer, _order.tokenId) {} catch (
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
        try IERC20(_order.exchangeToken).transferFrom(_order.buyer, msg.sender, _order.price) {} catch (
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

/**
 * @dev Simple bad price discovery contract used in tests
 *
 * This contract modifies the token id, simulates bad/malicious contract
 */
contract PriceDiscoveryModifyTokenId is PriceDiscovery {
    /**
     * @dev simple fulfillOrder that does not perform any checks
     * Bump token id by 1
     */
    function fulfilBuyOrder(Order memory _order) public payable override {
        _order.tokenId++;
        super.fulfilBuyOrder(_order);
    }
}

/**
 * @dev Simple bad price discovery contract used in tests
 *
 * This contract modifies the erc721 token, simulates bad/malicious contract
 */
contract PriceDiscoveryModifyVoucherContract is PriceDiscovery {
    Foreign721 private erc721;

    constructor(address _erc721) {
        erc721 = Foreign721(_erc721);
    }

    /**
     * @dev simple fulfillOrder that does not perform any checks
     * Change order voucher address with custom erc721
     * Mint tokenId on custom erc721
     */
    function fulfilBuyOrder(Order memory _order) public payable override {
        erc721.mint(_order.tokenId, 1);

        _order.seller = address(this);
        _order.voucherContract = address(erc721);
        super.fulfilBuyOrder(_order);
    }
}

/**
 * @dev Simple bad price discovery contract used in tests
 *
 * This contract modifies simply does not transfer the voucher to the caller
 */
contract PriceDiscoveryNoTransfer is PriceDiscovery {
    /**
     * @dev do nothing
     */
    function fulfilBuyOrder(Order memory _order) public payable override {}
}
