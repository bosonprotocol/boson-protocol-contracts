// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import {ProtocolLib} from "../libs/ProtocolLib.sol";
import {DiamondLib} from "../../diamond/DiamondLib.sol";
import {BosonTypes} from "../../domain/BosonTypes.sol";
import {BosonConstants} from "../../domain/BosonConstants.sol";
import {MetaTransactionsLib} from "../libs/MetaTransactionsLib.sol";

/**
 * @title ProtocolBase
 *
 * @notice Provides domain and common modifiers to Protocol facets
 */
abstract contract ProtocolBase is BosonTypes, BosonConstants {
    /**
     * @dev Modifier to protect initializer function from being invoked twice.
     */
    modifier onlyUnInitialized(bytes4 interfaceId) {
        ProtocolLib.ProtocolInitializers storage pi = protocolInitializers();
        require(!pi.initializedInterfaces[interfaceId], ALREADY_INITIALIZED);
        pi.initializedInterfaces[interfaceId] = true;
        _;
    }

    /**
     * @dev Modifier that checks that an offer exists
     *
     * Reverts if the offer does not exist
     */
    modifier offerExists(uint256 _offerId) {
        // Make sure the offer exists TODO: remove me, not used and not the way to check
        require(_offerId > 0 && _offerId < protocolCounters().nextOfferId, "Offer does not exist");
        _;
    }

    /**
     * @dev Modifier that checks that the caller has a specific role.
     *
     * Reverts if caller doesn't have role.
     *
     * See: {AccessController.hasRole}
     */
    modifier onlyRole(bytes32 _role) {
        DiamondLib.DiamondStorage storage ds = DiamondLib.diamondStorage();
        require(ds.accessController.hasRole(_role, msg.sender), ACCESS_DENIED);
        _;
    }

    /**
     * @dev Get the Protocol Storage slot
     *
     * @return ps the Protocol Storage slot
     */
    function protocolStorage() internal pure returns (ProtocolLib.ProtocolStorage storage ps) {
        ps = ProtocolLib.protocolStorage();
    }

    /**
     * @dev Get the Protocol Counters slot
     *
     * @return pc the Protocol Counters slot
     */
    function protocolCounters() internal pure returns (ProtocolLib.ProtocolCounters storage pc) {
        pc = ProtocolLib.protocolCounters();
    }

    /**
     * @dev Get the Protocol meta-transactions storage slot
     *
     * @return pmti the Protocol meta-transactions storage slot
     */
    function protocolMetaTxInfo() internal pure returns (ProtocolLib.ProtocolMetaTxInfo storage pmti) {
        pmti = ProtocolLib.protocolMetaTxInfo();
    }

    /**
     * @dev Get the Protocol Initializers slot
     *
     * @return pi the Protocol Initializers slot
     */
    function protocolInitializers() internal pure returns (ProtocolLib.ProtocolInitializers storage pi) {
        pi = ProtocolLib.protocolInitializers();
    }

    /**
     * @notice Gets a seller Id from storage by operator address
     *
     * @param _operator - the operator address of the seller
     * @return exists - whether the seller Id exists
     * @return sellerId  - the seller Id
     */
    function getSellerIdByOperator(address _operator) internal view returns (bool exists, uint256 sellerId) {
        // Get the seller Id
        sellerId = protocolStorage().sellerIdByOperator[_operator];

        // Determine existence
        exists = (sellerId > 0);
    }

    /**
     * @notice Gets a seller Id from storage by admin address
     *
     * @param _admin - the admin address of the seller
     * @return exists - whether the seller Id exists
     * @return sellerId  - the seller Id
     */
    function getSellerIdByAdmin(address _admin) internal view returns (bool exists, uint256 sellerId) {
        // Get the seller Id
        sellerId = protocolStorage().sellerIdByAdmin[_admin];

        // Determine existence
        exists = (sellerId > 0);
    }

    /**
     * @notice Gets a seller Id from storage by clerk address
     *
     * @param _clerk - the clerk address of the seller
     * @return exists - whether the seller Id exists
     * @return sellerId  - the seller Id
     */
    function getSellerIdByClerk(address _clerk) internal view returns (bool exists, uint256 sellerId) {
        // Get the seller Id
        sellerId = protocolStorage().sellerIdByClerk[_clerk];

        // Determine existence
        exists = (sellerId > 0);
    }

    /**
     * @notice Gets a buyer id from storage by wallet address
     *
     * @param _wallet - the wallet address of the buyer
     * @return exists - whether the buyer Id exists
     * @return buyerId  - the buyer Id
     */
    function getBuyerIdByWallet(address _wallet) internal view returns (bool exists, uint256 buyerId) {
        // Get the buyer Id
        buyerId = protocolStorage().buyerIdByWallet[_wallet];

        // Determine existence
        exists = (buyerId > 0);
    }

    /**
     * @notice Gets a group id from storage by offer id
     *
     * @param _offerId - the offer id
     * @return exists - whether the group id exists
     * @return groupId  - the group id.
     */
    function getGroupIdByOffer(uint256 _offerId) internal view returns (bool exists, uint256 groupId) {
        // Get the group Id
        groupId = protocolStorage().groupIdByOffer[_offerId];

        // Determine existence
        exists = (groupId > 0);
    }

    /**
     * @notice Fetches a given seller from storage by id
     *
     * @param _sellerId - the id of the seller
     * @return exists - whether the seller exists
     * @return seller - the seller details. See {BosonTypes.Seller}
     */
    function fetchSeller(uint256 _sellerId) internal view returns (bool exists, BosonTypes.Seller storage seller) {
        // Get the seller's slot
        seller = protocolStorage().sellers[_sellerId];

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
        // Get the buyer's's slot
        buyer = protocolStorage().buyers[_buyerId];

        // Determine existence
        exists = (_buyerId > 0 && buyer.id == _buyerId);
    }

    /**
     * @notice Fetches a given offer from storage by id
     *
     * @param _offerId - the id of the offer
     * @return exists - whether the offer exists
     * @return offer - the offer details. See {BosonTypes.Offer}
     */
    function fetchOffer(uint256 _offerId) internal view returns (bool exists, BosonTypes.Offer storage offer) {
        // Get the offer's slot
        offer = protocolStorage().offers[_offerId];

        // Determine existence
        exists = (_offerId > 0 && offer.id == _offerId);
    }

    /**
     * @notice Fetches a given group from storage by id
     *
     * @param _groupId - the id of the group
     * @return exists - whether the group exists
     * @return group - the group details. See {BosonTypes.Group}
     */
    function fetchGroup(uint256 _groupId) internal view returns (bool exists, BosonTypes.Group storage group) {
        // Get the group's slot
        group = protocolStorage().groups[_groupId];

        // Determine existence
        exists = (_groupId > 0 && group.id == _groupId);
    }

    /**
     * @notice Fetches a given exchange from storage by id
     *
     * @param _exchangeId - the id of the exchange
     * @return exists - whether the exchange exists
     * @return exchange - the exchange details. See {BosonTypes.Exchange}
     */
    function fetchExchange(uint256 _exchangeId)
        internal
        view
        returns (bool exists, BosonTypes.Exchange storage exchange)
    {
        // Get the exchange's slot
        exchange = protocolStorage().exchanges[_exchangeId];

        // Determine existence
        exists = (_exchangeId > 0 && exchange.id == _exchangeId);
    }

    /**
     * @notice Fetches a given dispute from storage by exchange id
     *
     * @param _exchangeId - the id of the exchange associated with the dispute
     * @return exists - whether the dispute exists
     * @return dispute - the dispute details. See {BosonTypes.Dispute}
     */
    function fetchDispute(uint256 _exchangeId)
    internal
    view
    returns (bool exists, BosonTypes.Dispute storage dispute)
    {
        // Get the dispute's slot
        dispute = protocolStorage().disputes[_exchangeId];

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
    function fetchTwin(uint256 _twinId) internal view returns (bool exists, BosonTypes.Twin storage twin) {
        // Get the twin's slot
        twin = protocolStorage().twins[_twinId];

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
    function fetchBundle(uint256 _bundleId) internal view returns (bool exists, BosonTypes.Bundle storage bundle) {
        // Get the bundle's slot
        bundle = protocolStorage().bundles[_bundleId];

        // Determine existence
        exists = (_bundleId > 0 && bundle.id == _bundleId);
    }

    /**
     * @notice Gets offer from protocol storage, makes sure it exist and not voided
     *
     * Reverts if:
     * - Offer does not exist
     * - Offer already voided
     * - Caller is not the seller
     *
     *  @param _offerId - the id of the offer to check
     */
    function getValidOffer(uint256 _offerId) internal view returns (Offer storage offer) {
        bool exists;
        Seller storage seller;

        // Get offer
        (exists, offer) = fetchOffer(_offerId);

        // Offer must already exist
        require(exists, NO_SUCH_OFFER);

        // Offer must not already be voided
        require(!offer.voided, OFFER_HAS_BEEN_VOIDED);

        // Get seller, we assume seller exists if offer exists
        (, seller) = fetchSeller(offer.sellerId);

        // Caller must be seller's operator address
        require(seller.operator == msg.sender, NOT_OPERATOR);
    }

    /**
     * @notice Gets the bundle id for a given offer id.
     *
     * @param _offerId - the offer Id.
     * @return exists - whether the bundle Id exists
     * @return bundleId  - the bundle Id.
     */
    function fetchBundleIdByOffer(uint256 _offerId) internal view returns (bool exists, uint256 bundleId) {
        // Get the bundle Id
        bundleId = protocolStorage().bundleIdByOffer[_offerId];

        // Determine existence
        exists = (bundleId > 0);
    }

    /**
     * @notice Gets the bundle ids for a given twin id.
     *
     * @param _twinId - the twin Id.
     * @return exists - whether the bundle Ids exist
     * @return bundleIds  - the bundle Ids.
     */
    function fetchBundleIdsByTwin(uint256 _twinId) internal view returns (bool exists, uint256[] memory bundleIds) {
        // Get the bundle Ids
        bundleIds = protocolStorage().bundleIdsByTwin[_twinId];

        // Determine existence
        exists = (bundleIds.length > 0);
    }

    /**
     * @notice Gets the exchange ids for a given offer id.
     *
     * @param _offerId - the offer Id.
     * @return exists - whether the exchange Ids exist
     * @return exchangeIds  - the exchange Ids.
     */
    function getExchangeIdsByOffer(uint256 _offerId) internal view returns (bool exists, uint256[] memory exchangeIds) {
        // Get the exchange Ids
        exchangeIds = protocolStorage().exchangeIdsByOffer[_offerId];

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
    function checkBuyer(uint256 _currentBuyer)
    internal
    view
    {
        // Get sender of the transaction
        address msgSender = MetaTransactionsLib.getCaller();

        // Get the caller's buyer account id
        uint256 buyerId;
        (, buyerId) = getBuyerIdByWallet(msgSender);

        // Must be the buyer associated with the exchange (which is always voucher holder)
        require(buyerId == _currentBuyer, NOT_VOUCHER_HOLDER);
    }

    /**
     * @notice Get a valid exchange
     *
     * Reverts if
     * - Exchange does not exist
     * - Exchange is not in the expected state
     *
     * @param _exchangeId - the id of the exchange to complete
     * @param _expectedState - the state the exchange should be in
     * @return exchange - the exchange
     */
    function getValidExchange(uint256 _exchangeId, ExchangeState _expectedState)
    internal
    view
    returns(Exchange storage exchange)
    {
        // Get the exchange
        bool exchangeExists;
        (exchangeExists, exchange) = fetchExchange(_exchangeId);

        // Make sure the exchange exists
        require(exchangeExists, NO_SUCH_EXCHANGE);

        // Make sure the exchange is in expected state
        require(exchange.state == _expectedState, INVALID_STATE);
    }
}
