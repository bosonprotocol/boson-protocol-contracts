// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { BosonTypes } from "../../domain/BosonTypes.sol";

/**
 * @title ProtocolLib
 *
 * @dev Provides access to the Protocol Storage, Counters, and Initializer slots for Facets
 */
library ProtocolLib {
    bytes32 internal constant PROTOCOL_ADDRESSES_POSITION = keccak256("boson.protocol.addresses");
    bytes32 internal constant PROTOCOL_LIMITS_POSITION = keccak256("boson.protocol.limits");
    bytes32 internal constant PROTOCOL_ENTITIES_POSITION = keccak256("boson.protocol.entities");
    bytes32 internal constant PROTOCOL_LOOKUPS_POSITION = keccak256("boson.protocol.lookups");
    bytes32 internal constant PROTOCOL_FEES_POSITION = keccak256("boson.protocol.fees");
    bytes32 internal constant PROTOCOL_COUNTERS_POSITION = keccak256("boson.protocol.counters");
    bytes32 internal constant PROTOCOL_INITIALIZERS_POSITION = keccak256("boson.protocol.initializers");
    bytes32 internal constant PROTOCOL_META_TX_POSITION = keccak256("boson.protocol.metaTransactionsStorage");

    // Protocol addresses storage
    struct ProtocolAddresses {
        // Address of the Boson Protocol treasury
        address payable treasuryAddress;
        // Address of the Boson Token (ERC-20 contract)
        address payable tokenAddress;
        // Address of the Boson Protocol Voucher beacon
        address voucherBeaconAddress;
        // Address of the Boson Protocol Voucher proxy
        address voucherProxyAddress;
    }

    // Protocol limits storage
    struct ProtocolLimits {
        // limit how many offers can be added to the group
        uint16 maxOffersPerGroup;
        // limit how many offers can be added to the bundle
        uint16 maxOffersPerBundle;
        // limit how many twins can be added to the bundle
        uint16 maxTwinsPerBundle;
        // limit how many offers can be processed in single batch transaction
        uint16 maxOffersPerBatch;
        // limit how many different tokens can be withdrawn in a single transaction
        uint16 maxTokensPerWithdrawal;
        // limit how many dispute resolver fee structs can be processed in a single transaction
        uint16 maxFeesPerDisputeResolver;
        // limit on the escalation response period that a dispute resolver can specify
        uint256 maxEscalationResponsePeriod;
        // limit how many disputes can be processed in single batch transaction
        uint16 maxDisputesPerBatch;
    }

    // Protocol fees storage
    struct ProtocolFees {
        // Percentage that will be taken as a fee from the net of a Boson Protocol exchange
        uint16 percentage; // 1.75% = 175, 100% = 10000
        // Flat fee taken for exchanges in $BOSON
        uint256 flatBoson;
    }

    // Protocol entities storage
    struct ProtocolEntities {
        // offer id => offer
        mapping(uint256 => BosonTypes.Offer) offers;
        // offer id => offer dates
        mapping(uint256 => BosonTypes.OfferDates) offerDates;
        // offer id => offer durations
        mapping(uint256 => BosonTypes.OfferDurations) offerDurations;
        // exchange id => exchange
        mapping(uint256 => BosonTypes.Exchange) exchanges;
        // exchange id => dispute
        mapping(uint256 => BosonTypes.Dispute) disputes;
        // exchange id => dispute dates
        mapping(uint256 => BosonTypes.DisputeDates) disputeDates;
        // seller id => seller
        mapping(uint256 => BosonTypes.Seller) sellers;
        // buyer id => buyer
        mapping(uint256 => BosonTypes.Buyer) buyers;
        // dispute resolver id => dispute resolver
        mapping(uint256 => BosonTypes.DisputeResolver) disputeResolvers;
        // dispute resolver id => dispute resolver fee array
        mapping(uint256 => BosonTypes.DisputeResolverFee[]) disputeResolverFees;
        // group id => group
        mapping(uint256 => BosonTypes.Group) groups;
        // bundle id => bundle
        mapping(uint256 => BosonTypes.Bundle) bundles;
        // twin id => twin
        mapping(uint256 => BosonTypes.Twin) twins;
    }

    // Protocol lookups storage
    struct ProtocolLookups {
        // offer id => exchange ids
        mapping(uint256 => uint256[]) exchangeIdsByOffer;
        // offer id => bundle id
        mapping(uint256 => uint256) bundleIdByOffer;
        // twin id => bundle ids
        mapping(uint256 => uint256[]) bundleIdsByTwin;
        // offer id => group id
        mapping(uint256 => uint256) groupIdByOffer;
        //seller operator address => sellerId
        mapping(address => uint256) sellerIdByOperator;
        //seller admin address => sellerId
        mapping(address => uint256) sellerIdByAdmin;
        //seller clerk address => sellerId
        mapping(address => uint256) sellerIdByClerk;
        //buyer wallet address => buyerId
        mapping(address => uint256) buyerIdByWallet;
        //dispute resolver operator address => disputeResolverId
        mapping(address => uint256) disputeResolverIdByOperator;
        //dispute resolver admin address => disputeResolverId
        mapping(address => uint256) disputeResolverIdByAdmin;
        //dispute resolver clerk address => disputeResolverId
        mapping(address => uint256) disputeResolverIdByClerk;
        //dispute resolver id to fee token address => index of the token address
        mapping(uint256 => mapping(address => uint256)) disputeResolverFeeTokenIndex;
        // seller/buyer id => token address => amount
        mapping(uint256 => mapping(address => uint256)) availableFunds;
        // seller/buyer id => all tokens with balance > 0
        mapping(uint256 => address[]) tokenList;
        // seller id => cloneAddress
        mapping(uint256 => address) cloneAddress;
        // buyer id => number of active vouchers
        mapping(uint256 => uint256) voucherCount;
    }

    // Incrementing ID counters
    struct ProtocolCounters {
        // Next account id
        uint256 nextAccountId;
        // Next offer id
        uint256 nextOfferId;
        // Next exchange id
        uint256 nextExchangeId;
        // Next twin id
        uint256 nextTwinId;
        // Next group id
        uint256 nextGroupId;
        // Next twin id
        uint256 nextBundleId;
    }

    // Storage related to Meta Transactions
    struct ProtocolMetaTxInfo {
        // The current sender address associated with the transaction
        address currentSenderAddress;
        // A flag that tells us whether the current transaction is a meta-transaction or a regular transaction.
        bool isMetaTransaction;
        // The domain Separator of the protocol
        bytes32 domainSeparator;
        // nonce => existance of nonce in the mapping
        mapping(uint256 => bool) usedNonce;
        // map function name to input type
        mapping(string => BosonTypes.MetaTxInputType) inputType;
        // map input type => hash info
        mapping (BosonTypes.MetaTxInputType => BosonTypes.HashInfo) hashInfo;
    }

    // Individual facet initialization states
    struct ProtocolInitializers {
        // interface id => initialized?
        mapping(bytes4 => bool) initializedInterfaces;
    }

    /**
     * @dev Get the protocol addresses slot
     *
     * @return pa the protocol addresses slot
     */
    function protocolAddresses() internal pure returns (ProtocolAddresses storage pa) {
        bytes32 position = PROTOCOL_ADDRESSES_POSITION;
        assembly {
            pa.slot := position
        }
    }

    /**
     * @dev Get the protocol limits slot
     *
     * @return pl the protocol limits slot
     */
    function protocolLimits() internal pure returns (ProtocolLimits storage pl) {
        bytes32 position = PROTOCOL_LIMITS_POSITION;
        assembly {
            pl.slot := position
        }
    }

    /**
     * @dev Get the protocol entities slot
     *
     * @return pe the protocol entities slot
     */
    function protocolEntities() internal pure returns (ProtocolEntities storage pe) {
        bytes32 position = PROTOCOL_ENTITIES_POSITION;
        assembly {
            pe.slot := position
        }
    }

    /**
     * @dev Get the protocol lookups slot
     *
     * @return pl the protocol lookups slot
     */
    function protocolLookups() internal pure returns (ProtocolLookups storage pl) {
        bytes32 position = PROTOCOL_LOOKUPS_POSITION; 
        assembly {
            pl.slot := position
        }
    }

    /**
     * @dev Get the protocol fees slot
     *
     * @return pf the protocol fees slot
     */
    function protocolFees() internal pure returns (ProtocolFees storage pf) {
        bytes32 position = PROTOCOL_FEES_POSITION;
        assembly {
            pf.slot := position
        }
    }

    /**
     * @dev Get the protocol counters slot
     *
     * @return pc the protocol counters slot
     */
    function protocolCounters() internal pure returns (ProtocolCounters storage pc) {
        bytes32 position = PROTOCOL_COUNTERS_POSITION;
        assembly {
            pc.slot := position
        }
    }

    /**
     * @dev Get the protocol meta-transactions storage slot
     *
     * @return pmti the protocol meta-transactions storage slot
     */
    function protocolMetaTxInfo() internal pure returns (ProtocolMetaTxInfo storage pmti) {
        bytes32 position = PROTOCOL_META_TX_POSITION;
        assembly {
            pmti.slot := position
        }
    }

    /**
     * @dev Get the protocol initializers slot
     *
     * @return pi the the protocol initializers slot
     */
    function protocolInitializers() internal pure returns (ProtocolInitializers storage pi) {
        bytes32 position = PROTOCOL_INITIALIZERS_POSITION;
        assembly {
            pi.slot := position
        }
    }
}
