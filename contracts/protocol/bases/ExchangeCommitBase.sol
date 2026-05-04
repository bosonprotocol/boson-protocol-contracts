// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.35;

import "../../domain/BosonConstants.sol";
import { BosonErrors } from "../../domain/BosonErrors.sol";
import { IBosonExchangeEvents } from "../../interfaces/events/IBosonExchangeEvents.sol";
import { IBosonFundsBaseEvents } from "../../interfaces/events/IBosonFundsEvents.sol";
import { IBosonOfferEvents } from "../../interfaces/events/IBosonOfferEvents.sol";
import { IBosonVoucher } from "../../interfaces/clients/IBosonVoucher.sol";
import { IDRFeeMutualizer } from "../../interfaces/clients/IDRFeeMutualizer.sol";
import { BuyerBase } from "./BuyerBase.sol";
import { OfferBase } from "./OfferBase.sol";
import { GroupBase } from "./GroupBase.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";
import { EIP712Lib } from "../libs/EIP712Lib.sol";
import { TokenTransferAuthorizationLib } from "../libs/TokenTransferAuthorizationLib.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC1155 } from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

/**
 * @title ExchangeCommitBase
 *
 * @notice Shared commit-related helper functions used by both ExchangeCommitFacet and any facet
 * that needs to atomically commit on the buyer's behalf (e.g. orchestration that combines
 * commit with redeem).
 *
 * Centralizes:
 *  - {commitToOfferInternal} — encumbers funds, creates the exchange/voucher and issues the NFT.
 *  - {commitToStaticOfferShared} / {commitToConditionalOfferShared} — wrappers used by both
 *    public {commitToOffer}/{commitToConditionalOffer} and the orchestration commit-and-redeem
 *    variants, so the validation+commit logic exists in one place.
 *  - {prepareOfferForCommit} — verifies the FullOffer signature, creates the offer + group on
 *    first use, and deposits the offer creator's funds. Reused by {createOfferAndCommit} and
 *    its commit-and-redeem orchestration counterpart.
 *  - {verifyOffer} — validates an EIP-712 / ERC1271 signature over a FullOffer.
 *  - {authorizeCommit} — token-gating checks for conditional offers.
 *  - {addSellerParametersToBuyerOffer} — applies seller-side parameters to a buyer-created offer.
 *  - DR-fee collection and condition-range validation.
 */
contract ExchangeCommitBase is BuyerBase, OfferBase, GroupBase, IBosonExchangeEvents {
    /**
     * @notice Validates a static, non-conditional offer and commits to it.
     *
     * Shared body of {commitToOffer} and the orchestration {commitToOfferAndRedeemVoucher}.
     * The caller is responsible for any additional access control (e.g. verifying the
     * committer is non-zero) and for setting modifiers like nonReentrant / pause regions.
     *
     * Reverts if:
     * - The offer's price type is not Static
     * - The offer is associated with a group that has a non-empty condition
     *   (caller should use the conditional-offer entry point instead)
     * - Any reason that {commitToOfferInternal} reverts
     *
     * @param _committer - the buyer's wallet (or seller assistant for buyer-created offers)
     * @param _offerId - the id of the offer to commit to
     * @return exchangeId - the id of the newly created exchange
     */
    function commitToStaticOfferShared(
        address payable _committer,
        uint256 _offerId
    ) internal returns (uint256 exchangeId) {
        Offer storage offer = getValidOffer(_offerId);
        if (offer.priceType != PriceType.Static) revert InvalidPriceType();

        // For there to be a condition, there must be a group.
        (bool exists, uint256 groupId) = getGroupIdByOffer(offer.id);
        if (exists) {
            Condition storage condition = fetchCondition(groupId);
            // Conditional offers must use the conditional-offer entry point.
            if (condition.method != EvaluationMethod.None) revert GroupHasCondition();
        }

        return commitToOfferInternal(_committer, offer, 0, false);
    }

    /**
     * @notice Validates a token-gated (conditional) static offer and commits to it.
     *
     * Shared body of {commitToConditionalOffer} and the orchestration
     * {commitToConditionalOfferAndRedeemVoucher}. Stores the condition snapshot on the
     * exchange so {getReceipt} can return it.
     *
     * Reverts if:
     * - The offer's price type is not Static
     * - The offer is buyer-created and `_allowBuyerCreated` is false
     * - The offer is not associated with a group / has no condition
     * - The token id is not in the condition's range
     * - The buyer does not satisfy the condition (or has reached `maxCommits`)
     * - Any reason that {commitToOfferInternal} reverts
     *
     * @param _committer - the committer's wallet (buyer for seller-created offers, seller assistant for buyer-created)
     * @param _offerId - the id of the offer to commit to
     * @param _tokenId - the id of the conditional token used to satisfy the condition
     * @param _allowBuyerCreated - if false, reverts with OfferCreatorMustBeSeller for buyer-created offers
     * @return exchangeId - the id of the newly created exchange
     */
    function commitToConditionalOfferShared(
        address payable _committer,
        uint256 _offerId,
        uint256 _tokenId,
        bool _allowBuyerCreated
    ) internal returns (uint256 exchangeId) {
        Offer storage offer = getValidOffer(_offerId);
        if (offer.priceType != PriceType.Static) revert InvalidPriceType();

        (bool exists, uint256 groupId) = getGroupIdByOffer(offer.id);
        if (!exists) revert NoSuchGroup();

        Condition storage condition = fetchCondition(groupId);
        validateConditionRange(condition, _tokenId);

        address buyerAddress;
        if (offer.creator == OfferCreator.Buyer) {
            if (!_allowBuyerCreated) revert OfferCreatorMustBeSeller();
            (, Buyer storage buyer) = fetchBuyer(offer.buyerId);
            buyerAddress = buyer.wallet;

            // For buyer-created offers, group sellerId is originally 0, so update it from the offer.
            protocolEntities().groups[groupId].sellerId = offer.sellerId;
        } else {
            buyerAddress = _committer;
        }
        authorizeCommit(buyerAddress, condition, groupId, _tokenId, _offerId);

        exchangeId = commitToOfferInternal(_committer, offer, 0, false);

        // Snapshot the condition for getReceipt
        protocolLookups().exchangeCondition[exchangeId] = condition;
    }

    /**
     * @notice Verifies a FullOffer signature, creates the offer (and a group when the offer
     * carries a non-empty condition) on first use, and deposits the offer creator's funds
     * if `_fullOffer.useDepositedFunds` is false.
     *
     * Shared body of {createOfferAndCommit} and the orchestration {createOfferCommitAndRedeem}.
     * The commit step itself is left to the caller so each entry point can keep its own
     * modifier set (e.g. avoiding double nonReentrant guards).
     *
     * Reverts if:
     * - The offer signature is invalid (see {verifyOffer})
     * - The offer was previously voided
     * - Any reason that {createOfferInternal} or {createGroupInternal} reverts
     *
     * @param _fullOffer - the fully populated struct describing the offer to create or look up
     * @param _offerCreator - the address that signed the offer (must match the offer's seller or buyer)
     * @param _signature - signature of the offer creator over the FullOffer hash
     * @return offerId - the id of the (new or existing) offer ready to be committed to
     */
    function prepareOfferForCommit(
        BosonTypes.FullOffer calldata _fullOffer,
        address _offerCreator,
        bytes calldata _signature
    ) internal returns (uint256 offerId) {
        bytes32 offerHash;
        (offerHash, offerId) = verifyOffer(_fullOffer, _offerCreator, _signature);

        if (offerId == 0) {
            offerId = createOfferInternal(
                _fullOffer.offer,
                _fullOffer.offerDates,
                _fullOffer.offerDurations,
                _fullOffer.drParameters,
                _fullOffer.agentId,
                _fullOffer.feeLimit,
                false
            );
            protocolLookups().offerIdByHash[offerHash] = offerId;

            if (_fullOffer.condition.method != BosonTypes.EvaluationMethod.None) {
                // Construct new group; group id of 0 is ignored by createGroupInternal.
                Group memory group;
                group.sellerId = _fullOffer.offer.sellerId;
                group.offerIds = new uint256[](1);
                group.offerIds[0] = offerId;

                createGroupInternal(group, _fullOffer.condition, false);
            }
        }

        if (!_fullOffer.useDepositedFunds) {
            uint256 offerCreatorId;
            uint256 offerCreatorAmount;
            if (_fullOffer.offer.creator == OfferCreator.Buyer) {
                // Buyer-created offer: the offer creator pre-funds the price.
                offerCreatorId = _fullOffer.offer.buyerId;
                offerCreatorAmount = _fullOffer.offer.price;
            } else {
                // Seller-created offer: the offer creator pre-funds the seller deposit.
                offerCreatorId = _fullOffer.offer.sellerId;
                offerCreatorAmount = _fullOffer.offer.sellerDeposit;
            }

            // transferFundsIn discards the queue slot internally when
            // offerCreatorAmount == 0, so the off-chain caller can supply a
            // queue whose layout is independent of runtime amounts.
            transferFundsIn(_fullOffer.offer.exchangeToken, _offerCreator, offerCreatorAmount);

            if (offerCreatorAmount > 0) {
                increaseAvailableFunds(offerCreatorId, _fullOffer.offer.exchangeToken, offerCreatorAmount);
                emit IBosonFundsBaseEvents.FundsDeposited(
                    offerCreatorId,
                    _offerCreator,
                    _fullOffer.offer.exchangeToken,
                    offerCreatorAmount
                );
            }
        } else {
            // useDepositedFunds=true: offer-creator pull is bypassed entirely.
            // Discard the queue slot reserved for it so the queue layout stays
            // uniform across this flag.
            TokenTransferAuthorizationLib.discardNext();
        }
    }

    /**
     * @notice Verifies an offer and its signature.
     *
     * Reverts if:
     * - Offer is not valid
     * - Offer has been voided
     * - Signature is invalid. Refer to EIP712Lib.verify for details
     */
    function verifyOffer(
        BosonTypes.FullOffer calldata _fullOffer,
        address _offerCreator,
        bytes calldata _signature
    ) internal returns (bytes32 offerHash, uint256 offerId) {
        if (
            _fullOffer.offer.id != 0 ||
            _fullOffer.offer.royaltyInfo.length != 1 ||
            _fullOffer.offer.priceType != BosonTypes.PriceType.Static
        ) revert InvalidOffer();

        offerHash = getOfferHashInternal(_fullOffer);

        offerId = protocolLookups().offerIdByHash[offerHash];
        if (offerId == 0) {
            if (_fullOffer.offer.creator == OfferCreator.Seller) {
                (, uint256 sellerId) = getSellerIdByAssistant(_offerCreator);
                if (sellerId != _fullOffer.offer.sellerId) {
                    revert NotAssistant();
                }
            } else if (_fullOffer.offer.creator == OfferCreator.Buyer) {
                uint256 buyerId = getValidBuyer(payable(_offerCreator));
                if (buyerId != _fullOffer.offer.buyerId) {
                    revert NotBuyerWallet();
                }
            }
            EIP712Lib.verify(_offerCreator, offerHash, _signature);
        } else if (offerId == VOIDED_OFFER_ID) {
            revert OfferHasBeenVoided();
        }
    }

    /**
     * @notice Commits to an offer (shared body of commitToOffer / commitToConditionalOffer / commitToBuyerOffer / onPremintedVoucherTransferred).
     *
     * @param _committer - committer's address (buyer for seller-created offers, seller for buyer-created offers)
     * @param _offer - storage pointer to the offer
     * @param _exchangeId - the id of the exchange (only meaningful for preminted)
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
        OfferDates storage offerDates = fetchOfferDates(_offerId);
        if (block.timestamp < offerDates.validFrom) revert OfferNotAvailable();
        if (block.timestamp > offerDates.validUntil) revert OfferHasExpired();

        if (!_isPreminted) {
            if (_offer.quantityAvailable == 0) revert OfferSoldOut();
            _exchangeId = protocolCounters().nextExchangeId++;
        } else {
            (bool exists, ) = fetchExchange(_exchangeId);
            if (exists) revert ExchangeAlreadyExists();
        }

        uint256 buyerId;

        if (_offer.creator == OfferCreator.Buyer) {
            buyerId = _offer.buyerId;
            encumberFunds(_offerId, _offer.sellerId, _offer.sellerDeposit, _isPreminted, _offer.priceType);
        } else {
            buyerId = getValidBuyer(_committer);
            encumberFunds(_offerId, buyerId, _offer.price, _isPreminted, _offer.priceType);
        }

        Exchange storage exchange = protocolEntities().exchanges[_exchangeId];
        exchange.id = _exchangeId;
        exchange.offerId = _offerId;
        exchange.buyerId = buyerId;
        exchange.state = ExchangeState.Committed;

        {
            DisputeResolutionTerms storage disputeTerms = fetchDisputeResolutionTerms(_offerId);

            uint256 drFeeAmount = disputeTerms.feeAmount;

            if (drFeeAmount > 0) {
                handleDRFeeCollection(_exchangeId, _offer, disputeTerms, drFeeAmount);
                exchange.mutualizerAddress = disputeTerms.mutualizerAddress;
            }
        }

        Voucher storage voucher = protocolEntities().vouchers[_exchangeId];
        voucher.committedDate = block.timestamp;

        {
            uint256 startDate = (block.timestamp >= offerDates.voucherRedeemableFrom)
                ? block.timestamp
                : offerDates.voucherRedeemableFrom;

            voucher.validUntilDate = (offerDates.voucherRedeemableUntil > 0)
                ? offerDates.voucherRedeemableUntil
                : startDate + fetchOfferDurations(_offerId).voucherValid;
        }

        {
            ProtocolLib.ProtocolLookups storage lookups = protocolLookups();
            lookups.exchangeIdsByOffer[_offerId].push(_exchangeId);

            if (!_isPreminted) {
                if (_offer.quantityAvailable != type(uint256).max) {
                    _offer.quantityAvailable--;
                }

                IBosonVoucher bosonVoucher = IBosonVoucher(
                    getCloneAddress(lookups, _offer.sellerId, _offer.collectionIndex)
                );
                uint256 tokenId = _exchangeId | (_offerId << 128);

                address payable buyerWallet;
                if (_offer.creator == OfferCreator.Buyer) {
                    (, Buyer storage buyer) = fetchBuyer(buyerId);
                    buyerWallet = buyer.wallet;
                } else {
                    buyerWallet = _committer;
                }

                bosonVoucher.issueVoucher(tokenId, buyerWallet);
            }

            lookups.voucherCount[buyerId]++;
        }

        if (_offer.creator == OfferCreator.Buyer) {
            emit SellerCommitted(_offerId, _offer.sellerId, _exchangeId, exchange, voucher, _msgSender());
        } else {
            emit BuyerCommitted(_offerId, buyerId, _exchangeId, exchange, voucher, _msgSender());
        }

        return _exchangeId;
    }

    /**
     * @notice Authorizes a potential buyer to commit to a conditional offer.
     *
     * Emits ConditionalCommitAuthorized if successful.
     */
    function authorizeCommit(
        address _buyer,
        Condition storage _condition,
        uint256 _groupId,
        uint256 _tokenId,
        uint256 _offerId
    ) internal {
        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();

        GatingType gating = _condition.gating;
        mapping(uint256 => uint256) storage conditionalCommits = gating == GatingType.PerTokenId
            ? lookups.conditionalCommitsByTokenId[_tokenId]
            : lookups.conditionalCommitsByAddress[_buyer];

        uint256 commitCount = conditionalCommits[_groupId];
        uint256 maxCommits = _condition.maxCommits;

        if (commitCount >= maxCommits) revert MaxCommitsReached();

        bool allow = _condition.method == EvaluationMethod.Threshold
            ? holdsThreshold(_buyer, _condition, _tokenId)
            : holdsSpecificToken(_buyer, _condition, _tokenId);

        if (!allow) revert CannotCommit();

        conditionalCommits[_groupId] = ++commitCount;

        emit ConditionalCommitAuthorized(_offerId, gating, _buyer, _tokenId, commitCount, maxCommits);
    }

    /**
     * @notice Checks if the buyer has the required balance of the conditional token.
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
     * @notice For ERC721, checks if the buyer owns the specific token.
     */
    function holdsSpecificToken(
        address _buyer,
        Condition storage _condition,
        uint256 _tokenId
    ) internal view returns (bool) {
        return IERC721(_condition.tokenAddress).ownerOf(_tokenId) == _buyer;
    }

    /**
     * @notice Checks if the token id is inside the condition's range.
     */
    function validateConditionRange(Condition storage _condition, uint256 _tokenId) internal view {
        EvaluationMethod method = _condition.method;
        bool isMultitoken = _condition.tokenType == TokenType.MultiToken;

        if (method == EvaluationMethod.None) revert GroupHasNoCondition();

        if (method == EvaluationMethod.SpecificToken || isMultitoken) {
            uint256 minTokenId = _condition.minTokenId;
            uint256 maxTokenId = _condition.maxTokenId;
            if (maxTokenId == 0) maxTokenId = minTokenId; // legacy conditions have maxTokenId == 0

            if (_tokenId < minTokenId || _tokenId > maxTokenId) revert TokenIdNotInConditionRange();
        }

        if (method == EvaluationMethod.Threshold && !isMultitoken) {
            if (_tokenId != 0) revert InvalidTokenId();
        }
    }

    /**
     * @notice Handles DR fee collection from mutualizer or seller's pool.
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
            decreaseAvailableFunds(_offer.sellerId, _offer.exchangeToken, _drFeeAmount);
        } else {
            uint256 balanceBefore = getBalance(exchangeToken);

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

        emit IBosonFundsBaseEvents.DRFeeRequested(
            _exchangeId,
            exchangeToken,
            _drFeeAmount,
            _disputeTerms.mutualizerAddress,
            _msgSender()
        );
    }

    /**
     * @notice Adds seller-specific offer parameters to a buyer-created offer.
     */
    function addSellerParametersToBuyerOffer(
        address _committer,
        uint256 _offerId,
        SellerOfferParams calldata _sellerParams
    ) internal returns (BosonTypes.Offer storage offer) {
        offer = getValidOffer(_offerId);
        if (offer.priceType != PriceType.Static) revert InvalidPriceType();
        if (offer.creator != OfferCreator.Buyer) revert InvalidOfferCreator();

        (bool sellerExists, uint256 sellerId) = getSellerIdByAssistant(_committer);
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
                validateMutualizerInterface(_sellerParams.mutualizerAddress);

                DisputeResolutionTerms storage disputeTerms = fetchDisputeResolutionTerms(_offerId);
                disputeTerms.mutualizerAddress = _sellerParams.mutualizerAddress;
            }

            emit BuyerInitiatedOfferSetSellerParams(_offerId, sellerId, _sellerParams, _committer);
        }
    }
}
