// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import "../../domain/BosonConstants.sol";
import { BosonErrors } from "../../domain/BosonErrors.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { EIP712Lib } from "../libs/EIP712Lib.sol";
import { BosonTypes } from "../../domain/BosonTypes.sol";
import { PausableBase } from "./PausableBase.sol";
import { ReentrancyGuardBase } from "./ReentrancyGuardBase.sol";
import { FundsLib } from "../libs/FundsLib.sol";

/**
 * @title ProtocolBase
 *
 * @notice Provides domain and common modifiers to Protocol facets
 */
abstract contract ProtocolBase is PausableBase, ReentrancyGuardBase, BosonErrors {
    /**
     * @notice Modifier to protect initializer function from being invoked twice.
     */
    modifier onlyUninitialized(bytes4 interfaceId) {
        ProtocolLib.ProtocolStatus storage ps = protocolStatus();
        if (ps.initializedInterfaces[interfaceId]) revert AlreadyInitialized();
        ps.initializedInterfaces[interfaceId] = true;
        _;
    }

    /**
     * @notice Modifier that checks that the caller has a specific role.
     *
     * Reverts if caller doesn't have role.
     *
     * See: {AccessController.hasRole}
     *
     * @param _role - the role to check
     */
    modifier onlyRole(bytes32 _role) {
        DiamondLib.DiamondStorage storage ds = DiamondLib.diamondStorage();
        if (!ds.accessController.hasRole(_role, msgSender())) revert AccessDenied();
        _;
    }

    /**
     * @notice Get the Protocol Addresses slot
     *
     * @return pa - the Protocol Addresses slot
     */
    function protocolAddresses() internal pure returns (ProtocolLib.ProtocolAddresses storage pa) {
        pa = ProtocolLib.protocolAddresses();
    }

    /**
     * @notice Get the Protocol Limits slot
     *
     * @return pl - the Protocol Limits slot
     */
    function protocolLimits() internal pure returns (ProtocolLib.ProtocolLimits storage pl) {
        pl = ProtocolLib.protocolLimits();
    }

    /**
     * @notice Get the Protocol Entities slot
     *
     * @return pe - the Protocol Entities slot
     */
    function protocolEntities() internal pure returns (ProtocolLib.ProtocolEntities storage pe) {
        pe = ProtocolLib.protocolEntities();
    }

    /**
     * @notice Get the Protocol Lookups slot
     *
     * @return pl - the Protocol Lookups slot
     */
    function protocolLookups() internal pure returns (ProtocolLib.ProtocolLookups storage pl) {
        pl = ProtocolLib.protocolLookups();
    }

    /**
     * @notice Get the Protocol Fees slot
     *
     * @return pf - the Protocol Fees slot
     */
    function protocolFees() internal pure returns (ProtocolLib.ProtocolFees storage pf) {
        pf = ProtocolLib.protocolFees();
    }

    /**
     * @notice Get the Protocol Counters slot
     *
     * @return pc the Protocol Counters slot
     */
    function protocolCounters() internal pure returns (ProtocolLib.ProtocolCounters storage pc) {
        pc = ProtocolLib.protocolCounters();
    }

    /**
     * @notice Get the Protocol meta-transactions storage slot
     *
     * @return pmti the Protocol meta-transactions storage slot
     */
    function protocolMetaTxInfo() internal pure returns (ProtocolLib.ProtocolMetaTxInfo storage pmti) {
        pmti = ProtocolLib.protocolMetaTxInfo();
    }

    /**
     * @notice Get the Protocol Status slot
     *
     * @return ps the Protocol Status slot
     */
    function protocolStatus() internal pure returns (ProtocolLib.ProtocolStatus storage ps) {
        ps = ProtocolLib.protocolStatus();
    }

    /**
     * @notice Gets a seller id from storage by assistant address
     *
     * @param _assistant - the assistant address of the seller
     * @return exists - whether the seller id exists
     * @return sellerId  - the seller id
     */
    function getSellerIdByAssistant(address _assistant) internal view returns (bool exists, uint256 sellerId) {
        // Get the seller id
        sellerId = protocolLookups().sellerIdByAssistant[_assistant];

        // Determine existence
        exists = (sellerId > 0);
    }

    /**
     * @notice Gets a seller id from storage by admin address
     *
     * @param _admin - the admin address of the seller
     * @return exists - whether the seller id exists
     * @return sellerId  - the seller id
     */
    function getSellerIdByAdmin(address _admin) internal view returns (bool exists, uint256 sellerId) {
        // Get the seller id
        sellerId = protocolLookups().sellerIdByAdmin[_admin];

        // Determine existence
        exists = (sellerId > 0);
    }

    /**
     * @notice Gets a seller id from storage by auth token.  A seller will have either an admin address or an auth token
     *
     * @param _authToken - the potential _authToken of the seller.
     * @return exists - whether the seller id exists
     * @return sellerId  - the seller id
     */
    function getSellerIdByAuthToken(
        AuthToken calldata _authToken
    ) internal view returns (bool exists, uint256 sellerId) {
        // Get the seller id
        sellerId = protocolLookups().sellerIdByAuthToken[_authToken.tokenType][_authToken.tokenId];

        // Determine existence
        exists = (sellerId > 0);
    }

    /**
     * @notice Gets a buyer id from storage by wallet address
     *
     * @param _wallet - the wallet address of the buyer
     * @return exists - whether the buyer id exists
     * @return buyerId  - the buyer id
     */
    function getBuyerIdByWallet(address _wallet) internal view returns (bool exists, uint256 buyerId) {
        // Get the buyer id
        buyerId = protocolLookups().buyerIdByWallet[_wallet];

        // Determine existence
        exists = (buyerId > 0);
    }

    /**
     * @notice Gets a agent id from storage by wallet address
     *
     * @param _wallet - the wallet address of the buyer
     * @return exists - whether the buyer id exists
     * @return agentId  - the buyer id
     */
    function getAgentIdByWallet(address _wallet) internal view returns (bool exists, uint256 agentId) {
        // Get the buyer id
        agentId = protocolLookups().agentIdByWallet[_wallet];

        // Determine existence
        exists = (agentId > 0);
    }

    /**
     * @notice Gets a dispute resolver id from storage by assistant address
     *
     * @param _assistant - the assistant address of the dispute resolver
     * @return exists - whether the dispute resolver id exists
     * @return disputeResolverId  - the dispute resolver  id
     */
    function getDisputeResolverIdByAssistant(
        address _assistant
    ) internal view returns (bool exists, uint256 disputeResolverId) {
        // Get the dispute resolver id
        disputeResolverId = protocolLookups().disputeResolverIdByAssistant[_assistant];

        // Determine existence
        exists = (disputeResolverId > 0);
    }

    /**
     * @notice Gets a dispute resolver id from storage by admin address
     *
     * @param _admin - the admin address of the dispute resolver
     * @return exists - whether the dispute resolver id exists
     * @return disputeResolverId  - the dispute resolver id
     */
    function getDisputeResolverIdByAdmin(
        address _admin
    ) internal view returns (bool exists, uint256 disputeResolverId) {
        // Get the dispute resolver id
        disputeResolverId = protocolLookups().disputeResolverIdByAdmin[_admin];

        // Determine existence
        exists = (disputeResolverId > 0);
    }

    /**
     * @notice Gets a group id from storage by offer id
     *
     * @param _offerId - the offer id
     * @return exists - whether the group id exists
     * @return groupId  - the group id.
     */
    function getGroupIdByOffer(uint256 _offerId) internal view returns (bool exists, uint256 groupId) {
        // Get the group id
        groupId = protocolLookups().groupIdByOffer[_offerId];

        // Determine existence
        exists = (groupId > 0);
    }

    /**
     * @notice Fetches a given seller from storage by id
     *
     * @param _sellerId - the id of the seller
     * @return exists - whether the seller exists
     * @return seller - the seller details. See {BosonTypes.Seller}
     * @return authToken - optional AuthToken struct that specifies an AuthToken type and tokenId that the user can use to do admin functions
     */
    function fetchSeller(
        uint256 _sellerId
    ) internal view returns (bool exists, Seller storage seller, AuthToken storage authToken) {
        // Cache protocol entities for reference
        ProtocolLib.ProtocolEntities storage entities = protocolEntities();

        // Get the seller's slot
        seller = entities.sellers[_sellerId];

        //Get the seller's auth token's slot
        authToken = entities.authTokens[_sellerId];

        // Determine existence
        exists = (_sellerId > 0 && seller.id == _sellerId);
    }

    /**
     * @notice Fetches a given buyer from storage by id
     *
     * @param _buyerId - the id of the buyer
     * @return exists - whether the buyer exists
     * @return buyer - the buyer details. See {BosonTypes.Buyer}
     */
    function fetchBuyer(uint256 _buyerId) internal view returns (bool exists, BosonTypes.Buyer storage buyer) {
        // Get the buyer's slot
        buyer = protocolEntities().buyers[_buyerId];

        // Determine existence
        exists = (_buyerId > 0 && buyer.id == _buyerId);
    }

    /**
     * @notice Fetches a given dispute resolver from storage by id
     *
     * @param _disputeResolverId - the id of the dispute resolver
     * @return exists - whether the dispute resolver exists
     * @return disputeResolver - the dispute resolver details. See {BosonTypes.DisputeResolver}
     * @return disputeResolverFees - list of fees dispute resolver charges per token type. Zero address is native currency. See {BosonTypes.DisputeResolverFee}
     */
    function fetchDisputeResolver(
        uint256 _disputeResolverId
    )
        internal
        view
        returns (
            bool exists,
            BosonTypes.DisputeResolver storage disputeResolver,
            BosonTypes.DisputeResolverFee[] storage disputeResolverFees
        )
    {
        // Cache protocol entities for reference
        ProtocolLib.ProtocolEntities storage entities = protocolEntities();

        // Get the dispute resolver's slot
        disputeResolver = entities.disputeResolvers[_disputeResolverId];

        //Get dispute resolver's fee list slot
        disputeResolverFees = entities.disputeResolverFees[_disputeResolverId];

        // Determine existence
        exists = (_disputeResolverId > 0 && disputeResolver.id == _disputeResolverId);
    }

    /**
     * @notice Fetches a given agent from storage by id
     *
     * @param _agentId - the id of the agent
     * @return exists - whether the agent exists
     * @return agent - the agent details. See {BosonTypes.Agent}
     */
    function fetchAgent(uint256 _agentId) internal view returns (bool exists, BosonTypes.Agent storage agent) {
        // Get the agent's slot
        agent = protocolEntities().agents[_agentId];

        // Determine existence
        exists = (_agentId > 0 && agent.id == _agentId);
    }

    /**
     * @notice Fetches a given offer from storage by id
     *
     * @param _offerId - the id of the offer
     * @return exists - whether the offer exists
     * @return offer - the offer details. See {BosonTypes.Offer}
     */
    function fetchOffer(uint256 _offerId) internal view returns (bool exists, Offer storage offer) {
        // Get the offer's slot
        offer = protocolEntities().offers[_offerId];

        // Determine existence
        exists = (_offerId > 0 && offer.id == _offerId);
    }

    /**
     * @notice Fetches the offer dates from storage by offer id
     *
     * @param _offerId - the id of the offer
     * @return offerDates - the offer dates details. See {BosonTypes.OfferDates}
     */
    function fetchOfferDates(uint256 _offerId) internal view returns (BosonTypes.OfferDates storage offerDates) {
        // Get the offerDates slot
        offerDates = protocolEntities().offerDates[_offerId];
    }

    /**
     * @notice Fetches the offer durations from storage by offer id
     *
     * @param _offerId - the id of the offer
     * @return offerDurations - the offer durations details. See {BosonTypes.OfferDurations}
     */
    function fetchOfferDurations(
        uint256 _offerId
    ) internal view returns (BosonTypes.OfferDurations storage offerDurations) {
        // Get the offer's slot
        offerDurations = protocolEntities().offerDurations[_offerId];
    }

    /**
     * @notice Fetches the dispute resolution terms from storage by offer id
     *
     * @param _offerId - the id of the offer
     * @return disputeResolutionTerms - the details about the dispute resolution terms. See {BosonTypes.DisputeResolutionTerms}
     */
    function fetchDisputeResolutionTerms(
        uint256 _offerId
    ) internal view returns (BosonTypes.DisputeResolutionTerms storage disputeResolutionTerms) {
        // Get the disputeResolutionTerms slot
        disputeResolutionTerms = protocolEntities().disputeResolutionTerms[_offerId];
    }

    /**
     * @notice Fetches a given group from storage by id
     *
     * @param _groupId - the id of the group
     * @return exists - whether the group exists
     * @return group - the group details. See {BosonTypes.Group}
     */
    function fetchGroup(uint256 _groupId) internal view returns (bool exists, Group storage group) {
        // Get the group's slot
        group = protocolEntities().groups[_groupId];

        // Determine existence
        exists = (_groupId > 0 && group.id == _groupId);
    }

    /**
     * @notice Fetches the Condition from storage by group id
     *
     * @param _groupId - the id of the group
     * @return condition - the condition details. See {BosonTypes.Condition}
     */
    function fetchCondition(uint256 _groupId) internal view returns (BosonTypes.Condition storage condition) {
        // Get the offerDates slot
        condition = protocolEntities().conditions[_groupId];
    }

    /**
     * @notice Fetches a given exchange from storage by id
     *
     * @param _exchangeId - the id of the exchange
     * @return exists - whether the exchange exists
     * @return exchange - the exchange details. See {BosonTypes.Exchange}
     */
    function fetchExchange(uint256 _exchangeId) internal view returns (bool exists, Exchange storage exchange) {
        // Get the exchange's slot
        exchange = protocolEntities().exchanges[_exchangeId];

        // Determine existence
        exists = (_exchangeId > 0 && exchange.id == _exchangeId);
    }

    /**
     * @notice Fetches a given voucher from storage by exchange id
     *
     * @param _exchangeId - the id of the exchange associated with the voucher
     * @return voucher - the voucher details. See {BosonTypes.Voucher}
     */
    function fetchVoucher(uint256 _exchangeId) internal view returns (Voucher storage voucher) {
        // Get the voucher
        voucher = protocolEntities().vouchers[_exchangeId];
    }

    /**
     * @notice Fetches a given dispute from storage by exchange id
     *
     * @param _exchangeId - the id of the exchange associated with the dispute
     * @return exists - whether the dispute exists
     * @return dispute - the dispute details. See {BosonTypes.Dispute}
     */
    function fetchDispute(
        uint256 _exchangeId
    ) internal view returns (bool exists, Dispute storage dispute, DisputeDates storage disputeDates) {
        // Cache protocol entities for reference
        ProtocolLib.ProtocolEntities storage entities = protocolEntities();

        // Get the dispute's slot
        dispute = entities.disputes[_exchangeId];

        // Get the disputeDates slot
        disputeDates = entities.disputeDates[_exchangeId];

        // Determine existence
        exists = (_exchangeId > 0 && dispute.exchangeId == _exchangeId);
    }

    /**
     * @notice Fetches a given twin from storage by id
     *
     * @param _twinId - the id of the twin
     * @return exists - whether the twin exists
     * @return twin - the twin details. See {BosonTypes.Twin}
     */
    function fetchTwin(uint256 _twinId) internal view returns (bool exists, Twin storage twin) {
        // Get the twin's slot
        twin = protocolEntities().twins[_twinId];

        // Determine existence
        exists = (_twinId > 0 && twin.id == _twinId);
    }

    /**
     * @notice Fetches a given bundle from storage by id
     *
     * @param _bundleId - the id of the bundle
     * @return exists - whether the bundle exists
     * @return bundle - the bundle details. See {BosonTypes.Bundle}
     */
    function fetchBundle(uint256 _bundleId) internal view returns (bool exists, Bundle storage bundle) {
        // Get the bundle's slot
        bundle = protocolEntities().bundles[_bundleId];

        // Determine existence
        exists = (_bundleId > 0 && bundle.id == _bundleId);
    }

    /**
     * @notice Gets offer from protocol storage, makes sure it exist and not voided
     *
     * Reverts if:
     * - Offer does not exist
     * - Offer already voided
     *
     *  @param _offerId - the id of the offer to check
     */
    function getValidOffer(uint256 _offerId) internal view returns (Offer storage offer) {
        bool exists;

        // Get offer
        (exists, offer) = fetchOffer(_offerId);

        // Offer must already exist
        if (!exists) revert NoSuchOffer();

        // Offer must not already be voided
        if (offer.voided) revert OfferHasBeenVoided();
    }

    /**
     * @notice Gets offer and seller from protocol storage
     *
     * Reverts if:
     * - Offer does not exist
     * - Offer already voided
     * - Seller assistant is not the caller
     *
     *  @param _offerId - the id of the offer to check
     *  @return offer - the offer details. See {BosonTypes.Offer}
     */
    function getValidOfferWithSellerCheck(uint256 _offerId) internal view returns (Offer storage offer) {
        // Get offer
        offer = getValidOffer(_offerId);

        // Get seller, we assume seller exists if offer exists
        (, Seller storage seller, ) = fetchSeller(offer.sellerId);

        // Caller must be seller's assistant address
        if (seller.assistant != msgSender()) revert NotAssistant();
    }

    /**
     * @notice Gets the bundle id for a given offer id.
     *
     * @param _offerId - the offer id.
     * @return exists - whether the bundle id exists
     * @return bundleId  - the bundle id.
     */
    function fetchBundleIdByOffer(uint256 _offerId) internal view returns (bool exists, uint256 bundleId) {
        // Get the bundle id
        bundleId = protocolLookups().bundleIdByOffer[_offerId];

        // Determine existence
        exists = (bundleId > 0);
    }

    /**
     * @notice Gets the bundle id for a given twin id.
     *
     * @param _twinId - the twin id.
     * @return exists - whether the bundle id exist
     * @return bundleId  - the bundle id.
     */
    function fetchBundleIdByTwin(uint256 _twinId) internal view returns (bool exists, uint256 bundleId) {
        // Get the bundle id
        bundleId = protocolLookups().bundleIdByTwin[_twinId];

        // Determine existence
        exists = (bundleId > 0);
    }

    /**
     * @notice Gets the exchange ids for a given offer id.
     *
     * @param _offerId - the offer id.
     * @return exists - whether the exchange Ids exist
     * @return exchangeIds  - the exchange Ids.
     */
    function getExchangeIdsByOffer(
        uint256 _offerId
    ) internal view returns (bool exists, uint256[] storage exchangeIds) {
        // Get the exchange Ids
        exchangeIds = protocolLookups().exchangeIdsByOffer[_offerId];

        // Determine existence
        exists = (exchangeIds.length > 0);
    }

    /**
     * @notice Make sure the caller is buyer associated with the exchange
     *
     * Reverts if
     * - caller is not the buyer associated with exchange
     *
     * @param _currentBuyer - id of current buyer associated with the exchange
     */
    function checkBuyer(uint256 _currentBuyer) internal view {
        // Get the caller's buyer account id
        (, uint256 buyerId) = getBuyerIdByWallet(msgSender());

        // Must be the buyer associated with the exchange (which is always voucher holder)
        if (buyerId != _currentBuyer) revert NotVoucherHolder();
    }

    /**
     * @notice Get a valid exchange and its associated voucher
     *
     * Reverts if
     * - Exchange does not exist
     * - Exchange is not in the expected state
     *
     * @param _exchangeId - the id of the exchange to complete
     * @param _expectedState - the state the exchange should be in
     * @return exchange - the exchange
     * @return voucher - the voucher
     */
    function getValidExchange(
        uint256 _exchangeId,
        ExchangeState _expectedState
    ) internal view returns (Exchange storage exchange, Voucher storage voucher) {
        // Get the exchange
        bool exchangeExists;
        (exchangeExists, exchange) = fetchExchange(_exchangeId);

        // Make sure the exchange exists
        if (!exchangeExists) revert NoSuchExchange();

        // Make sure the exchange is in expected state
        if (exchange.state != _expectedState) revert InvalidState();

        // Get the voucher
        voucher = fetchVoucher(_exchangeId);
    }

    /**
     * @notice Returns the current sender address.
     */
    function msgSender() internal view returns (address) {
        return EIP712Lib.msgSender();
    }

    /**
     * @notice Gets the agent id for a given offer id.
     *
     * @param _offerId - the offer id.
     * @return exists - whether the exchange id exist
     * @return agentId - the agent id.
     */
    function fetchAgentIdByOffer(uint256 _offerId) internal view returns (bool exists, uint256 agentId) {
        // Get the agent id
        agentId = protocolLookups().agentIdByOffer[_offerId];

        // Determine existence
        exists = (agentId > 0);
    }

    /**
     * @notice Fetches the offer fees from storage by offer id
     *
     * @param _offerId - the id of the offer
     * @return offerFees - the offer fees details. See {BosonTypes.OfferFees}
     */
    function fetchOfferFees(uint256 _offerId) internal view returns (BosonTypes.OfferFees storage offerFees) {
        // Get the offerFees slot
        offerFees = protocolEntities().offerFees[_offerId];
    }

    /**
     * @notice Fetches a list of twin receipts from storage by exchange id
     *
     * @param _exchangeId - the id of the exchange
     * @return exists - whether one or more twin receipt exists
     * @return twinReceipts - the list of twin receipts. See {BosonTypes.TwinReceipt}
     */
    function fetchTwinReceipts(
        uint256 _exchangeId
    ) internal view returns (bool exists, TwinReceipt[] storage twinReceipts) {
        // Get the twin receipts slot
        twinReceipts = protocolLookups().twinReceiptsByExchange[_exchangeId];

        // Determine existence
        exists = (_exchangeId > 0 && twinReceipts.length > 0);
    }

    /**
     * @notice Fetches a condition from storage by exchange id
     *
     * @param _exchangeId - the id of the exchange
     * @return exists - whether one condition exists for the exchange
     * @return condition - the condition. See {BosonTypes.Condition}
     */
    function fetchConditionByExchange(
        uint256 _exchangeId
    ) internal view returns (bool exists, Condition storage condition) {
        // Get the condition slot
        condition = protocolLookups().exchangeCondition[_exchangeId];

        // Determine existence
        exists = (_exchangeId > 0 && condition.method != EvaluationMethod.None);
    }

    /**
     * @notice calculate the protocol fee amount for a given exchange
     *
     * @param _exchangeToken - the token used for the exchange
     * @param _price - the price of the exchange
     * @return protocolFee - the protocol fee
     */
    function _getProtocolFee(address _exchangeToken, uint256 _price) internal view returns (uint256 protocolFee) {
        // Check if the exchange token is the Boson token
        if (_exchangeToken == protocolAddresses().token) {
            // Return the flatBoson fee percentage if the exchange token is the Boson token
            return protocolFees().flatBoson;
        }
        uint256 feePercentage = _getFeePercentage(_exchangeToken, _price);
        return FundsLib.applyPercent(_price, feePercentage);
    }

    /**
     * @notice calculate the protocol fee percentage for a given exchange
     *
     * @param _exchangeToken - the token used for the exchange
     * @param _price - the price of the exchange
     * @return feePercentage - the protocol fee percentage based on token price (using protocol fee table)
     */
    function _getFeePercentage(address _exchangeToken, uint256 _price) internal view returns (uint256 feePercentage) {
        if (_exchangeToken == protocolAddresses().token) revert FeeTableAssetNotSupported();

        ProtocolLib.ProtocolFees storage fees = protocolFees();
        uint256[] storage priceRanges = fees.tokenPriceRanges[_exchangeToken];
        uint256[] storage feePercentages = fees.tokenFeePercentages[_exchangeToken];

        // If the token has a custom fee table, find the appropriate percentage
        uint256 priceRangesLength = priceRanges.length;
        if (priceRangesLength > 0) {
            for (uint256 i; i < priceRangesLength - 1; ++i) {
                if (_price <= priceRanges[i]) {
                    // Return the fee percentage for the matching price range
                    return feePercentages[i];
                }
            }
            // If price exceeds all ranges, use the highest fee percentage
            return feePercentages[priceRangesLength - 1];
        }

        // If no custom fee table exists, fallback to using the default protocol percentage
        return fees.percentage;
    }

    /**
     * @notice Fetches a clone address from storage by seller id and collection index
     * If the collection index is 0, the clone address is the seller's main collection,
     * otherwise it is the clone address of the additional collection at the given index.
     *
     * @param _lookups - storage slot for protocol lookups
     * @param _sellerId - the id of the seller
     * @param _collectionIndex - the index of the collection
     * @return cloneAddress - the clone address
     */
    function getCloneAddress(
        ProtocolLib.ProtocolLookups storage _lookups,
        uint256 _sellerId,
        uint256 _collectionIndex
    ) internal view returns (address cloneAddress) {
        return
            _collectionIndex == 0
                ? _lookups.cloneAddress[_sellerId]
                : _lookups.additionalCollections[_sellerId][_collectionIndex - 1].collectionAddress;
    }

    /**
     * @notice Internal helper to get royalty information and seller for a chosen exchange.
     *
     * Reverts if exchange does not exist.
     *
     * @param _queryId - offer id or exchange id
     * @param _isExchangeId - indicates if the query represents the exchange id
     * @return royaltyInfo - list of royalty recipients and corresponding bps
     * @return royaltyInfoIndex - index of the royalty info
     * @return treasury - the seller's treasury address
     */
    function fetchRoyalties(
        uint256 _queryId,
        bool _isExchangeId
    ) internal view returns (RoyaltyInfo storage royaltyInfo, uint256 royaltyInfoIndex, address treasury) {
        RoyaltyInfo[] storage royaltyInfoAll;
        if (_isExchangeId) {
            (bool exists, Exchange storage exchange) = fetchExchange(_queryId);
            if (!exists) revert NoSuchExchange();
            _queryId = exchange.offerId;
        }

        // not using fetchOffer to reduce gas costs (limitation of royalty registry)
        ProtocolLib.ProtocolEntities storage pe = protocolEntities();
        Offer storage offer = pe.offers[_queryId];
        treasury = pe.sellers[offer.sellerId].treasury;
        royaltyInfoAll = pe.offers[_queryId].royaltyInfo;

        uint256 royaltyInfoLength = royaltyInfoAll.length;
        if (royaltyInfoLength == 0) revert NoSuchOffer();
        royaltyInfoIndex = royaltyInfoLength - 1;
        // get the last royalty info
        return (royaltyInfoAll[royaltyInfoIndex], royaltyInfoIndex, treasury);
    }

    /**
     * @notice Helper function that calculates the total royalty percentage for a given exchange
     *
     * @param _bps - storage slot for array of royalty percentages
     * @return totalBps - the total royalty percentage
     */
    function getTotalRoyaltyPercentage(uint256[] storage _bps) internal view returns (uint256 totalBps) {
        uint256 bpsLength = _bps.length;
        for (uint256 i = 0; i < bpsLength; ) {
            totalBps += _bps[i];

            unchecked {
                i++;
            }
        }
    }
}
