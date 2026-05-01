// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.35;

import "../../domain/BosonConstants.sol";
import { IBosonFundsBaseEvents } from "../../interfaces/events/IBosonFundsEvents.sol";
import { DisputeBase } from "../bases/DisputeBase.sol";
import { ExchangeCommitBase } from "../bases/ExchangeCommitBase.sol";
import { ExchangeRedeemBase } from "../bases/ExchangeRedeemBase.sol";
import { GroupBase } from "../bases/GroupBase.sol";

/**
 * @title OrchestrationHandlerFacet2
 *
 * @notice Bundles two protocol actions into a single transaction:
 *  - {raiseAndEscalateDispute}: raise + immediately escalate a dispute on a redeemed exchange.
 *  - {commitToOfferAndRedeemVoucher}, {commitToConditionalOfferAndRedeemVoucher},
 *    {createOfferCommitAndRedeem}: commit (and optionally also create a signed offer) and
 *    immediately redeem the issued voucher in the same transaction.
 *
 * Both facets (this and OrchestrationHandlerFacet1) contribute to the single
 * IBosonOrchestrationHandler interface; the split exists only because of the EIP-170 24KB
 * code size limit.
 */
contract OrchestrationHandlerFacet2 is ExchangeCommitBase, ExchangeRedeemBase, GroupBase {
    /**
     * @notice Initializes facet.
     */
    function initialize() public {
        // No-op initializer.
        // - kept for consistency with other facets
        // - exception here because OrchestrationFacet is split into two facets just because of the size limit. Both facets contrubute to 1 interface - IBosonOrchestrationHandler
    }

    /**
     * @notice Raises a dispute and immediately escalates it.
     *
     * Caller must send (or for ERC20, approve the transfer of) the
     * buyer escalation deposit percentage of the offer price, which
     * will be added to the pot for resolution.
     *
     * Emits a DisputeRaised and a DisputeEscalated event if successful.
     *
     * Reverts if:
     * - The disputes region of protocol is paused
     * - The orchestration region of protocol is paused
     * - Caller is not the buyer for the given exchange id
     * - Exchange does not exist
     * - Exchange is not in a Redeemed state
     * - Dispute period has elapsed already
     * - Dispute resolver is not specified (absolute zero offer)
     * - Offer price is in native token and caller does not send enough
     * - Offer price is in some ERC20 token and caller also sends native currency
     * - If contract at token address does not support ERC20 function transferFrom
     * - If calling transferFrom on token fails for some reason (e.g. protocol is not approved to transfer)
     * - Received ERC20 token amount differs from the expected value
     *
     * @param _exchangeId - the id of the associated exchange
     */
    function raiseAndEscalateDispute(uint256 _exchangeId) external payable orchestrationNotPaused nonReentrant {
        // Get the exchange, should be in redeemed state
        (Exchange storage exchange, Voucher storage voucher) = getValidExchange(_exchangeId, ExchangeState.Redeemed);

        // Get the offer, which will exist if the exchange does
        (, Offer storage offer) = fetchOffer(exchange.offerId);

        // Raise the dispute
        raiseDisputeInternal(exchange, voucher, offer.sellerId);

        // Escalate the dispute
        escalateDisputeInternal(_exchangeId);
    }

    /**
     * @notice Commits to a seller-created static offer with no condition and immediately redeems the issued voucher in a single transaction.
     *
     * The committer (buyer) is always `_msgSender()`, ensuring the caller owns the voucher being redeemed.
     * Bundled twins (if any) are transferred to `_msgSender()`.
     *
     * Emits a BuyerCommitted and a VoucherRedeemed event if successful.
     *
     * Reverts if any condition that would cause `commitToOffer` or `redeemVoucher` to revert holds, including:
     * - The exchanges, buyers, sellers, or orchestration regions of protocol are paused
     * - Offer price type is not static
     * - Offer is conditional (use {commitToConditionalOfferAndRedeemVoucher} instead)
     * - Caller is not a registered buyer
     * - Voucher is not yet redeemable or has expired
     *
     * @param _offerId - the id of the offer to commit to and immediately redeem
     */
    function commitToOfferAndRedeemVoucher(
        uint256 _offerId
    )
        external
        payable
        exchangesNotPaused
        buyersNotPaused
        sellersNotPaused
        orchestrationNotPaused
        nonReentrant
    {
        address payable committer = payable(_msgSender());

        Offer storage offer = getValidOffer(_offerId);
        if (offer.priceType != PriceType.Static) revert InvalidPriceType();

        (bool exists, uint256 groupId) = getGroupIdByOffer(offer.id);
        if (exists) {
            Condition storage condition = fetchCondition(groupId);
            if (condition.method != EvaluationMethod.None) revert GroupHasCondition();
        }

        uint256 exchangeId = commitToOfferInternal(committer, offer, 0, false);
        redeemVoucherInternal(exchangeId, false);
    }

    /**
     * @notice Commits to a seller-created token-gated static offer and immediately redeems the issued voucher in a single transaction.
     *
     * The committer (buyer) is always `_msgSender()`, ensuring the caller owns the voucher being redeemed.
     * Bundled twins (if any) are transferred to `_msgSender()`.
     *
     * Emits BuyerCommitted, ConditionalCommitAuthorized, and VoucherRedeemed events if successful.
     *
     * @param _offerId - the id of the offer to commit to and immediately redeem
     * @param _tokenId - the id of the token to use for the conditional commit
     */
    function commitToConditionalOfferAndRedeemVoucher(
        uint256 _offerId,
        uint256 _tokenId
    )
        external
        payable
        exchangesNotPaused
        buyersNotPaused
        orchestrationNotPaused
        nonReentrant
    {
        address payable committer = payable(_msgSender());

        Offer storage offer = getValidOffer(_offerId);
        if (offer.priceType != PriceType.Static) revert InvalidPriceType();
        if (offer.creator == OfferCreator.Buyer) revert OfferCreatorMustBeSeller();

        (bool exists, uint256 groupId) = getGroupIdByOffer(offer.id);
        if (!exists) revert NoSuchGroup();

        Condition storage condition = fetchCondition(groupId);
        validateConditionRange(condition, _tokenId);
        authorizeCommit(committer, condition, groupId, _tokenId, _offerId);

        uint256 exchangeId = commitToOfferInternal(committer, offer, 0, false);

        protocolLookups().exchangeCondition[exchangeId] = condition;

        redeemVoucherInternal(exchangeId, false);
    }

    /**
     * @notice Atomically creates a seller-signed offer, commits to it as the buyer, and redeems the issued voucher.
     *
     * Restricted to seller-created offers. The caller (buyer) is always `_msgSender()`. Bundled twins (if any) are transferred to `_msgSender()`.
     *
     * Emits OfferCreated (when freshly created), BuyerCommitted, and VoucherRedeemed events if successful.
     *
     * @param _fullOffer - the fully populated struct containing offer, offer dates, offer durations, dispute resolution parameters, condition, agent id and fee limit
     * @param _offerCreator - the address of the offer creator (must be the seller's assistant)
     * @param _signature - signature of the offer creator
     * @param _conditionalTokenId - the token id to use for the conditional commit, if applicable
     */
    function createOfferCommitAndRedeem(
        BosonTypes.FullOffer calldata _fullOffer,
        address _offerCreator,
        bytes calldata _signature,
        uint256 _conditionalTokenId
    ) external payable exchangesNotPaused buyersNotPaused sellersNotPaused orchestrationNotPaused {
        if (_fullOffer.offer.creator != OfferCreator.Seller) revert OfferCreatorMustBeSeller();

        // Verify signature, find/create the offer, and create a group with condition if needed.
        (bytes32 offerHash, uint256 offerId) = verifyOffer(_fullOffer, _offerCreator, _signature);

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
                Group memory group;
                group.sellerId = _fullOffer.offer.sellerId;
                group.offerIds = new uint256[](1);
                group.offerIds[0] = offerId;

                createGroupInternal(group, _fullOffer.condition, false);
            }
        }

        // Deposit seller's funds if the seller did not pre-fund the seller deposit
        if (!_fullOffer.useDepositedFunds) {
            uint256 sellerDeposit = _fullOffer.offer.sellerDeposit;
            if (sellerDeposit > 0) {
                transferFundsIn(_fullOffer.offer.exchangeToken, _offerCreator, sellerDeposit);
                increaseAvailableFunds(_fullOffer.offer.sellerId, _fullOffer.offer.exchangeToken, sellerDeposit);
                emit IBosonFundsBaseEvents.FundsDeposited(
                    _fullOffer.offer.sellerId,
                    _offerCreator,
                    _fullOffer.offer.exchangeToken,
                    sellerDeposit
                );
            }
        }

        // Commit (buyer is _msgSender) — including conditional path when applicable
        Offer storage offer = getValidOffer(offerId);
        address payable committer = payable(_msgSender());

        uint256 exchangeId;
        if (_fullOffer.condition.method != BosonTypes.EvaluationMethod.None) {
            (bool groupExists, uint256 groupId) = getGroupIdByOffer(offerId);
            if (!groupExists) revert NoSuchGroup();

            Condition storage condition = fetchCondition(groupId);
            validateConditionRange(condition, _conditionalTokenId);
            authorizeCommit(committer, condition, groupId, _conditionalTokenId, offerId);

            exchangeId = commitToOfferInternal(committer, offer, 0, false);
            protocolLookups().exchangeCondition[exchangeId] = condition;
        } else {
            exchangeId = commitToOfferInternal(committer, offer, 0, false);
        }

        redeemVoucherInternal(exchangeId, false);
    }
}
