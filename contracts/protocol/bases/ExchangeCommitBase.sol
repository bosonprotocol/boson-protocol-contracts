// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.34;

import "../../domain/BosonConstants.sol";
import { BosonErrors } from "../../domain/BosonErrors.sol";
import { IBosonExchangeEvents } from "../../interfaces/events/IBosonExchangeEvents.sol";
import { IBosonFundsBaseEvents } from "../../interfaces/events/IBosonFundsEvents.sol";
import { IBosonOfferEvents } from "../../interfaces/events/IBosonOfferEvents.sol";
import { IBosonVoucher } from "../../interfaces/clients/IBosonVoucher.sol";
import { IDRFeeMutualizer } from "../../interfaces/clients/IDRFeeMutualizer.sol";
import { BuyerBase } from "./BuyerBase.sol";
import { OfferBase } from "./OfferBase.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";
import { EIP712Lib } from "../libs/EIP712Lib.sol";
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
 *  - {verifyOffer} — validates an EIP-712 / ERC1271 signature over a FullOffer.
 *  - {authorizeCommit} — token-gating checks for conditional offers.
 *  - {addSellerParametersToBuyerOffer} — applies seller-side parameters to a buyer-created offer.
 *  - DR-fee collection and condition-range validation.
 */
contract ExchangeCommitBase is BuyerBase, OfferBase, IBosonExchangeEvents {
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
