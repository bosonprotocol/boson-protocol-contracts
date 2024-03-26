// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;
import { IBosonExchangeHandler } from "../../interfaces/handlers/IBosonExchangeHandler.sol";
import { IBosonOfferHandler } from "../../interfaces/handlers/IBosonOfferHandler.sol";
import { DAIAliases as DAI } from "../../interfaces/DAIAliases.sol";
import { BosonTypes } from "../../domain/BosonTypes.sol";
import { ERC721 } from "./../support/ERC721.sol";
import { IERC721Metadata } from "./../support/IERC721Metadata.sol";
import { IERC165 } from "../../interfaces/IERC165.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface SeaportInterface {
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

    function matchAdvancedOrders(
        AdvancedOrder[] calldata orders,
        CriteriaResolver[] calldata criteriaResolvers,
        Fulfillment[] calldata fulfillments,
        address recipient
    ) external payable returns (Execution[] memory executions);

    /**
     * @dev The full set of order components, with the exception of the counter,
     *      must be supplied when fulfilling more sophisticated orders or groups of
     *      orders. The total number of original consideration items must also be
     *      supplied, as the caller may specify additional consideration items.
     */
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

    /**
     * @dev Orders require a signature in addition to the other order parameters.
     */
    struct Order {
        OrderParameters parameters;
        bytes signature;
    }

    /**
     * @dev A fulfillment is applied to a group of orders. It decrements a series of
     *      offer and consideration items, then generates a single execution
     *      element. A given fulfillment can be applied to as many offer and
     *      consideration items as desired, but must contain at least one offer and
     *      at least one consideration that match. The fulfillment must also remain
     *      consistent on all key parameters across all offer items (same offerer,
     *      token, type, tokenId, and conduit preference) as well as across all
     *      consideration items (token, type, tokenId, and recipient).
     */
    struct Fulfillment {
        FulfillmentComponent[] offerComponents;
        FulfillmentComponent[] considerationComponents;
    }

    /**
     * @dev Each fulfillment component contains one index referencing a specific
     *      order and another referencing a specific offer or consideration item.
     */
    struct FulfillmentComponent {
        uint256 orderIndex;
        uint256 itemIndex;
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

    /**
     * @dev Advanced orders include a numerator (i.e. a fraction to attempt to fill)
     *      and a denominator (the total size of the order) in addition to the
     *      signature and other order parameters. It also supports an optional field
     *      for supplying extra data; this data will be provided to the zone if the
     *      order type is restricted and the zone is not the caller, or will be
     *      provided to the offerer as context for contract order types.
     */
    struct AdvancedOrder {
        OrderParameters parameters;
        uint120 numerator;
        uint120 denominator;
        bytes signature;
        bytes extraData;
    }

    struct Execution {
        ReceivedItem item;
        address offerer;
        bytes32 conduitKey;
    }

    struct ReceivedItem {
        ItemType itemType;
        address token;
        uint256 identifier;
        uint256 amount;
        address payable recipient;
    }

    struct CriteriaResolver {
        uint256 orderIndex;
        Side side;
        uint256 index;
        uint256 identifier;
        bytes32[] criteriaProof;
    }

    enum Side {
        // 0: Items that can be spent
        OFFER,
        // 1: Items that must be received
        CONSIDERATION
    }

    enum OrderType {
        // 0: no partial fills, anyone can execute
        FULL_OPEN,
        // 1: partial fills supported, anyone can execute
        PARTIAL_OPEN,
        // 2: no partial fills, only offerer or zone can execute
        FULL_RESTRICTED,
        // 3: partial fills supported, only offerer or zone can execute
        PARTIAL_RESTRICTED,
        // 4: contract order type
        CONTRACT
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
}

/**
 * @title OpenSeaWrapper
 * @notice Wraps Boson Vouchers so they can be used with Opensea.
 *
 * Features:
 *
 * Out-of-band setup:
 *
 * Usage:
 *
 */
contract OpenSeaWrapper is BosonTypes, Ownable, ERC721 {
    // Add safeTransferFrom to IERC20
    using SafeERC20 for IERC20;

    // Contract addresses
    address private immutable voucherAddress;
    address private poolAddress;
    address private immutable factoryAddress;
    address private immutable protocolAddress;
    address private immutable unwrapperAddress;
    address private immutable wethAddress;

    // address private constant SEAPORT = address(0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC);
    address private constant SEAPORT = address(0x0000000000000068F116a894984e2DB1123eB395); // 1.6


    uint256 private openSeaFee;
    address payable openSeaRecipient;
    bytes32 private openSeaConduitKey;
    address private openSeaConduit;

    // Mapping from token ID to price. If pendingTokenId == tokenId, this is not the final price.
    mapping(uint256 => uint256) private price;

    // Mapping to cache exchange token address, so costly call to the protocol is not needed every time.
    mapping(uint256 => address) private cachedExchangeToken;

    /**
     * @notice Constructor
     *
     * @param _voucherAddress The address of the voucher that are wrapped by this contract.
     * @param _protocolAddress The address of the Boson Protocol.
     * @param _wethAddress The address of the WETH token.
     */
    constructor(
        address _voucherAddress,
        address _protocolAddress,
        address _wethAddress,
        address _unwrapperAddress
    ) ERC721(getVoucherName(_voucherAddress), getVoucherSymbol(_voucherAddress)) {
        voucherAddress = _voucherAddress;
        protocolAddress = _protocolAddress;
        wethAddress = _wethAddress;
        unwrapperAddress = _unwrapperAddress;

        openSeaFee = 250; // 2.5%
        openSeaRecipient = payable(address(0x0000a26b00c1F0DF003000390027140000fAa719));
        openSeaConduitKey = 0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000;
        openSeaConduit = address(0x1E0049783F008A0085193E00003D00cd54003c71);
    }

    /**
     * @dev Returns true if this contract implements the interface defined by
     * `interfaceId`. See the corresponding
     * https://eips.ethereum.org/EIPS/eip-165#how-interfaces-are-identified[EIP section]
     * to learn more about how these ids are created.
     */
    function supportsInterface(bytes4 _interfaceId) public view virtual override(ERC721) returns (bool) {
        return (_interfaceId == type(IERC721).interfaceId || _interfaceId == type(IERC165).interfaceId);
    }

    /**
     * @notice Wraps the vouchers, transfer true vouchers to this contract and mint wrapped vouchers
     *
     * Reverts if:
     *  - caller is not the contract owner
     *
     * @param _tokenIds The token ids.
     */
    function wrap(uint256[] calldata _tokenIds, address _to) internal {
        for (uint256 i = 0; i < _tokenIds.length; i++) {
            uint256 tokenId = _tokenIds[i];

            // Transfer vouchers to this contract
            // Instead of msg.sender it could be voucherAddress, if vouchers were preminted to contract itself
            // Not using safeTransferFrom since this contract is the recipient and we are sure it can handle the vouchers
            IERC721(voucherAddress).transferFrom(msg.sender, address(this), tokenId);

            // Mint to the caller
            _mint(_to, tokenId);

            _setApprovalForAll(address(this), openSeaConduit, true);
        }
    }

    function listFixedPriceOrder(uint256[] calldata _tokenIds, uint256 _price, uint256 _endTime) external {
        wrap(_tokenIds, address(this));

        SeaportInterface.Order[] memory orders = new SeaportInterface.Order[](_tokenIds.length);

        for (uint256 i = 0; i < _tokenIds.length; i++) {
            uint256 tokenId = _tokenIds[i];
            uint256 reducedPrice = ((10000 - openSeaFee) * _price) / 10000;
            price[tokenId] = reducedPrice;

            // Get exchange token and balance
            (address exchangeToken, uint256 balance) = getCurrentBalance(tokenId);

            // Create order
            SeaportInterface.OfferItem[] memory offer = new SeaportInterface.OfferItem[](1);
            offer[0] = SeaportInterface.OfferItem({
                itemType: SeaportInterface.ItemType.ERC721,
                token: address(this),
                identifierOrCriteria: tokenId,
                startAmount: 1,
                endAmount: 1
            });

            SeaportInterface.ConsiderationItem[] memory consideration = new SeaportInterface.ConsiderationItem[](2);
            consideration[0] = SeaportInterface.ConsiderationItem({
                itemType: exchangeToken == address(0)
                    ? SeaportInterface.ItemType.NATIVE
                    : SeaportInterface.ItemType.ERC20,
                token: exchangeToken,
                identifierOrCriteria: 0,
                startAmount: reducedPrice,
                endAmount: reducedPrice,
                recipient: payable(address(this))
            });

            consideration[1] = SeaportInterface.ConsiderationItem({
                itemType: exchangeToken == address(0)
                    ? SeaportInterface.ItemType.NATIVE
                    : SeaportInterface.ItemType.ERC20,
                token: exchangeToken,
                identifierOrCriteria: 0,
                startAmount: _price - reducedPrice, // If this is too small, OS won't show the order. This can happen if the price is too low.
                endAmount: _price - reducedPrice,
                recipient: openSeaRecipient
            });

            orders[i] = SeaportInterface.Order({
                parameters: SeaportInterface.OrderParameters({
                    offerer: address(this),
                    zone: address(0), // ToDo: make variable
                    offer: offer,
                    consideration: consideration,
                    orderType: SeaportInterface.OrderType.FULL_OPEN,
                    startTime: 0,
                    endTime: _endTime,
                    zoneHash: bytes32(0), // ToDo: make variable
                    salt: 0,
                    conduitKey: openSeaConduitKey,
                    totalOriginalConsiderationItems: 2
                }),
                signature: ""
            });
        }

        SeaportInterface(SEAPORT).validate(orders);
    }

    // function _beforeTokenTransfer(from, to, tokenId) internal override {
    //     // Do not allow transfers of wrapped vouchers
    // }

    function wrapForAuction(uint256[] calldata _tokenIds) external {
        wrap(_tokenIds, msg.sender);
    }

    function finalizeAuction(uint256 _tokenId, SeaportInterface.AdvancedOrder calldata _buyerOrder) external {
        address wrappedVoucherOwner = ownerOf(_tokenId); // tokenId can be taken from buyer order

        // Get exchange token and balance
        (address exchangeToken, uint256 balance) = getCurrentBalance(_tokenId);

        if (msg.sender == unwrapperAddress) {
            // ToDo: verify that the seller agrees, i.e. by signing the order
        } else {
            require(msg.sender == wrappedVoucherOwner, "OpenSeaWrapper: Only owner can finalize auction");
        }

        // transfer to itself to finalize the auction
        _transfer(wrappedVoucherOwner, address(this), _tokenId);

        uint256 _price = _buyerOrder.parameters.offer[0].startAmount;
        uint256 _openSeaFee = _buyerOrder.parameters.consideration[1].startAmount; // toDo: make check that this is the fee
        uint256 reducedPrice = _price - _openSeaFee;
        price[_tokenId] = reducedPrice;

        // prepare match advanced order. Can this be optimized with some simpler order?
        // caller must supply buyers signed order (_buyerOrder)
        // ToDo: verify that buyerOrder matches the expected format
        SeaportInterface.OfferItem[] memory offer = new SeaportInterface.OfferItem[](1);
        offer[0] = SeaportInterface.OfferItem({
            itemType: SeaportInterface.ItemType.ERC721,
            token: address(this),
            identifierOrCriteria: _tokenId,
            startAmount: 1,
            endAmount: 1
        });

        SeaportInterface.ConsiderationItem[] memory consideration = new SeaportInterface.ConsiderationItem[](2);
        consideration[0] = SeaportInterface.ConsiderationItem({
            itemType: _buyerOrder.parameters.offer[0].itemType,
            token: _buyerOrder.parameters.offer[0].token,
            identifierOrCriteria: 0,
            startAmount: reducedPrice,
            endAmount: reducedPrice,
            recipient: payable(address(this))
        });

        SeaportInterface.AdvancedOrder memory wrapperOrder = SeaportInterface.AdvancedOrder({
            parameters: SeaportInterface.OrderParameters({
                offerer: address(this),
                zone: address(0), // ToDo: make variable/
                offer: offer,
                consideration: consideration,
                orderType: SeaportInterface.OrderType.FULL_OPEN,
                startTime: _buyerOrder.parameters.startTime,
                endTime: _buyerOrder.parameters.endTime,
                zoneHash: bytes32(0), // ToDo: make variable
                salt: 0,
                conduitKey: openSeaConduitKey,
                totalOriginalConsiderationItems: 1
            }),
            numerator: 1,
            denominator: 1,
            signature: "",
            extraData: ""
        });

        SeaportInterface.AdvancedOrder[] memory orders = new SeaportInterface.AdvancedOrder[](2);
        orders[0] = _buyerOrder;
        orders[1] = wrapperOrder;

        SeaportInterface.Fulfillment[] memory fulfillments = new SeaportInterface.Fulfillment[](3);

        // NFT from buyer, to NFT from seller
        fulfillments[0] = SeaportInterface.Fulfillment({
            offerComponents: new SeaportInterface.FulfillmentComponent[](1),
            considerationComponents: new SeaportInterface.FulfillmentComponent[](1)
        });
        fulfillments[0].offerComponents[0] = SeaportInterface.FulfillmentComponent({ orderIndex: 1, itemIndex: 0 });
        fulfillments[0].considerationComponents[0] = SeaportInterface.FulfillmentComponent({
            orderIndex: 0,
            itemIndex: 0
        });

        // Payment from buyer to seller
        fulfillments[1] = SeaportInterface.Fulfillment({
            offerComponents: new SeaportInterface.FulfillmentComponent[](1),
            considerationComponents: new SeaportInterface.FulfillmentComponent[](1)
        });
        fulfillments[1].offerComponents[0] = SeaportInterface.FulfillmentComponent({ orderIndex: 0, itemIndex: 0 });
        fulfillments[1].considerationComponents[0] = SeaportInterface.FulfillmentComponent({
            orderIndex: 1,
            itemIndex: 0
        });

        // Payment from buyer to OpenSea
        fulfillments[2] = SeaportInterface.Fulfillment({
            offerComponents: new SeaportInterface.FulfillmentComponent[](1),
            considerationComponents: new SeaportInterface.FulfillmentComponent[](1)
        });
        fulfillments[2].offerComponents[0] = SeaportInterface.FulfillmentComponent({ orderIndex: 0, itemIndex: 0 });
        fulfillments[2].considerationComponents[0] = SeaportInterface.FulfillmentComponent({
            orderIndex: 0,
            itemIndex: 1
        });

        SeaportInterface.Execution[] memory executions = SeaportInterface(SEAPORT).matchAdvancedOrders(
            orders,
            new SeaportInterface.CriteriaResolver[](0),
            fulfillments,
            address(this)
        );

        // if invoked from BP, we can probably immediately unwrap it?
        if (msg.sender == unwrapperAddress) {
            unwrap(_tokenId);
        }
    }

    /**
     * @notice Unwraps the voucher, transfer true voucher to owner and funds to the protocol.
     *
     * Reverts if:
     *  - caller is neither protocol nor voucher owner
     *
     * @param _tokenId The token id.
     */
    function unwrap(uint256 _tokenId) public  {
        address wrappedVoucherOwner = ownerOf(_tokenId);

        // Either contract owner or protocol can unwrap
        // If contract owner is unwrapping, this is equivalent to removing the voucher from the pool
        require(
            msg.sender == unwrapperAddress || wrappedVoucherOwner == msg.sender,
            "OpenSeaWrapper: Only owner or protocol can unwrap"
        );

        uint256 priceToPay = price[_tokenId];

        // Delete price and pendingTokenId to prevent reentrancy
        delete price[_tokenId];

        // transfer Boson Voucher to voucher owner
        IERC721(voucherAddress).safeTransferFrom(address(this), wrappedVoucherOwner, _tokenId);

        // Transfer token to protocol
        if (priceToPay > 0) {
            // This example only supports WETH
            IERC20(cachedExchangeToken[_tokenId]).safeTransfer(unwrapperAddress, priceToPay);
        }

        delete cachedExchangeToken[_tokenId]; // gas refund

        // Burn wrapped voucher
        _burn(_tokenId);
    }

    /**
     * @notice Gets own token balance for the exchange token, associated with the token ID.
     *
     * @dev If the exchange token is not known, it is fetched from the protocol and cached for future use.
     *
     * @param _tokenId The token id.
     */
    function getCurrentBalance(uint256 _tokenId) internal returns (address exchangeToken, uint256 balance) {
        exchangeToken = cachedExchangeToken[_tokenId];

        // If exchange token is not known, get it from the protocol.
        if (exchangeToken == address(0)) {
            uint256 offerId = _tokenId >> 128; // OfferId is the first 128 bits of the token ID.

            if (offerId == 0) {
                // pre v2.2.0. Token does not have offerId, so we need to get it from the protocol.
                // Get Boson exchange. Don't explicitly check if the exchange exists, since existance of the token implies it does.
                uint256 exchangeId = _tokenId & type(uint128).max; // ExchangeId is the last 128 bits of the token ID.
                (, BosonTypes.Exchange memory exchange, ) = IBosonExchangeHandler(protocolAddress).getExchange(
                    exchangeId
                );
                offerId = exchange.offerId;
            }

            // Get Boson offer. Don't explicitly check if the offer exists, since existance of the token implies it does.
            (, BosonTypes.Offer memory offer, , , , ) = IBosonOfferHandler(protocolAddress).getOffer(offerId);
            exchangeToken = offer.exchangeToken;

            // If exchange token is 0, it means native token is used. In that case, use WETH.
            if (exchangeToken == address(0)) exchangeToken = wethAddress;
            cachedExchangeToken[_tokenId] = exchangeToken;
        }

        balance = IERC20(exchangeToken).balanceOf(address(this));
    }

    /**
     * @notice Gets the Boson Voucher token name and adds "Wrapped" prefix.
     *
     * @dev Used only in the constructor.
     *
     * @param _voucherAddress Boson Voucher address
     */
    function getVoucherName(address _voucherAddress) internal view returns (string memory) {
        string memory name = IERC721Metadata(_voucherAddress).name();
        return string.concat("Wrapped ", name);
    }

    /**
     * @notice Gets the the Boson Voucher symbol and adds "W" prefix.
     *
     * @dev Used only in the constructor.
     *
     * @param _voucherAddress Boson Voucher address
     */
    function getVoucherSymbol(address _voucherAddress) internal view returns (string memory) {
        string memory symbol = IERC721Metadata(_voucherAddress).symbol();
        return string.concat("W", symbol);
    }
}
