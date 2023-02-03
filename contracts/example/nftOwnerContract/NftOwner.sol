// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.9;

interface Types {
    /**
     * @dev Orders require a signature in addition to the other order parameters.
     */
    struct Order {
        OrderParameters parameters;
        bytes signature;
    }

    struct OrderParameters {
        address offerer; // 0x00
        address zone; // 0x20
        OfferItem[] offer; // 0x40
        ConsiderationItem[] consideration; // 0x60
        OrderType orderType; // 0x80
        uint256 startTime; // 0xa0
        uint256 endTime; // 0xc0
        bytes32 zoneHash; // 0xe0
        uint256 salt; // 0x100
        bytes32 conduitKey; // 0x120
        uint256 totalOriginalConsiderationItems; // 0x140
        // offer.length                          // 0x160
    }

    struct OrderComponents {
        address offerer;
        address zone;
        OfferItem[] offer;
        ConsiderationItem[] consideration;
        OrderType orderType;
        uint256 startTime;
        uint256 endTime;
        bytes32 zoneHash;
        uint256 salt;
        bytes32 conduitKey;
        uint256 counter;
    }

    /**
     * @dev An offer item has five components: an item type (ETH or other native
     *      tokens, ERC20, ERC721, and ERC1155, as well as criteria-based ERC721 and
     *      ERC1155), a token address, a dual-purpose "identifierOrCriteria"
     *      component that will either represent a tokenId or a merkle root
     *      depending on the item type, and a start and end amount that support
     *      increasing or decreasing amounts over the duration of the respective
     *      order.
     */
    struct OfferItem {
        ItemType itemType;
        address token;
        uint256 identifierOrCriteria;
        uint256 startAmount;
        uint256 endAmount;
    }

    /**
     * @dev A consideration item has the same five components as an offer item and
     *      an additional sixth component designating the required recipient of the
     *      item.
     */
    struct ConsiderationItem {
        ItemType itemType;
        address token;
        uint256 identifierOrCriteria;
        uint256 startAmount;
        uint256 endAmount;
        address payable recipient;
    }

    enum ItemType {
        // 0: ETH on mainnet, MATIC on polygon, etc.
        NATIVE,
        // 1: ERC20 items (ERC777 and ERC20 analogues could also technically work)
        ERC20,
        // 2: ERC721 items
        ERC721,
        // 3: ERC1155 items
        ERC1155,
        // 4: ERC721 items where a number of tokenIds are supported
        ERC721_WITH_CRITERIA,
        // 5: ERC1155 items where a number of ids are supported
        ERC1155_WITH_CRITERIA
    }

    // prettier-ignore
    enum OrderType {
    // 0: no partial fills, anyone can execute
    FULL_OPEN,

    // 1: partial fills supported, anyone can execute
    PARTIAL_OPEN,

    // 2: no partial fills, only offerer or zone can execute
    FULL_RESTRICTED,

    // 3: partial fills supported, only offerer or zone can execute
    PARTIAL_RESTRICTED
}
}

contract SimpleValidator is Types {
    function validate() external {
        Order[] memory orders = new Order[](1);
        OfferItem[] memory offer = new OfferItem[](1); // 0x40
        ConsiderationItem[] memory consideration = new ConsiderationItem[](2); // 0x60

        offer[0] = OfferItem({
            itemType: ItemType.ERC721,
            token: 0x9edE0221B5f7671E4D615C000C85d84086BCd728,
            identifierOrCriteria: 865,
            startAmount: 1,
            endAmount: 1
        });

        consideration[0] = ConsiderationItem({
            itemType: ItemType.NATIVE,
            token: address(0),
            identifierOrCriteria: 0,
            startAmount: 1 ether,
            endAmount: 1 ether,
            recipient: payable(address(this))
        });

        consideration[1] = ConsiderationItem({
            itemType: ItemType.NATIVE,
            token: address(0),
            identifierOrCriteria: 0,
            startAmount: (25 / 1000) * 1 ether,
            endAmount: (25 / 1000) * 1 ether,
            recipient: payable(0x0000a26b00c1F0DF003000390027140000fAa719) //opensea
        });

        OrderParameters memory parameters = OrderParameters({
            offerer: address(this),
            zone: address(0),
            offer: offer,
            consideration: consideration,
            orderType: OrderType.FULL_OPEN,
            startTime: 0,
            endTime: type(uint64).max,
            zoneHash: 0x0000000000000000000000000000000000000000000000000000000000000000,
            salt: 0xb8bc7400f97a07d77bedc73df4c413c4ceeb9bf4d7dc2ecdbf339a77dd61c945,
            conduitKey: 0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000,
            totalOriginalConsiderationItems: 2
        });

        bytes memory signature;

        orders[0] = Order({ parameters: parameters, signature: signature });

        SeaportInterface(0x00000000006c3852cbEf3e08E8dF289169EdE581).validate(orders);
    }

    //   seaport1.1  0x00000000006c3852cbEf3e08E8dF289169EdE581

    // seaport1.2. 0x00000000000006c7676171937C444f6BDe3D6282

    // conduit 0x00000000F9490004C11Cef243f5400493c00Ad63
}

interface SeaportInterface is Types {
    /**
     * @notice Validate an arbitrary number of orders, thereby registering their
     *         signatures as valid and allowing the fulfiller to skip signature
     *         verification on fulfillment. Note that validated orders may still
     *         be unfulfillable due to invalid item amounts or other factors;
     *         callers should determine whether validated orders are fulfillable
     *         by simulating the fulfillment call prior to execution. Also note
     *         that anyone can validate a signed order, but only the offerer can
     *         validate an order without supplying a signature.
     *
     * @param orders The orders to validate.
     *
     * @return validated A boolean indicating whether the supplied orders have
     *                   been successfully validated.
     */
    function validate(Order[] calldata orders) external returns (bool validated);

    function getOrderStatus(bytes32 orderHash)
        external
        view
        returns (
            bool isValidated,
            bool isCancelled,
            uint256 totalFilled,
            uint256 totalSize
        );

    function getOrderHash(OrderComponents calldata order) external view returns (bytes32 orderHash);
}
