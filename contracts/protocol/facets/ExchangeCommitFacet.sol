// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import "../../domain/BosonConstants.sol";
import { BosonErrors } from "../../domain/BosonErrors.sol";
import { IBosonExchangeCommitHandler } from "../../interfaces/handlers/IBosonExchangeCommitHandler.sol";
import { IBosonVoucher } from "../../interfaces/clients/IBosonVoucher.sol";
import { IDRFeeMutualizer } from "../../interfaces/clients/IDRFeeMutualizer.sol";
import { IBosonFundsEvents, IBosonFundsBaseEvents } from "../../interfaces/events/IBosonFundsEvents.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { BuyerBase } from "../bases/BuyerBase.sol";
import { OfferBase } from "../bases/OfferBase.sol";
import { DisputeBase } from "../bases/DisputeBase.sol";
import { OfferBase } from "../bases/OfferBase.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";
import { EIP712Lib } from "../libs/EIP712Lib.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC1155 } from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import { Address } from "@openzeppelin/contracts/utils/Address.sol";

/**
 * @title ExchangeCommitFacet
 *
 * @notice Handles exchange commitment and creation within the protocol.
 * This facet contains all functions related to committing to offers and creating new exchanges,
 * including buyer-initiated offers where sellers commit to buyer-created offers.
 */
contract ExchangeCommitFacet is DisputeBase, BuyerBase, OfferBase, IBosonExchangeCommitHandler {
    using Address for address;
    using Address for address payable;

    /**
     * @notice Initializes facet.
     * This function is callable only once.
     */
    function initialize() public onlyUninitialized(type(IBosonExchangeCommitHandler).interfaceId) {
        DiamondLib.addSupportedInterface(type(IBosonExchangeCommitHandler).interfaceId);
    }

    /**
     * @notice Commits to a seller-created price static offer (first step of an exchange).
     *
     * Emits a BuyerCommitted  event if successful.
     * Issues a voucher to the buyer address.
     *
     * Reverts if:
     * - The exchanges region of protocol is paused
     * - The buyers region of protocol is paused
     * - The sellers region of protocol is paused
     * - OfferId is invalid
     * - Offer price type is not static
     * - Offer has been voided
     * - Offer has expired
     * - Offer is not yet available for commits
     * - Offer's quantity available is zero
     * - Committer address is zero
     * - Committer is not a buyer account when committing to seller-created offer
     * - Committer is not a seller assistant when committing to buyer-created offer
     * - Offer exchange token is in native token and caller does not send enough
     * - Offer exchange token is in some ERC20 token and caller also sends native currency
     * - Contract at token address does not support ERC20 function transferFrom
     * - Calling transferFrom on token fails for some reason (e.g. protocol is not approved to transfer)
     * - Received ERC20 token amount differs from the expected value
     * - For seller-created offers: Buyer has less funds available than offer price
     * - For buyer-created offers: Seller has less funds available than seller deposit
     * - Offer belongs to a group with a condition
     *
     * @param _committer - the seller's or the buyer's address. The caller can commit on behalf of a buyer or a seller.
     * @param _offerId - the id of the offer to commit to
     */
    function commitToOffer(
        address payable _committer,
        uint256 _offerId
    ) public payable override exchangesNotPaused buyersNotPaused sellersNotPaused nonReentrant {
        // Make sure committer address is not zero address
        if (_committer == address(0)) revert InvalidAddress();

        Offer storage offer = getValidOffer(_offerId);
        if (offer.priceType != PriceType.Static) revert InvalidPriceType();

        // For there to be a condition, there must be a group.
        (bool exists, uint256 groupId) = getGroupIdByOffer(offer.id);
        if (exists) {
            // Get the condition
            Condition storage condition = fetchCondition(groupId);

            // Make sure group doesn't have a condition. If it does, use commitToConditionalOffer instead.
            if (condition.method != EvaluationMethod.None) revert GroupHasCondition();
        }

        commitToOfferInternal(_committer, offer, 0, false);
    }

    /**
     * @notice Commits to a buyer-created static offer with seller-specific parameters (first step of an exchange).
     *
     * Emits a BuyerInitiatedOfferSetSellerParams event if successful.
     * Emits a SellerCommitted event if successful.
     * Issues a voucher to the buyer address.
     *
     * Reverts if:
     * - The exchanges region of protocol is paused
     * - The buyers region of protocol is paused
     * - The sellers region of protocol is paused
     * - OfferId is invalid
     * - Offer price type is not static
     * - Offer has been voided
     * - Offer has expired
     * - Offer is not yet available for commits
     * - Offer's quantity available is zero
     * - Committer address is zero
     * - Committer is not a seller assistant
     * - Offer is not buyer-created
     * - Collection index is invalid for the seller
     * - Royalty recipients are not on seller's whitelist
     * - Royalty percentages are below minimum requirements
     * - Total royalty percentage exceeds maximum allowed
     * - Offer exchange token is in native token and caller does not send enough
     * - Offer exchange token is in some ERC20 token and caller also sends native currency
     * - Contract at token address does not support ERC20 function transferFrom
     * - Calling transferFrom on token fails for some reason (e.g. protocol is not approved to transfer)
     * - Received ERC20 token amount differs from the expected value
     * - Seller has less funds available than seller deposit
     * - Buyer has less funds available than offer price
     * - Offer belongs to a group with a condition
     *
     * @param _offerId - the id of the offer to commit to
     * @param _sellerParams - the seller-specific parameters (collection index, royalty info, mutualizer address)
     */
    function commitToBuyerOffer(
        uint256 _offerId,
        SellerOfferParams calldata _sellerParams
    ) external payable override exchangesNotPaused buyersNotPaused sellersNotPaused nonReentrant {
        address committer = _msgSender();

        Offer storage offer = getValidOffer(_offerId);
        if (offer.priceType != PriceType.Static) revert InvalidPriceType();
        if (offer.creator != OfferCreator.Buyer) revert InvalidOfferCreator();

        (bool sellerExists, uint256 sellerId) = getSellerIdByAssistant(committer);
        if (!sellerExists) revert NotAssistant();
        offer.sellerId = sellerId;

        {
            ProtocolLib.ProtocolLookups storage lookups = protocolLookups();
            if (_sellerParams.collectionIndex > 0) {
                if (lookups.additionalCollections[sellerId].length < _sellerParams.collectionIndex) {
                    revert NoSuchCollection();
                }
                offer.collectionIndex = _sellerParams.collectionIndex;
            }

            validateRoyaltyInfo(lookups, protocolLimits(), sellerId, _sellerParams.royaltyInfo);

            offer.royaltyInfo[0] = _sellerParams.royaltyInfo;

            if (_sellerParams.mutualizerAddress != address(0)) {
                DisputeResolutionTerms storage disputeTerms = fetchDisputeResolutionTerms(_offerId);
                disputeTerms.mutualizerAddress = _sellerParams.mutualizerAddress;
            }

            emit BuyerInitiatedOfferSetSellerParams(_offerId, sellerId, _sellerParams, committer);
        }

        commitToOfferInternal(payable(committer), offer, 0, false);
    }

    /**
     * @notice Commits to an conditional offer (first step of an exchange).
     *
     * Emits BuyerCommitted and ConditionalCommitAuthorized events if successful.
     * Issues a voucher to the buyer address.
     *
     * Reverts if:
     * - The exchanges region of protocol is paused
     * - The buyers region of protocol is paused
     * - OfferId is invalid
     * - Offer has been voided
     * - Offer has expired
     * - Offer is not yet available for commits
     * - Offer's quantity available is zero
     * - Buyer address is zero
     * - Buyer account is inactive
     * - Conditional commit requirements not met or already used
     * - Offer price is in native token and caller does not send enough
     * - Offer price is in some ERC20 token and caller also sends native currency
     * - Contract at token address does not support ERC20 function transferFrom
     * - Calling transferFrom on token fails for some reason (e.g. protocol is not approved to transfer)
     * - Received ERC20 token amount differs from the expected value
     * - Seller has less funds available than sellerDeposit
     * - Condition has a range and the token id is not within the range
     *
     * @param _buyer - the buyer's address (caller can commit on behalf of a buyer)
     * @param _offerId - the id of the offer to commit to
     * @param _tokenId - the id of the token to use for the conditional commit
     */
    function commitToConditionalOffer(
        address payable _buyer,
        uint256 _offerId,
        uint256 _tokenId
    ) external payable override exchangesNotPaused buyersNotPaused nonReentrant {
        // Make sure buyer address is not zero address
        if (_buyer == address(0)) revert InvalidAddress();

        Offer storage offer = getValidOffer(_offerId);
        if (offer.priceType != PriceType.Static) revert InvalidPriceType();

        // For there to be a condition, there must be a group.
        (bool exists, uint256 groupId) = getGroupIdByOffer(offer.id);

        // Make sure the group exists
        if (!exists) revert NoSuchGroup();

        // Get the condition
        Condition storage condition = fetchCondition(groupId);

        // Make sure the tokenId is in range
        validateConditionRange(condition, _tokenId);

        authorizeCommit(_buyer, condition, groupId, _tokenId, _offerId);

        uint256 exchangeId = commitToOfferInternal(_buyer, offer, 0, false);

        // Store the condition to be returned afterward on getReceipt function
        protocolLookups().exchangeCondition[exchangeId] = condition;
    }

    /**
     * @notice Creates an offer.
     *
     * Emits an OfferCreated, FundsEncumbered, BuyerCommitted and SellerCommitted event if successful.
     *
     * Reverts if:
     * - The offers region of protocol is paused
     * - Valid from date is greater than valid until date
     * - Valid until date is not in the future
     * - Both voucher expiration date and voucher expiration period are defined
     * - Neither of voucher expiration date and voucher expiration period are defined
     * - Voucher redeemable period is fixed, but it ends before it starts
     * - Voucher redeemable period is fixed, but it ends before offer expires
     * - Dispute period is less than minimum dispute period
     * - Resolution period is not between the minimum and the maximum resolution period
     * - Voided is set to true
     * - Available quantity is 0
     * - Dispute resolver wallet is not registered, except for absolute zero offers with unspecified dispute resolver
     * - Dispute resolver is not active, except for absolute zero offers with unspecified dispute resolver
     * - Seller is not on dispute resolver's seller allow list
     * - Dispute resolver does not accept fees in the exchange token
     * - Buyer cancel penalty is greater than price
     * - Collection does not exist
     * - When agent id is non zero:
     *   - If Agent does not exist
     * - If the sum of agent fee amount and protocol fee amount is greater than the offer fee limit determined by the protocol
     * - If the sum of agent fee amount and protocol fee amount is greater than fee limit set by seller
     * - Royalty recipient is not on seller's allow list
     * - Royalty percentage is less than the value decided by the admin
     * - Total royalty percentage is more than max royalty percentage
     * - Not enough funds can be encumbered
     *
     * @param _offer - the fully populated struct with offer id set to 0x0 and voided set to false
     * @param _offerDates - the fully populated offer dates struct
     * @param _offerDurations - the fully populated offer durations struct
     * @param _drParameters - the id of chosen dispute resolver (can be 0) and mutualizer address (0 for self-mutualization)
     * @param _agentId - the id of agent
     * @param _feeLimit - the maximum fee that seller is willing to pay per exchange (for static offers)
     * @param _committer - the address of the committer (buyer for seller-created offers, seller for buyer-created offers)
     * @param _otherCommitter - the address of the other party
     * @param _signature - signature of the other party. If the signer is EOA, it must be ECDSA signature in the format of (r,s,v) struct, otherwise, it must be a valid ERC1271 signature.
     */
    function createOfferAndCommit(
        BosonTypes.Offer memory _offer,
        BosonTypes.OfferDates calldata _offerDates,
        BosonTypes.OfferDurations calldata _offerDurations,
        BosonTypes.DRParameters calldata _drParameters,
        uint256 _agentId,
        uint256 _feeLimit,
        address payable _committer,
        address _otherCommitter,
        bytes calldata _signature
    ) external payable override exchangesNotPaused buyersNotPaused sellersNotPaused nonReentrant {
        // verify signature and potential cancellation
        verifyOffer(
            _offer,
            _offerDates,
            _offerDurations,
            _drParameters,
            _agentId,
            _feeLimit,
            _otherCommitter,
            _signature
        );

        // create an offer
        createOfferInternal(_offer, _offerDates, _offerDurations, _drParameters, _agentId, _feeLimit);

        // Deposit other committer's funds if needed
        uint256 otherCommitterId;
        uint256 otherCommitterAmount;
        if (_offer.creator == BosonTypes.OfferCreator.Buyer) {
            // Buyer-created offer: committer is the seller
            otherCommitterId = _offer.buyerId;
            otherCommitterAmount = _offer.price;
        } else {
            // Seller-created offer: committer is the buyer
            otherCommitterId = _offer.sellerId;
            otherCommitterAmount = _offer.sellerDeposit;
        }

        if (otherCommitterAmount > 0) {
            transferFundsIn(_offer.exchangeToken, _otherCommitter, otherCommitterAmount);
            increaseAvailableFunds(otherCommitterId, _offer.exchangeToken, otherCommitterAmount);
            emit IBosonFundsEvents.FundsDeposited(
                otherCommitterId,
                _otherCommitter,
                _offer.exchangeToken,
                otherCommitterAmount
            );
        }

        // commit to the offer
        commitToOffer(_committer, _offer.id);
    }

    function verifyOffer(
        BosonTypes.Offer memory _offer,
        BosonTypes.OfferDates calldata _offerDates,
        BosonTypes.OfferDurations calldata _offerDurations,
        BosonTypes.DRParameters calldata _drParameters,
        uint256 _agentId,
        uint256 _feeLimit,
        address _otherCommitter,
        bytes calldata _signature
    ) internal {
        // add data validation, i.e. offer id should be 0

        bytes32 offerHash = getOfferHash(_offer, _offerDates, _offerDurations, _drParameters, _agentId, _feeLimit);

        return;

        EIP712Lib.verify(_otherCommitter, offerHash, _signature);

        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();
        if (lookups.isOfferVoided[offerHash]) {
            revert OfferHasBeenVoided();
        }
    }

    // bytes32 private constant FULL_OFFER_TYPEHASH =
    // keccak256("Resolution(uint256 exchangeId,uint256 buyerPercentBasisPoints)");

    bytes32 private constant DR_PARAMETERS_TYPEHASH = keccak256("DRParameters(uint256 id,address mutualizer)");
    bytes32 private constant OFFER_TYPEHASH =
        keccak256(
            "Offer(uint256 id,uint256 sellerId,uint256 price,uint256 sellerDeposit,uint256 buyerCancelPenalty,uint256 quantityAvailable,address exchangeToken,uint8 priceType,string metadataUri,string metadataHash,bool voided,uint256 collectionIndex,RoyaltyInfo[] royaltyInfo,uint8 creator,uint256 buyerId)RoyaltyInfo(address recipient,uint256 percentage)"
        );
    bytes32 private constant OFFER_DATES_TYPEHASH =
        keccak256(
            "OfferDates(uint256 validFrom,uint256 validUntil,uint256 voucherRedeemableFrom,uint256 voucherRedeemableUntil)"
        );
    bytes32 private constant OFFER_DURATIONS_TYPEHASH =
        keccak256("OfferDurations(uint256 disputePeriod,uint256 voucherValid,uint256 resolutionPeriod)");
    bytes32 private constant FULL_OFFER_TYPEHASH =
        keccak256(
            "FullOffer(Offer offer,OfferDates offerDates,OfferDurations offerDurations,DRParameters drParameters,uint256 agentId,uint256 feeLimit)"
        );

    function getOfferHash(
        BosonTypes.Offer memory _offer,
        BosonTypes.OfferDates calldata _offerDates,
        BosonTypes.OfferDurations calldata _offerDurations,
        BosonTypes.DRParameters calldata _drParameters,
        uint256 _agentId,
        uint256 _feeLimit
    ) internal pure returns (bytes32) {
        // offer id should be 0

        return
            keccak256(
                abi.encode(
                    OFFER_TYPEHASH,
                    keccak256(abi.encode(_offer)),
                    keccak256(abi.encode(_offerDates)),
                    keccak256(abi.encode(_offerDurations)),
                    keccak256(abi.encode(_drParameters)),
                    _agentId,
                    _feeLimit
                )
            );
    }

    /**
     * @notice Commits to an offer. Helper function reused by commitToOffer and onPremintedVoucherTransferred.
     *
     * Emits a BuyerCommitted or SellerCommitted event if successful.
     * Issues a voucher to the buyer address for non preminted offers.
     *
     * Reverts if:
     * - Offer has expired
     * - Offer is not yet available for commits
     * - Offer's quantity available is zero [for non preminted offers]
     * - Committer is not a buyer account when committing to seller-created offer
     * - Committer is not a seller assistant when committing to buyer-created offer
     * - Buyer is token-gated (conditional commit requirements not met or already used)
     * - For non preminted offers:
     *   - Offer exchange token is in native token and caller does not send enough
     *   - Offer exchange token is in some ERC20 token and caller also sends native currency
     *   - Contract at token address does not support ERC20 function transferFrom
     *   - Calling transferFrom on token fails for some reason (e.g. protocol is not approved to transfer)
     *   - Received ERC20 token amount differs from the expected value
     *   - For seller-created offers: Buyer has less funds available than offer price
     *   - For buyer-created offers: Seller has less funds available than seller deposit
     * - For preminted offers:
     *   - Exchange aldready exists
     *   - Seller has less funds available than sellerDeposit and price for preminted offers that price type is static
     *
     * @param _committer - the committer's address (buyer for seller-created offers, seller for buyer-created offers)
     * @param _offer - storage pointer to the offer
     * @param _exchangeId - the id of the exchange
     * @param _isPreminted - whether the offer is preminted
     * @return exchangeId - the id of the exchange
     */
    function commitToOfferInternal(
        address payable _committer,
        Offer storage _offer,
        uint256 _exchangeId,
        bool _isPreminted
    ) internal returns (uint256) {
        uint256 _offerId = _offer.id;
        // Make sure offer is available, expired, or sold out
        OfferDates storage offerDates = fetchOfferDates(_offerId);
        if (block.timestamp < offerDates.validFrom) revert OfferNotAvailable();
        if (block.timestamp > offerDates.validUntil) revert OfferHasExpired();

        if (!_isPreminted) {
            // For non-preminted offers, quantityAvailable must be greater than zero, since it gets decremented
            if (_offer.quantityAvailable == 0) revert OfferSoldOut();

            // Get next exchange id for non-preminted offers
            _exchangeId = protocolCounters().nextExchangeId++;
        } else {
            // Exchange must not exist already
            (bool exists, ) = fetchExchange(_exchangeId);

            if (exists) revert ExchangeAlreadyExists();
        }

        uint256 buyerId;

        if (_offer.creator == OfferCreator.Buyer) {
            // For buyer-created offers, buyer ID is stored in the offer
            buyerId = _offer.buyerId;
            // Encumber seller deposit (seller is committing)
            encumberFunds(_offerId, _offer.sellerId, _offer.sellerDeposit, _isPreminted, _offer.priceType);
        } else {
            buyerId = getValidBuyer(_committer);
            // Encumber buyer payment (buyer is committing)
            encumberFunds(_offerId, buyerId, _offer.price, _isPreminted, _offer.priceType);
        }

        // Create and store a new exchange
        Exchange storage exchange = protocolEntities().exchanges[_exchangeId];
        exchange.id = _exchangeId;
        exchange.offerId = _offerId;
        exchange.buyerId = buyerId;
        exchange.state = ExchangeState.Committed;

        // Handle DR fee collection
        {
            // Get dispute resolution terms to get the dispute resolver ID
            DisputeResolutionTerms storage disputeTerms = fetchDisputeResolutionTerms(_offerId);

            uint256 drFeeAmount = disputeTerms.feeAmount;

            // Handle DR fee collection if fee exists
            if (drFeeAmount > 0) {
                handleDRFeeCollection(_exchangeId, _offer, disputeTerms, drFeeAmount);
                exchange.mutualizerAddress = disputeTerms.mutualizerAddress;
            }
        }

        // Create and store a new voucher
        Voucher storage voucher = protocolEntities().vouchers[_exchangeId];
        voucher.committedDate = block.timestamp;

        // Operate in a block to avoid "stack too deep" error
        {
            // Determine the time after which the voucher can be redeemed
            uint256 startDate = (block.timestamp >= offerDates.voucherRedeemableFrom)
                ? block.timestamp
                : offerDates.voucherRedeemableFrom;

            // Determine the time after which the voucher can no longer be redeemed
            voucher.validUntilDate = (offerDates.voucherRedeemableUntil > 0)
                ? offerDates.voucherRedeemableUntil
                : startDate + fetchOfferDurations(_offerId).voucherValid;
        }

        // Operate in a block to avoid "stack too deep" error
        {
            // Cache protocol lookups for reference
            ProtocolLib.ProtocolLookups storage lookups = protocolLookups();
            // Map the offerId to the exchangeId as one-to-many
            lookups.exchangeIdsByOffer[_offerId].push(_exchangeId);

            // Shouldn't decrement if offer is preminted or unlimited
            if (!_isPreminted) {
                if (_offer.quantityAvailable != type(uint256).max) {
                    // Decrement offer's quantity available
                    _offer.quantityAvailable--;
                }

                // Issue voucher, unless it already exist (for preminted offers)
                IBosonVoucher bosonVoucher = IBosonVoucher(
                    getCloneAddress(lookups, _offer.sellerId, _offer.collectionIndex)
                );
                uint256 tokenId = _exchangeId | (_offerId << 128);

                // Get buyer wallet address for voucher issuance
                address payable buyerWallet;
                if (_offer.creator == OfferCreator.Buyer) {
                    // For buyer-created offers, get the buyer's wallet from stored buyerId
                    (, Buyer storage buyer) = fetchBuyer(buyerId);
                    buyerWallet = buyer.wallet;
                } else {
                    // For seller-created offers, committer is the buyer
                    buyerWallet = _committer;
                }

                bosonVoucher.issueVoucher(tokenId, buyerWallet);
            }

            lookups.voucherCount[buyerId]++;
        }

        // Notify watchers of state change
        if (_offer.creator == OfferCreator.Buyer) {
            // Buyer-created offer: emit SellerCommitted event
            emit SellerCommitted(_offerId, _offer.sellerId, _exchangeId, exchange, voucher, _msgSender());
        } else {
            // Seller-created offer: emit BuyerCommitted event
            emit BuyerCommitted(_offerId, buyerId, _exchangeId, exchange, voucher, _msgSender());
        }

        return _exchangeId;
    }

    /**
     * @notice Handle pre-minted voucher transfer
     *
     * Reverts if:
     * - The exchanges region of protocol is paused
     * - The buyers region of protocol is paused
     * - Caller is not a clone address associated with the seller
     * - Incoming voucher clone address is not the caller
     * - Offer price is discovery, transaction is not starting from protocol nor seller is _from address
     * - Any reason that ExchangeHandler commitToOfferInternal reverts. See ExchangeHandler.commitToOfferInternal
     *
     * N.B. This method is not protected with reentrancy guard, since it clashes with price discovery flows.
     * Given that it does not rely on _msgSender() for authentication and it does not modify it, it is safe to leave it unprotected.
     * In case of reentrancy the only inconvenience that could happen is that `executedBy` field in `BuyerCommitted` event would not be set correctly.
     *
     * @param _tokenId - the voucher id
     * @param _to - the receiver address
     * @param _from - the address of current owner
     * @param _rangeOwner - the address of the preminted range owner
     * @return committed - true if the voucher was committed
     */
    function onPremintedVoucherTransferred(
        uint256 _tokenId,
        address payable _to,
        address _from,
        address _rangeOwner
    ) external override buyersNotPaused exchangesNotPaused returns (bool committed) {
        // Cache protocol status for reference
        ProtocolLib.ProtocolStatus storage ps = protocolStatus();

        // Derive the offer id
        uint256 offerId = _tokenId >> 128;

        // Derive the exchange id
        uint256 exchangeId = _tokenId & type(uint128).max;

        // Get the offer
        Offer storage offer = getValidOffer(offerId);

        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();
        address bosonVoucher = getCloneAddress(lookups, offer.sellerId, offer.collectionIndex);

        // Make sure that the voucher was issued on the clone that is making a call
        if (msg.sender != bosonVoucher) revert AccessDenied();

        (bool conditionExists, uint256 groupId) = getGroupIdByOffer(offerId);

        if (conditionExists) {
            // Get the condition
            Condition storage condition = fetchCondition(groupId);
            EvaluationMethod method = condition.method;

            if (method != EvaluationMethod.None) {
                uint256 tokenId = 0;

                // Allow commiting only to unambigous conditions, i.e. conditions with a single token id
                if (method == EvaluationMethod.SpecificToken || condition.tokenType == TokenType.MultiToken) {
                    uint256 minTokenId = condition.minTokenId;
                    uint256 maxTokenId = condition.maxTokenId;

                    if (minTokenId != maxTokenId && maxTokenId != 0) revert CannotCommit(); // legacy conditions have maxTokenId == 0

                    // Uses token id from the condition
                    tokenId = minTokenId;
                }

                authorizeCommit(_to, condition, groupId, tokenId, offerId);

                // Store the condition to be returned afterward on getReceipt function
                lookups.exchangeCondition[exchangeId] = condition;
            }
        }

        if (offer.priceType == PriceType.Discovery) {
            //  transaction start from `commitToPriceDiscoveryOffer`, should commit
            if (ps.incomingVoucherCloneAddress != address(0)) {
                // During price discovery, the voucher is firs transferred to the protocol, which should
                // not resulte in a commit yet. The commit should happen when the voucher is transferred
                // from the protocol to the buyer.
                if (_to == protocolAddresses().priceDiscovery) {
                    // Avoid reentrancy
                    if (ps.incomingVoucherId != 0) revert IncomingVoucherAlreadySet();

                    // Store the information about incoming voucher
                    ps.incomingVoucherId = _tokenId;
                } else {
                    if (ps.incomingVoucherId == 0) {
                        // Happens in wrapped voucher vase
                        ps.incomingVoucherId = _tokenId;
                    } else {
                        // In other cases voucher was already once transferred to the protocol,
                        // so ps.incomingVoucherId is set already. The incoming _tokenId must match.
                        if (ps.incomingVoucherId != _tokenId) revert TokenIdMismatch();
                    }
                    commitToOfferInternal(_to, offer, exchangeId, true);

                    committed = true;
                }

                return committed;
            }

            // If `onPremintedVoucherTransferred` is invoked without `commitToPriceDiscoveryOffer` first,
            // we reach this point. This can happen in the following scenarios:
            // 1. The preminted voucher owner is transferring the voucher to PD contract ["deposit"]
            // 2. The PD is transferring the voucher back to the original owner ["withdraw"]. Happens if voucher was not sold.
            // 3. The PD is transferring the voucher to the buyer ["buy"]. Happens if voucher was sold.
            // 4. The preminted voucher owner is transferring the voucher "directly" to the buyer.

            // 1. and 2. are allowed, while 3. and 4. and must revert. 3. and 4. should be executed via `commitToPriceDiscoveryOffer`
            if (_from == _rangeOwner) {
                // case 1. ["deposit"]
                // Prevent direct transfer to EOA (case 4.)
                if (!_to.isContract()) revert VoucherTransferNotAllowed();
            } else {
                // Case 2. ["withdraw"]
                // Prevent transfer to the buyer (case 3.)
                if (_to != _rangeOwner) revert VoucherTransferNotAllowed();
            }
        } else if (offer.priceType == PriceType.Static) {
            // If price type is static, transaction can start from anywhere
            commitToOfferInternal(_to, offer, exchangeId, true);
            committed = true;
        }
    }

    /**
     * @notice Tells if buyer is elligible to commit to conditional offer
     * Returns the eligibility status, the number of used commits and the maximal number of commits to the conditional offer.
     *
     * Unconditional offers do not have maximal number of commits, so the returned value will always be 0.
     *
     * This method does not check if the timestamp is within the offer's validity period or if the quantity available is greater than 0.
     *
     * N.B. Unmined transaction might affect the eligibility status.
     *
     * Reverts if:
     * - The offer does not exist
     * - The offer is voided
     * - The external call to condition contract reverts
     *
     * @param _buyer buyer address
     * @param _offerId - the id of the offer
     * @param _tokenId - the id of conditional token
     * @return isEligible - true if buyer is eligible to commit
     * @return commitCount - the current number of commits to the conditional offer
     * @return maxCommits - the maximal number of commits to the conditional offer
     */
    function isEligibleToCommit(
        address _buyer,
        uint256 _offerId,
        uint256 _tokenId
    ) external view override returns (bool isEligible, uint256 commitCount, uint256 maxCommits) {
        Offer storage offer = getValidOffer(_offerId);

        (bool exists, uint256 groupId) = getGroupIdByOffer(offer.id);
        if (exists) {
            // Get the condition
            Condition storage condition = fetchCondition(groupId);
            if (condition.method == EvaluationMethod.None) return (true, 0, 0);

            // Make sure the tokenId is in range
            validateConditionRange(condition, _tokenId);

            // Cache protocol lookups for reference
            ProtocolLib.ProtocolLookups storage lookups = protocolLookups();

            mapping(uint256 => uint256) storage conditionalCommits = condition.gating == GatingType.PerTokenId
                ? lookups.conditionalCommitsByTokenId[_tokenId]
                : lookups.conditionalCommitsByAddress[_buyer];

            // How many times has been committed to offers in the group?
            commitCount = conditionalCommits[groupId];
            maxCommits = condition.maxCommits;

            if (commitCount >= maxCommits) return (false, commitCount, maxCommits);

            isEligible = condition.method == EvaluationMethod.Threshold
                ? holdsThreshold(_buyer, condition, _tokenId)
                : holdsSpecificToken(_buyer, condition, _tokenId);

            return (isEligible, commitCount, maxCommits);
        }

        return (true, 0, 0);
    }

    /**
     * @notice Authorizes the potential buyer to commit to an offer
     *
     * Anyone can commit to an unconditional offer, and no state change occurs here.
     *
     * However, if the offer is conditional, we must:
     *   - determine if the buyer is allowed to commit
     *   - increment the count of commits to the group made by the buyer address
     *
     * Conditions are associated with offers via groups. One or more offers can be
     * placed in a group and a single condition applied to the entire group. Thus:
     *   - If a buyer commits to one offer in a group with a condition, it counts
     *     against the buyer's allowable commits for the whole group.
     *   - If the buyer has already committed the maximum number of times for the
     *     group, the buyer can't commit again to any of its offers.
     *
     * The buyer is allowed to commit if no group or condition is set for this offer.
     *
     * Emits ConditionalCommitAuthorized if successful.
     *
     * Reverts if:
     * - Allowable commits to the group are exhausted
     * - Buyer does not meet the condition
     *
     * @param _buyer buyer address
     * @param _condition - the condition to check
     * @param _groupId - the group id
     * @param _tokenId - the token id
     * @param _offerId - the offer id
     */
    function authorizeCommit(
        address _buyer,
        Condition storage _condition,
        uint256 _groupId,
        uint256 _tokenId,
        uint256 _offerId
    ) internal {
        // Cache protocol lookups for reference
        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();

        GatingType gating = _condition.gating;
        mapping(uint256 => uint256) storage conditionalCommits = gating == GatingType.PerTokenId
            ? lookups.conditionalCommitsByTokenId[_tokenId]
            : lookups.conditionalCommitsByAddress[_buyer];

        // How many times has been committed to offers in the group?
        uint256 commitCount = conditionalCommits[_groupId];
        uint256 maxCommits = _condition.maxCommits;

        if (commitCount >= maxCommits) revert MaxCommitsReached();

        bool allow = _condition.method == EvaluationMethod.Threshold
            ? holdsThreshold(_buyer, _condition, _tokenId)
            : holdsSpecificToken(_buyer, _condition, _tokenId);

        if (!allow) revert CannotCommit();

        // Increment number of commits to the group
        conditionalCommits[_groupId] = ++commitCount;

        emit ConditionalCommitAuthorized(_offerId, gating, _buyer, _tokenId, commitCount, maxCommits);
    }

    /**
     * @notice Checks if the buyer has the required balance of the conditional token.
     *
     * @param _buyer - address of potential buyer
     * @param _condition - the condition to be evaluated
     * @param _tokenId - the token id. Valid only for ERC1155 tokens.
     *
     * @return bool - true if buyer meets the condition
     */
    function holdsThreshold(
        address _buyer,
        Condition storage _condition,
        uint256 _tokenId
    ) internal view returns (bool) {
        uint256 balance;

        if (_condition.tokenType == TokenType.MultiToken) {
            balance = IERC1155(_condition.tokenAddress).balanceOf(_buyer, _tokenId);
        } else if (_condition.tokenType == TokenType.NonFungibleToken) {
            balance = IERC721(_condition.tokenAddress).balanceOf(_buyer);
        } else {
            balance = IERC20(_condition.tokenAddress).balanceOf(_buyer);
        }

        return balance >= _condition.threshold;
    }

    /**
     * @notice If token is ERC721, checks if the buyer owns the token. If token is ERC1155, checks if the buyer has the required balance, i.e at least the threshold.
     *
     * @param _buyer - address of potential buyer
     * @param _condition - the condition to be evaluated
     * @param _tokenId - the token id that buyer is supposed to own
     *
     * @return bool - true if buyer meets the condition
     */
    function holdsSpecificToken(
        address _buyer,
        Condition storage _condition,
        uint256 _tokenId
    ) internal view returns (bool) {
        return IERC721(_condition.tokenAddress).ownerOf(_tokenId) == _buyer;
    }

    /**
     * @notice Checks if the token id is inside condition range.
     *
     * Reverts if:
     * - Evaluation method is none
     * - Evaluation method is specific token or multitoken and token id is not in range
     * - Evaluation method is threshold, token type is not a multitoken and token id is not zero
     *
     * @param _condition - storage pointer to the condition
     * @param _tokenId - the id of the conditional token
     */
    function validateConditionRange(Condition storage _condition, uint256 _tokenId) internal view {
        EvaluationMethod method = _condition.method;
        bool isMultitoken = _condition.tokenType == TokenType.MultiToken;

        if (method == EvaluationMethod.None) revert GroupHasNoCondition();

        if (method == EvaluationMethod.SpecificToken || isMultitoken) {
            // In this cases, the token id is specified by the caller must be within the range of the condition
            uint256 minTokenId = _condition.minTokenId;
            uint256 maxTokenId = _condition.maxTokenId;
            if (maxTokenId == 0) maxTokenId = minTokenId; // legacy conditions have maxTokenId == 0

            if (_tokenId < minTokenId || _tokenId > maxTokenId) revert TokenIdNotInConditionRange();
        }

        // ERC20 and ERC721 threshold does not require a token id
        if (method == EvaluationMethod.Threshold && !isMultitoken) {
            if (_tokenId != 0) revert InvalidTokenId();
        }
    }

    /**
     * @notice Handles DR fee collection from mutualizer or seller's pool
     *
     * @param _exchangeId - exchange id
     * @param _offer - offer struct
     * @param _disputeTerms - dispute resolution terms
     * @param _drFeeAmount - amount of DR fee to collect
     */
    function handleDRFeeCollection(
        uint256 _exchangeId,
        Offer storage _offer,
        DisputeResolutionTerms storage _disputeTerms,
        uint256 _drFeeAmount
    ) internal {
        address mutualizer = _disputeTerms.mutualizerAddress;
        address exchangeToken = _offer.exchangeToken;
        if (mutualizer == address(0)) {
            // Self-mutualize: take fee from seller's pool
            decreaseAvailableFunds(_offer.sellerId, _offer.exchangeToken, _drFeeAmount);
        } else {
            // Use mutualizer: request fee
            uint256 balanceBefore = getBalance(exchangeToken);

            // Request DR fee from mutualizer
            bool success = IDRFeeMutualizer(mutualizer).requestDRFee(
                _offer.sellerId,
                _drFeeAmount,
                exchangeToken,
                _exchangeId,
                _disputeTerms.disputeResolverId
            );

            uint256 balanceAfter = getBalance(exchangeToken);

            uint256 feeTransferred = balanceAfter - balanceBefore;

            if (!success || feeTransferred != _drFeeAmount) {
                revert BosonErrors.DRFeeMutualizerCannotProvideCoverage();
            }
        }

        // Emit event for DR fee request
        emit IBosonFundsBaseEvents.DRFeeRequested(
            _exchangeId,
            exchangeToken,
            _drFeeAmount,
            _disputeTerms.mutualizerAddress,
            msg.sender
        );
    }
}
