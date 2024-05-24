// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts (last updated v4.8.0) (metatx/MockForwarder.sol)
pragma solidity 0.8.22;

import "../interfaces/IERC20.sol";
import "../interfaces/IERC721.sol";
import "./Foreign721.sol";
import { IERC721Receiver } from "../interfaces/IERC721Receiver.sol";

/**
 * @dev Simple price discovery contract used in tests
 *
 * This contract simulates external price discovery mechanism.
 * When user commits to an offer, protocol talks to this contract to validate the exchange.
 */
contract PriceDiscoveryMock {
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
     * It just transfers the voucher from the seller to the caller (buyer) and exchange token from the caller to the seller
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

        // return half of the sent value back to the caller
        payable(msg.sender).transfer(msg.value / 2);
    }

    event MockFulfilCalled();

    function mockFulfil(uint256 _percentReturn) public payable virtual {
        if (orderType == OrderType.Ask) {
            // received value must be equal to the price (or greater for ETH)
            if (order.exchangeToken == address(0)) {
                require(msg.value >= order.price, "ETH value mismatch");
                if (_percentReturn > 0) {
                    payable(msg.sender).transfer((msg.value * _percentReturn) / 100);
                }
            } else {
                IERC20(order.exchangeToken).transferFrom(msg.sender, address(this), order.price);
                if (_percentReturn > 0) {
                    IERC20(order.exchangeToken).transfer(msg.sender, (order.price * _percentReturn) / 100);
                }
            }
        } else {
            // handling bid and wrapper is the same for test purposes
            if (order.exchangeToken == address(0)) {
                if (_percentReturn > 0) {
                    payable(msg.sender).transfer((order.price * _percentReturn) / 100);
                }
            } else {
                if (_percentReturn > 0) {
                    IERC20(order.exchangeToken).transfer(msg.sender, (order.price * _percentReturn) / 100);
                }
            }

            if (orderType == OrderType.Bid) {
                IERC721(order.voucherContract).transferFrom(msg.sender, order.buyer, order.tokenId);
            }
        }

        emit MockFulfilCalled();
    }

    Order public order;
    OrderType public orderType;
    enum OrderType {
        Ask,
        Bid,
        Weapper
    }

    function setExpectedValues(Order calldata _order, OrderType _orderType) public payable virtual {
        order = _order;
        orderType = _orderType;
    }

    receive() external payable {}
}

/**
 * @dev Simple bad price discovery contract used in tests
 *
 * This contract modifies the token id, simulates bad/malicious contract
 */
contract PriceDiscoveryModifyTokenId is PriceDiscoveryMock {
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
contract PriceDiscoveryModifyVoucherContract is PriceDiscoveryMock {
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
 * This contract simply does not transfer the voucher to the caller
 */
contract PriceDiscoveryNoTransfer is PriceDiscoveryMock {
    /**
     * @dev do nothing
     */
    function fulfilBuyOrder(Order memory _order) public payable override {}
}

/**
 * @dev Simple bad price discovery contract used in tests
 *
 * This contract transfers the voucher to itself instead of the original msg.sender
 */
contract PriceDiscoveryTransferElsewhere is PriceDiscoveryMock, IERC721Receiver {
    /**
     * @dev invoke fulfilBuyOrder on itself, making it the msg.sender
     */
    function fulfilBuyOrderElsewhere(Order memory _order) public payable {
        if (_order.exchangeToken != address(0)) {
            IERC20(_order.exchangeToken).transferFrom(msg.sender, address(this), _order.price);
        }
        this.fulfilBuyOrder(_order);
    }

    /**
     * @dev See {IERC721Receiver-onERC721Received}.
     *
     * Always returns `IERC721Receiver.onERC721Received.selector`.
     */
    function onERC721Received(address, address, uint256, bytes calldata) public virtual override returns (bytes4) {
        return this.onERC721Received.selector;
    }
}
