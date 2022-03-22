// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../domain/BosonTypes.sol";

/**
 * @title ProtocolLib
 *
 * @dev Provides access to the the Protocol Storage and Initializer slots for Protocol facets
 *
 * @author Cliff Hall <cliff@futurescale.com> (https://twitter.com/seaofarrows)
 */
library ProtocolLib {

    bytes32 internal constant PROTOCOL_STORAGE_POSITION = keccak256("boson.protocol.storage");
    bytes32 internal constant PROTOCOL_INITIALIZERS_POSITION = keccak256("boson.protocol.storage.initializers");

    struct ProtocolStorage {

        // Address of the Boson Protocol treasury
        address payable treasuryAddress;

        // Address of the Boson Token (ERC-20 contract)
        address payable tokenAddress;

        // Address of the Boson Protocol Voucher proxy
        address voucherAddress;

        // Percentage that will be taken as a fee from the net of a Boson Protocol exchange
        uint16 protocolFeePercentage;         // 1.75% = 175, 100% = 10000

        // Next offer id
        uint256 nextOfferId;

        // Next exchange id
        uint256 nextExchangeId;

        // Next account id
        uint256 nextAccountId;

        // Next group id
        uint256 nextGroupId;

        // Next twin id
        uint256 nextBundleId;

        // Next twin id
        uint256 nextTwinId;

        // offer id => offer
        mapping(uint256 => BosonTypes.Offer) offers;

        // exchange id => exchange
        mapping(uint256 => BosonTypes.Exchange) exchanges;

        // exchange id => dispute
        mapping(uint256 => BosonTypes.Dispute) disputes;

        // seller id => seller
        mapping(uint256 => BosonTypes.Seller) sellers;

        //seller operator address => sellerId
        mapping(address => uint256) operatorsToSellers;

        //seller admin address => sellerId
        mapping(address => uint256) adminsToSellers;

        //seller clerk address => sellerId
        mapping(address => uint256) cerksToSellers;

        // buyer id => buyer
        mapping(uint256 => BosonTypes.Buyer) buyers;

        // group id => group
        mapping(uint256 => BosonTypes.Group) groups;

        // bundle id => bundle
        mapping(uint256 => BosonTypes.Bundle) bundles;

        // twin id => twin
        mapping(uint256 => BosonTypes.Twin) twins;

    }

    // Individual facet initialization states
    struct ProtocolInitializers {

        bool fundsHandler;

        bool configHandler;

        bool disputeHandler;

        bool exchangeHandler;

        bool offerHandler;

        bool twinHandler;

        bool accountHandler;

    }

    function protocolStorage() internal pure returns (ProtocolStorage storage ps) {
        bytes32 position = PROTOCOL_STORAGE_POSITION;
        assembly {
            ps.slot := position
        }
    }

    function protocolInitializers() internal pure returns (ProtocolInitializers storage pi) {
        bytes32 position = PROTOCOL_INITIALIZERS_POSITION;
        assembly {
            pi.slot := position
        }
    }


    /**
     * @notice Gets the details about a given seller
     *
     * @param _sellerId - the id of the seller
     * @return seller - the seller details. See {BosonTypes.Seller}
     */
    function getSeller(uint256 _sellerId)
    internal
    view
    returns(BosonTypes.Seller storage seller) {
        seller = protocolStorage().sellers[_sellerId];
    }

    /**
     * @notice Gets the details about a given offer
     *
     * @param _offerId - the id of the offer
     * @return offer - the offer details. See {BosonTypes.Offer}
     */
    function getOffer(uint256 _offerId)
    internal
    view
    returns(BosonTypes.Offer storage offer) {
        offer = protocolStorage().offers[_offerId];
    }

    /**
     * @notice Gets the details about a given exchange
     *
     * @param _exchangeId - the id of the exchange
     * @return exchange - the exchange details. See {BosonTypes.Exchange}
     */
    function getExchange(uint256 _exchangeId)
    internal
    view
    returns(BosonTypes.Exchange storage exchange) {
        exchange = protocolStorage().exchanges[_exchangeId];
    }

}