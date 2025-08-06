// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import "../../domain/BosonConstants.sol";
import { BosonErrors } from "../../domain/BosonErrors.sol";
import { IBosonExchangeHandler } from "../../interfaces/handlers/IBosonExchangeHandler.sol";
import { IBosonVoucher } from "../../interfaces/clients/IBosonVoucher.sol";
import { IDRFeeMutualizer } from "../../interfaces/clients/IDRFeeMutualizer.sol";
import { IBosonFundsBaseEvents } from "../../interfaces/events/IBosonFundsEvents.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { BuyerBase } from "../bases/BuyerBase.sol";
import { DisputeBase } from "../bases/DisputeBase.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC1155 } from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import { Address } from "@openzeppelin/contracts/utils/Address.sol";

/**
 * @title ExchangeHandlerFacet
 *
 * @notice Handles exchanges associated with offers within the protocol.
 */
contract ExchangeHandlerFacet is DisputeBase, BuyerBase, IBosonExchangeHandler {
    using Address for address;
    using Address for address payable;

    uint256 private immutable EXCHANGE_ID_2_2_0; // solhint-disable-line

    /**
     * @notice After v2.2.0, token ids are derived from offerId and exchangeId.
     * EXCHANGE_ID_2_2_0 is the first exchange id to use for 2.2.0.
     * Set EXCHANGE_ID_2_2_0 in the constructor.
     *
     * @param _firstExchangeId2_2_0 - the first exchange id to use for 2.2.0
     */
    //solhint-disable-next-line
    constructor(uint256 _firstExchangeId2_2_0) {
        EXCHANGE_ID_2_2_0 = _firstExchangeId2_2_0;
    }

    /**
     * @notice Initializes facet.
     * This function is callable only once.
     */
    function initialize() public onlyUninitialized(type(IBosonExchangeHandler).interfaceId) {
        DiamondLib.addSupportedInterface(type(IBosonExchangeHandler).interfaceId);
    }

    /**
     * @notice Commits to a price static offer (first step of an exchange).
     *
     * Emits a BuyerCommitted event if successful.
     * Issues a voucher to the buyer address.
     *
     * Reverts if:
     * - The exchanges region of protocol is paused
     * - The buyers region of protocol is paused
     * - OfferId is invalid
     * - Offer price type is not static
     * - Offer has been voided
     * - Offer has expired
     * - Offer is not yet available for commits
     * - Offer's quantity available is zero
     * - Buyer address is zero
     * - Buyer account is inactive
     * - Offer price is in native token and caller does not send enough
     * - Offer price is in some ERC20 token and caller also sends native currency
     * - Contract at token address does not support ERC20 function transferFrom
     * - Calling transferFrom on token fails for some reason (e.g. protocol is not approved to transfer)
     * - Received ERC20 token amount differs from the expected value
     * - Seller has less funds available than sellerDeposit
     * - Offer belongs to a group with a condition
     *
     * @param _buyer - the buyer's address (caller can commit on behalf of a buyer)
     * @param _offerId - the id of the offer to commit to
     */
    function commitToOffer(
        address payable _buyer,
        uint256 _offerId
    ) external payable override exchangesNotPaused buyersNotPaused nonReentrant {
        // Make sure buyer address is not zero address
        if (_buyer == address(0)) revert InvalidAddress();

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

        commitToOfferInternal(_buyer, offer, 0, false);
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
     * @notice Commits to an offer. Helper function reused by commitToOffer and onPremintedVoucherTransferred.
     *
     * Emits a BuyerCommitted event if successful.
     * Issues a voucher to the buyer address for non preminted offers.
     *
     * Reverts if:
     * - Offer has expired
     * - Offer is not yet available for commits
     * - Offer's quantity available is zero [for non preminted offers]
     * - Buyer account is inactive
     * - Buyer is token-gated (conditional commit requirements not met or already used)
     * - For non preminted offers:
     *   - Offer price is in native token and caller does not send enough
     *   - Offer price is in some ERC20 token and caller also sends native currency
     *   - Contract at token address does not support ERC20 function transferFrom
     *   - Calling transferFrom on token fails for some reason (e.g. protocol is not approved to transfer)
     *   - Received ERC20 token amount differs from the expected value
     *   - Seller has less funds available than sellerDeposit
     * - For preminted offers:
     *   - Exchange aldready exists
     *   - Seller has less funds available than sellerDeposit and price for preminted offers that price type is static
     *
     * @param _buyer - the buyer's address (caller can commit on behalf of a buyer)
     * @param _offer - storage pointer to the offer
     * @param _exchangeId - the id of the exchange
     * @param _isPreminted - whether the offer is preminted
     * @return exchangeId - the id of the exchange
     */
    function commitToOfferInternal(
        address payable _buyer,
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

        // Fetch or create buyer
        uint256 buyerId = getValidBuyer(_buyer);

        // Encumber funds
        encumberFunds(_offerId, buyerId, _offer.price, _isPreminted, _offer.priceType);

        // Handle DR fee collection
        Exchange storage exchange = protocolEntities().exchanges[_exchangeId];
        {
            // Get dispute resolution terms to get the dispute resolver ID
            DisputeResolutionTerms storage disputeTerms = fetchDisputeResolutionTerms(_offerId);

            uint256 drFeeAmount = disputeTerms.feeAmount;

            // Create and store a new exchange
            exchange.id = _exchangeId;
            exchange.offerId = _offerId;
            exchange.buyerId = buyerId;
            exchange.state = ExchangeState.Committed;

            // Handle DR fee collection if fee exists
            if (drFeeAmount > 0) {
                handleDRFeeCollection(_exchangeId, _offer, disputeTerms, drFeeAmount);
                exchange.mutualizerAddress = disputeTerms.mutualizerAddress;
                exchange.requestedDRFeeAmount = drFeeAmount;
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
                bosonVoucher.issueVoucher(tokenId, _buyer);
            }

            lookups.voucherCount[buyerId]++;
        }

        // Notify watchers of state change
        emit BuyerCommitted(_offerId, buyerId, _exchangeId, exchange, voucher, _msgSender());

        return _exchangeId;
    }

    /**
     * @notice Completes an exchange.
     *
     * Emits an ExchangeCompleted event if successful.
     *
     * Reverts if
     * - The exchanges region of protocol is paused
     * - Exchange does not exist
     * - Exchange is not in Redeemed state
     * - Caller is not buyer and offer dispute period has not elapsed
     *
     * @param _exchangeId - the id of the exchange to complete
     */
    function completeExchange(uint256 _exchangeId) public override exchangesNotPaused nonReentrant {
        // Get the exchange, should be in redeemed state
        (Exchange storage exchange, Voucher storage voucher) = getValidExchange(_exchangeId, ExchangeState.Redeemed);
        uint256 offerId = exchange.offerId;

        // Get the offer, which will definitely exist
        Offer storage offer;
        (, offer) = fetchOffer(offerId);

        // Get message sender
        address sender = _msgSender();

        // Is this the buyer?
        bool buyerExists;
        uint256 buyerId;
        (buyerExists, buyerId) = getBuyerIdByWallet(sender);

        // Buyer may call any time. Seller or anyone else may call after dispute period elapses
        // N.B. An existing buyer or seller may be the "anyone else" on an exchange they are not a part of
        if (!buyerExists || buyerId != exchange.buyerId) {
            uint256 elapsed = block.timestamp - voucher.redeemedDate;
            if (elapsed < fetchOfferDurations(offerId).disputePeriod) revert DisputePeriodNotElapsed();
        }

        // Finalize the exchange
        finalizeExchange(exchange, ExchangeState.Completed);

        // Notify watchers of state change
        emit ExchangeCompleted(offerId, exchange.buyerId, exchange.id, sender);
    }

    /**
     * @notice Completes a batch of exchanges.
     *
     * Emits an ExchangeCompleted event for every exchange if finalized to the Complete state.
     *
     * Reverts if:
     * - The exchanges region of protocol is paused
     * - For any exchange:
     *   - Exchange does not exist
     *   - Exchange is not in Redeemed state
     *   - Caller is not buyer and offer dispute period has not elapsed
     *
     * @param _exchangeIds - the array of exchanges ids
     */
    function completeExchangeBatch(uint256[] calldata _exchangeIds) external override exchangesNotPaused {
        for (uint256 i = 0; i < _exchangeIds.length; ) {
            // complete the exchange
            completeExchange(_exchangeIds[i]);

            unchecked {
                i++;
            }
        }
    }

    /**
     * @notice Revokes a voucher.
     *
     * Emits a VoucherRevoked event if successful.
     *
     * Reverts if
     * - The exchanges region of protocol is paused
     * - Exchange does not exist
     * - Exchange is not in Committed state
     * - Caller is not seller's assistant
     *
     * @param _exchangeId - the id of the exchange
     */
    function revokeVoucher(uint256 _exchangeId) external override exchangesNotPaused nonReentrant {
        // Get the exchange, should be in committed state
        (Exchange storage exchange, ) = getValidExchange(_exchangeId, ExchangeState.Committed);

        // Get seller id associated with caller
        bool sellerExists;
        uint256 sellerId;
        (sellerExists, sellerId) = getSellerIdByAssistant(_msgSender());

        // Get the offer, which will definitely exist
        uint256 offerId = exchange.offerId;
        (, Offer storage offer) = fetchOffer(offerId);

        // Only seller's assistant may call
        if (!sellerExists || offer.sellerId != sellerId) revert NotAssistant();

        // Finalize the exchange, burning the voucher
        finalizeExchange(exchange, ExchangeState.Revoked);

        // Notify watchers of state change
        emit VoucherRevoked(offerId, _exchangeId, _msgSender());
    }

    /**
     * @notice Cancels a voucher.
     *
     * Emits a VoucherCanceled event if successful.
     *
     * Reverts if
     * - The exchanges region of protocol is paused
     * - Exchange does not exist
     * - Exchange is not in Committed state
     * - Caller does not own voucher
     *
     * @param _exchangeId - the id of the exchange
     */
    function cancelVoucher(uint256 _exchangeId) external override exchangesNotPaused nonReentrant {
        // Get the exchange, should be in committed state
        (Exchange storage exchange, ) = getValidExchange(_exchangeId, ExchangeState.Committed);

        // Make sure the caller is buyer associated with the exchange
        checkBuyer(exchange.buyerId);

        // Finalize the exchange, burning the voucher
        finalizeExchange(exchange, ExchangeState.Canceled);

        // Notify watchers of state change
        emit VoucherCanceled(exchange.offerId, _exchangeId, _msgSender());
    }

    /**
     * @notice Expires a voucher.
     *
     * Emits a VoucherExpired event if successful.
     *
     * Reverts if
     * - The exchanges region of protocol is paused
     * - Exchange does not exist
     * - Exchange is not in Committed state
     * - Redemption period has not yet elapsed
     *
     * @param _exchangeId - the id of the exchange
     */
    function expireVoucher(uint256 _exchangeId) external override exchangesNotPaused nonReentrant {
        // Get the exchange, should be in committed state
        (Exchange storage exchange, Voucher storage voucher) = getValidExchange(_exchangeId, ExchangeState.Committed);

        // Make sure that the voucher has expired
        if (block.timestamp <= voucher.validUntilDate) revert VoucherStillValid();

        // Finalize the exchange, burning the voucher
        finalizeExchange(exchange, ExchangeState.Canceled);

        // Make it possible to determine how this exchange reached the Canceled state
        voucher.expired = true;

        // Notify watchers of state change
        emit VoucherExpired(exchange.offerId, _exchangeId, _msgSender());
    }

    /**
     * @notice Extends a Voucher's validity period.
     *
     * Emits a VoucherExtended event if successful.
     *
     * Reverts if
     * - The exchanges region of protocol is paused
     * - Exchange does not exist
     * - Exchange is not in Committed state
     * - Caller is not seller's assistant
     * - New date is not later than the current one
     *
     * @param _exchangeId - the id of the exchange
     * @param _validUntilDate - the new voucher expiry date
     */
    function extendVoucher(uint256 _exchangeId, uint256 _validUntilDate) external exchangesNotPaused nonReentrant {
        // Get the exchange, should be in committed state
        (Exchange storage exchange, Voucher storage voucher) = getValidExchange(_exchangeId, ExchangeState.Committed);

        // Get the offer, which will definitely exist
        Offer storage offer;
        uint256 offerId = exchange.offerId;
        (, offer) = fetchOffer(offerId);

        // Get message sender
        address sender = _msgSender();

        // Get seller id associated with caller
        bool sellerExists;
        uint256 sellerId;
        (sellerExists, sellerId) = getSellerIdByAssistant(sender);

        // Only seller's assistant may call
        if (!sellerExists || offer.sellerId != sellerId) revert NotAssistant();

        // Make sure the proposed date is later than the current one
        if (_validUntilDate <= voucher.validUntilDate) revert VoucherExtensionNotValid();

        // Extend voucher
        voucher.validUntilDate = _validUntilDate;

        // Notify watchers of state exchange
        emit VoucherExtended(offerId, _exchangeId, _validUntilDate, sender);
    }

    /**
     * @notice Redeems a voucher.
     *
     * Emits a VoucherRedeemed event if successful.
     * Emits TwinTransferred if twin transfer was successfull
     * Emits TwinTransferFailed if twin transfer failed
     * Emits TwinTransferSkipped if twin transfer was skipped when the number of twins is too high
     *
     * Reverts if
     * - The exchanges region of protocol is paused
     * - Exchange does not exist
     * - Exchange is not in committed state
     * - Caller does not own voucher
     * - Current time is prior to offer.voucherRedeemableFromDate
     * - Current time is after voucher.validUntilDate
     *
     * @param _exchangeId - the id of the exchange
     */
    function redeemVoucher(uint256 _exchangeId) external override exchangesNotPaused nonReentrant {
        // Get the exchange, should be in committed state
        (Exchange storage exchange, Voucher storage voucher) = getValidExchange(_exchangeId, ExchangeState.Committed);
        uint256 offerId = exchange.offerId;

        // Make sure the caller is buyer associated with the exchange
        checkBuyer(exchange.buyerId);

        // Make sure the voucher is redeemable
        if (
            block.timestamp < fetchOfferDates(offerId).voucherRedeemableFrom || block.timestamp > voucher.validUntilDate
        ) {
            revert VoucherNotRedeemable();
        }

        // Store the time the exchange was redeemed
        voucher.redeemedDate = block.timestamp;

        // Set the exchange state to the Redeemed
        exchange.state = ExchangeState.Redeemed;

        // Burn the voucher
        burnVoucher(exchange);

        // Transfer any bundled twins to buyer
        transferTwins(exchange, voucher);

        // Notify watchers of state change
        emit VoucherRedeemed(offerId, _exchangeId, _msgSender());
    }

    /**
     * @notice Informs protocol of new buyer associated with an exchange.
     *
     * Emits a VoucherTransferred event if successful.
     *
     * Reverts if
     * - The exchanges region of protocol is paused
     * - The buyers region of protocol is paused
     * - Caller is not a clone address associated with the seller
     * - Exchange does not exist
     * - Exchange is not in Committed state
     * - Voucher has expired
     * - New buyer's existing account is deactivated
     *
     * N.B. This method is not protected with reentrancy guard, since it clashes with price discovery flows.
     * Given that it does not rely on _msgSender() for authentication and it does not modify it, it is safe to leave it unprotected.
     * In case of reentrancy the only inconvenience that could happen is that `executedBy` field in `VoucherTransferred` event would not be set correctly.
     *
     * @param _tokenId - the voucher id
     * @param _newBuyer - the address of the new buyer
     */
    function onVoucherTransferred(
        uint256 _tokenId,
        address payable _newBuyer
    ) external override buyersNotPaused exchangesNotPaused {
        // Derive the exchange id
        uint256 exchangeId = _tokenId & type(uint128).max;

        // Cache protocol lookups for reference
        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();

        // Get the exchange, should be in committed state
        (Exchange storage exchange, Voucher storage voucher) = getValidExchange(exchangeId, ExchangeState.Committed);

        // Make sure that the voucher is still valid
        if (block.timestamp > voucher.validUntilDate) revert VoucherHasExpired();

        (, Offer storage offer) = fetchOffer(exchange.offerId);

        // Make sure that the voucher was issued on the clone that is making a call
        if (msg.sender != getCloneAddress(lookups, offer.sellerId, offer.collectionIndex)) revert AccessDenied();

        // Decrease voucher counter for old buyer
        lookups.voucherCount[exchange.buyerId]--;

        // Fetch or create buyer
        uint256 buyerId = getValidBuyer(_newBuyer);

        // Update buyer id for the exchange
        exchange.buyerId = buyerId;

        // Increase voucher counter for new buyer
        lookups.voucherCount[buyerId]++;

        ProtocolLib.ProtocolStatus storage ps = protocolStatus();

        // Set incoming voucher id if we are in the middle of a price discovery call
        if (ps.incomingVoucherCloneAddress != address(0)) {
            uint256 incomingVoucherId = ps.incomingVoucherId;
            if (incomingVoucherId != _tokenId) {
                if (incomingVoucherId != 0) revert IncomingVoucherAlreadySet();
                ps.incomingVoucherId = _tokenId;
            }
        }

        // Notify watchers of state change
        emit VoucherTransferred(exchange.offerId, exchangeId, buyerId, _msgSender());
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
     * @notice Checks if the given exchange in a finalized state.
     *
     * Returns true if
     * - Exchange state is Revoked, Canceled, or Completed
     * - Exchange is disputed and dispute state is Retracted, Resolved, Decided or Refused
     *
     * @param _exchangeId - the id of the exchange to check
     * @return exists - true if the exchange exists
     * @return isFinalized - true if the exchange is finalized
     */
    function isExchangeFinalized(uint256 _exchangeId) public view override returns (bool exists, bool isFinalized) {
        Exchange storage exchange;

        // Get the exchange
        (exists, exchange) = fetchExchange(_exchangeId);

        // Bail if no such exchange
        if (!exists) return (false, false);

        // Derive isFinalized from exchange state or dispute state
        if (exchange.state == ExchangeState.Disputed) {
            // Get the dispute
            Dispute storage dispute;
            (, dispute, ) = fetchDispute(_exchangeId);

            // Check for finalized dispute state
            isFinalized = (dispute.state == DisputeState.Retracted ||
                dispute.state == DisputeState.Resolved ||
                dispute.state == DisputeState.Decided ||
                dispute.state == DisputeState.Refused);
        } else {
            // Check for finalized exchange state
            isFinalized = (exchange.state == ExchangeState.Revoked ||
                exchange.state == ExchangeState.Canceled ||
                exchange.state == ExchangeState.Completed);
        }
    }

    /**
     * @notice Gets the details about a given exchange.
     *
     * @param _exchangeId - the id of the exchange to check
     * @return exists - true if the exchange exists
     * @return exchange - the exchange details. See {BosonTypes.Exchange}
     * @return voucher - the voucher details. See {BosonTypes.Voucher}
     */
    function getExchange(
        uint256 _exchangeId
    ) external view override returns (bool exists, Exchange memory exchange, Voucher memory voucher) {
        (exists, exchange) = fetchExchange(_exchangeId);
        voucher = fetchVoucher(_exchangeId);
    }

    /**
     * @notice Gets the state of a given exchange.
     *
     * @param _exchangeId - the id of the exchange to check
     * @return exists - true if the exchange exists
     * @return state - the exchange state. See {BosonTypes.ExchangeStates}
     */
    function getExchangeState(uint256 _exchangeId) external view override returns (bool exists, ExchangeState state) {
        Exchange storage exchange;
        (exists, exchange) = fetchExchange(_exchangeId);
        if (exists) state = exchange.state;
    }

    /**
     * @notice Gets the id that will be assigned to the next exchange.
     *
     * @dev Does not increment the counter.
     *
     * @return nextExchangeId - the next exchange id
     */
    function getNextExchangeId() external view override returns (uint256 nextExchangeId) {
        nextExchangeId = protocolCounters().nextExchangeId;
    }

    /**
     * @notice Tells if buyer is elligible to commit to conditional
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
     * @notice Gets EIP2981 style royalty information for a chosen offer or exchange.
     *
     * EIP2981 supports only 1 recipient, therefore this method defaults to treasury address.
     * This method is not exactly compliant with EIP2981, since it does not accept `salePrice` and does not return `royaltyAmount,
     * but it rather returns `royaltyPercentage` which is the sum of all bps (exchange can have multiple royalty recipients).
     *
     * This function is meant to be primarly used by boson voucher client, which implements EIP2981.
     *
     * Reverts if exchange does not exist.
     *
     * @param _queryId - offer id or exchange id
     * @param _isExchangeId - indicates if the query represents the exchange id
     * @return receiver - the address of the royalty receiver (seller's treasury address)
     * @return royaltyPercentage - the royalty percentage in bps
     */
    function getEIP2981Royalties(
        uint256 _queryId,
        bool _isExchangeId
    ) external view returns (address receiver, uint256 royaltyPercentage) {
        // EIP2981 returns only 1 recipient. Summ all bps and return treasury address as recipient
        (RoyaltyInfo storage royaltyInfo, , address treasury) = fetchRoyalties(_queryId, _isExchangeId);

        uint256 recipientLength = royaltyInfo.recipients.length;
        if (recipientLength == 0) return (address(0), uint256(0));

        uint256 totalBps = getTotalRoyaltyPercentage(royaltyInfo.bps);

        return (royaltyInfo.recipients[0] == address(0) ? treasury : royaltyInfo.recipients[0], totalBps);
    }

    /**
     * @notice Gets royalty information for a chosen offer or exchange.
     *
     * Returns a list of royalty recipients and corresponding bps. Format is compatible with Manifold and Foundation royalties
     * and can be directly used by royalty registry.
     *
     * Reverts if exchange does not exist.
     *
     * @param _tokenId - tokenId
     * @return recipients - list of royalty recipients
     * @return bps - list of corresponding bps
     */
    function getRoyalties(
        uint256 _tokenId
    ) external view returns (address payable[] memory recipients, uint256[] memory bps) {
        uint256 _queryId = _tokenId >> 128; // Assume that tokenId contains offer in the upper 128 bits

        // If _queryId is 0, then the tokenId represents only the exchangeId
        bool _isExchangeId;
        if (_queryId == 0) {
            _isExchangeId = true;
            _queryId = _tokenId;
        }

        (RoyaltyInfo memory royaltyInfo, , address treasury) = fetchRoyalties(_queryId, _isExchangeId);

        // replace default recipient with the treasury address
        for (uint256 i = 0; i < royaltyInfo.recipients.length; ) {
            if (royaltyInfo.recipients[i] == address(0)) {
                // get treasury address!
                royaltyInfo.recipients[i] = payable(treasury);
                break;
            }

            unchecked {
                i++;
            }
        }

        return (royaltyInfo.recipients, royaltyInfo.bps);
    }

    /**
     * @notice Transitions exchange to a "finalized" state
     *
     * Target state must be Completed, Revoked, or Canceled.
     * Sets finalizedDate and releases funds associated with the exchange
     *
     * @param _exchange - the exchange to finalize
     * @param _targetState - the target state to which the exchange should be transitioned
     */
    function finalizeExchange(Exchange storage _exchange, ExchangeState _targetState) internal {
        // Make sure target state is a final state
        if (
            _targetState != ExchangeState.Completed &&
            _targetState != ExchangeState.Revoked &&
            _targetState != ExchangeState.Canceled
        ) revert InvalidTargeExchangeState();

        // Set the exchange state to the target state
        _exchange.state = _targetState;

        // Store the time the exchange was finalized
        _exchange.finalizedDate = block.timestamp;

        // Burn the voucher if canceling or revoking
        if (_targetState != ExchangeState.Completed) burnVoucher(_exchange);

        // Release the funds
        releaseFunds(_exchange.id);
    }

    /**
     * @notice Burns the voucher associated with a given exchange.
     *
     * Emits ERC721 Transfer event in call stack if successful.
     *
     * @param _exchange - the pointer to the exchange for which voucher should be burned
     */
    function burnVoucher(Exchange storage _exchange) internal {
        // Cache protocol lookups for reference
        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();

        // Decrease the voucher count
        lookups.voucherCount[_exchange.buyerId]--;

        // Burn the voucher
        uint256 offerId = _exchange.offerId;
        (, Offer storage offer) = fetchOffer(offerId);
        IBosonVoucher bosonVoucher = IBosonVoucher(getCloneAddress(lookups, offer.sellerId, offer.collectionIndex));

        uint256 tokenId = _exchange.id;
        if (tokenId >= EXCHANGE_ID_2_2_0) tokenId |= (offerId << 128);
        bosonVoucher.burnVoucher(tokenId);
    }

    /**
     * @notice Transfers bundled twins associated with an exchange to the buyer.
     *
     * Emits ERC20 Transfer, ERC721 Transfer, or ERC1155 TransferSingle events in call stack if successful.
     * Emits TwinTransferred if twin transfer was successfull
     * Emits TwinTransferFailed if twin transfer failed
     * Emits TwinTransferSkipped if twin transfer was skipped when the number of twins is too high
     *
     * If one of the twin transfers fails, the function will continue to transfer the remaining twins and
     * automatically raises a dispute for the exchange.
     *
     * @param _exchange - the exchange for which twins should be transferred
     */
    function transferTwins(Exchange storage _exchange, Voucher storage _voucher) internal {
        uint256[] storage twinIds;
        address assistant;
        uint256 sellerId;

        // See if there is an associated bundle
        {
            (bool exists, uint256 bundleId) = fetchBundleIdByOffer(_exchange.offerId);
            if (!exists) return;

            // Get storage location for bundle
            (, Bundle storage bundle) = fetchBundle(bundleId);

            // Get the twin Ids in the bundle
            twinIds = bundle.twinIds;

            // Get seller account
            (, Seller storage seller, ) = fetchSeller(bundle.sellerId);
            sellerId = seller.id;
            assistant = seller.assistant;
        }

        bool transferFailed; // Flag to indicate if some twin transfer failed and a dispute should be raised

        // Transfer the twins
        {
            // Cache values
            address sender = _msgSender();
            uint256 twinCount = twinIds.length;

            // SINGLE_TWIN_RESERVED_GAS = 160000
            // MINIMAL_RESIDUAL_GAS = 230000
            // Next line would overflow if twinCount > (type(uint256).max - MINIMAL_RESIDUAL_GAS)/SINGLE_TWIN_RESERVED_GAS
            // Oveflow happens for twinCount ~ 7.2x10^71, which is impossible to achieve
            uint256 reservedGas = (twinCount - 1) * SINGLE_TWIN_RESERVED_GAS + MINIMAL_RESIDUAL_GAS;

            // If number of twins is too high, skip the transfer and mark the transfer as failed.
            // Reserved gas is higher than the actual gas needed for succesful twin redeem.
            // There is enough buffer that even if the reserved gas is above gas limit, the redeem will still succeed.
            // This check was added to prevent the DoS attack where the attacker would create a bundle with a huge number of twins.
            // For a normal operations this still allows for a bundle with more than 180 twins to be redeemed, which should be enough for practical purposes.
            if (reservedGas > block.gaslimit) {
                transferFailed = true;

                emit TwinTransferSkipped(_exchange.id, twinCount, sender);
            } else {
                // Visit the twins
                for (uint256 i = 0; i < twinCount; ) {
                    // Get the twin
                    (, Twin storage twinS) = fetchTwin(twinIds[i]);

                    // Use twin struct instead of individual variables to avoid stack too deep error
                    // Don't copy the whole twin to memory immediately, only the fields that are needed
                    Twin memory twinM;
                    twinM.tokenId = twinS.tokenId;
                    twinM.amount = twinS.amount;

                    bool success;
                    {
                        twinM.tokenType = twinS.tokenType;

                        // Shouldn't decrement supply if twin supply is unlimited
                        twinM.supplyAvailable = twinS.supplyAvailable;
                        if (twinM.supplyAvailable != type(uint256).max) {
                            // Decrement by 1 if token type is NonFungible otherwise decrement amount (i.e, tokenType is MultiToken or FungibleToken)
                            twinM.supplyAvailable = twinM.tokenType == TokenType.NonFungibleToken
                                ? twinM.supplyAvailable - 1
                                : twinM.supplyAvailable - twinM.amount;

                            twinS.supplyAvailable = twinM.supplyAvailable;
                        }

                        // Transfer the token from the seller's assistant to the buyer
                        bytes memory data; // Calldata to transfer the twin

                        if (twinM.tokenType == TokenType.FungibleToken) {
                            // ERC-20 style transfer
                            data = abi.encodeCall(IERC20.transferFrom, (assistant, sender, twinM.amount));
                        } else if (twinM.tokenType == TokenType.NonFungibleToken) {
                            // Token transfer order is ascending to avoid overflow when twin supply is unlimited
                            if (twinM.supplyAvailable == type(uint256).max) {
                                twinS.tokenId++;
                            } else {
                                // Token transfer order is descending
                                twinM.tokenId += twinM.supplyAvailable;
                            }
                            // ERC-721 style transfer
                            data = abi.encodeWithSignature(
                                "safeTransferFrom(address,address,uint256,bytes)",
                                assistant,
                                sender,
                                twinM.tokenId,
                                ""
                            );
                        } else if (twinM.tokenType == TokenType.MultiToken) {
                            // ERC-1155 style transfer
                            data = abi.encodeWithSignature(
                                "safeTransferFrom(address,address,uint256,uint256,bytes)",
                                assistant,
                                sender,
                                twinM.tokenId,
                                twinM.amount,
                                ""
                            );
                        }
                        // Make call only if there is enough gas and code at address exists.
                        // If not, skip the call and mark the transfer as failed
                        twinM.tokenAddress = twinS.tokenAddress;
                        uint256 gasLeft = gasleft();
                        if (gasLeft > reservedGas && twinM.tokenAddress.isContract()) {
                            address to = twinM.tokenAddress;

                            // Handle the return value with assembly to avoid return bomb attack
                            bytes memory result;
                            assembly {
                                success := call(
                                    sub(gasLeft, reservedGas), // gasleft()-reservedGas
                                    to, // twin contract
                                    0, // ether value
                                    add(data, 0x20), // invocation calldata
                                    mload(data), // calldata length
                                    add(result, 0x20), // store return data at result
                                    0x20 // store at most 32 bytes
                                )

                                let returndataSize := returndatasize()

                                switch gt(returndataSize, 0x20)
                                case 0 {
                                    // Adjust result length in case it's shorter than 32 bytes
                                    mstore(result, returndataSize)
                                }
                                case 1 {
                                    // If return data is longer than 32 bytes, consider transfer unsuccesful
                                    success := false
                                }
                            }

                            // Check if result is empty or if result is a boolean and is true
                            success =
                                success &&
                                (result.length == 0 || (result.length == 32 && abi.decode(result, (uint256)) == 1));
                        }
                    }

                    twinM.id = twinS.id;

                    // If token transfer failed
                    if (!success) {
                        transferFailed = true;

                        emit TwinTransferFailed(
                            twinM.id,
                            twinM.tokenAddress,
                            _exchange.id,
                            twinM.tokenId,
                            twinM.amount,
                            sender
                        );
                    } else {
                        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();
                        uint256 exchangeId = _exchange.id;

                        {
                            // Store twin receipt on twinReceiptsByExchange
                            TwinReceipt storage twinReceipt = lookups.twinReceiptsByExchange[exchangeId].push();
                            twinReceipt.twinId = twinM.id;
                            twinReceipt.tokenAddress = twinM.tokenAddress;
                            twinReceipt.tokenId = twinM.tokenId;
                            twinReceipt.amount = twinM.amount;
                            twinReceipt.tokenType = twinM.tokenType;
                        }
                        if (twinM.tokenType == TokenType.NonFungibleToken) {
                            updateNFTRanges(lookups, twinM, sellerId);
                        }
                        emit TwinTransferred(
                            twinM.id,
                            twinM.tokenAddress,
                            exchangeId,
                            twinM.tokenId,
                            twinM.amount,
                            sender
                        );
                    }

                    // Reduce minimum gas required for succesful execution
                    reservedGas -= SINGLE_TWIN_RESERVED_GAS;

                    unchecked {
                        i++;
                    }
                }
            }
        }

        // Some twin transfer was not successful, raise dispute
        if (transferFailed) {
            raiseDisputeInternal(_exchange, _voucher, sellerId);
        }
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
     * @notice Gets exchange receipt.
     *
     * Reverts if:
     * - Exchange is not in a final state
     * - Exchange id is invalid
     *
     * @param _exchangeId - the exchange id
     * @return receipt - the receipt for the exchange. See {BosonTypes.Receipt}
     */
    function getReceipt(uint256 _exchangeId) external view returns (Receipt memory receipt) {
        // Get the exchange
        (bool exists, Exchange storage exchange) = fetchExchange(_exchangeId);
        if (!exists) revert NoSuchExchange();

        // Verify if exchange is finalized, returns true if exchange is in one of the final states
        (, bool isFinalized) = isExchangeFinalized(_exchangeId);
        if (!isFinalized) revert ExchangeIsNotInAFinalState();

        // Add exchange to receipt
        receipt.exchangeId = exchange.id;
        receipt.buyerId = exchange.buyerId;
        receipt.finalizedDate = exchange.finalizedDate;

        // Get the voucher
        Voucher storage voucher = fetchVoucher(_exchangeId);
        receipt.committedDate = voucher.committedDate;
        receipt.redeemedDate = voucher.redeemedDate;
        receipt.voucherExpired = voucher.expired;

        // Fetch offer, we assume offer exist if exchange exist
        (, Offer storage offer) = fetchOffer(exchange.offerId);
        receipt.offerId = offer.id;
        receipt.sellerId = offer.sellerId;
        receipt.price = offer.price;
        receipt.sellerDeposit = offer.sellerDeposit;
        receipt.buyerCancelPenalty = offer.buyerCancelPenalty;
        receipt.exchangeToken = offer.exchangeToken;

        // Fetch offer fees
        OfferFees storage offerFees = fetchOfferFees(offer.id);
        receipt.offerFees = offerFees;

        // Fetch agent id
        (, uint256 agentId) = fetchAgentIdByOffer(offer.id);
        receipt.agentId = agentId;

        // We assume dispute exist if exchange is in disputed state
        if (exchange.state == ExchangeState.Disputed) {
            // Fetch dispute resolution terms
            DisputeResolutionTerms storage disputeResolutionTerms = fetchDisputeResolutionTerms(offer.id);

            // Add disputeResolverId to receipt
            receipt.disputeResolverId = disputeResolutionTerms.disputeResolverId;

            // Fetch dispute and dispute dates
            (, Dispute storage dispute, DisputeDates storage disputeDates) = fetchDispute(_exchangeId);

            // Add dispute data to receipt
            receipt.disputeState = dispute.state;
            receipt.disputedDate = disputeDates.disputed;
            receipt.escalatedDate = disputeDates.escalated;
        }

        // Fetch the twin receipt, it exists if offer was bundled with twins
        (bool twinsExists, TwinReceipt[] storage twinReceipts) = fetchTwinReceipts(exchange.id);

        // Add twin to receipt if exists
        if (twinsExists) {
            receipt.twinReceipts = twinReceipts;
        }

        // Fetch condition
        (bool conditionExists, Condition storage condition) = fetchConditionByExchange(exchange.id);

        // Add condition to receipt if exists
        if (conditionExists) {
            receipt.condition = condition;
        }
    }

    /**
     * @notice Updates NFT ranges, so it's possible to reuse the tokens in other twins and to make
     * creation of new ranges viable
     *
     * @param _lookups - storage pointer to the protocol lookups
     * @param _sellerId - the seller id
     * @param _twin - storage pointer to the twin
     */
    function updateNFTRanges(
        ProtocolLib.ProtocolLookups storage _lookups,
        Twin memory _twin,
        uint256 _sellerId
    ) internal {
        // Get all ranges of twins that belong to the seller and to the same token address.
        TokenRange[] storage twinRanges = _lookups.twinRangesBySeller[_sellerId][_twin.tokenAddress];
        bool unlimitedSupply = _twin.supplyAvailable == type(uint256).max;

        uint256 rangeIndex = _lookups.rangeIdByTwin[_twin.id] - 1;
        TokenRange storage range = twinRanges[rangeIndex];

        if (unlimitedSupply ? range.end == _twin.tokenId : range.start == _twin.tokenId) {
            uint256 lastIndex = twinRanges.length - 1;
            if (rangeIndex != lastIndex) {
                // Replace range with last range
                twinRanges[rangeIndex] = twinRanges[lastIndex];
                _lookups.rangeIdByTwin[range.twinId] = rangeIndex + 1;
            }

            // Remove from ranges mapping
            twinRanges.pop();

            // Delete rangeId from rangeIdByTwin mapping
            _lookups.rangeIdByTwin[_twin.id] = 0;
        } else {
            unlimitedSupply ? range.start++ : range.end--;
        }
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
            _msgSender()
        );
    }
}
