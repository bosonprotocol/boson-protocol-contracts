// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import { IBosonExchangeHandler } from "../../interfaces/handlers/IBosonExchangeHandler.sol";
import { IBosonAccountHandler } from "../../interfaces/handlers/IBosonAccountHandler.sol";
import { IBosonVoucher } from "../../interfaces/clients/IBosonVoucher.sol";
import { ITwinToken } from "../../interfaces/ITwinToken.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { BuyerBase } from "../bases/BuyerBase.sol";
import { DisputeBase } from "../bases/DisputeBase.sol";
import { FundsLib } from "../libs/FundsLib.sol";
import "../../domain/BosonConstants.sol";

interface Token {
    function balanceOf(address account) external view returns (uint256); //ERC-721 and ERC-20

    function ownerOf(uint256 _tokenId) external view returns (address); //ERC-721
}

interface MultiToken {
    function balanceOf(address account, uint256 id) external view returns (uint256);
}

/**
 * @title ExchangeHandlerFacet
 *
 * @notice Handles exchanges associated with offers within the protocol
 */
contract ExchangeHandlerFacet is IBosonExchangeHandler, BuyerBase, DisputeBase {
    /**
     * @notice Facet Initializer
     */
    function initialize() public onlyUnInitialized(type(IBosonExchangeHandler).interfaceId) {
        DiamondLib.addSupportedInterface(type(IBosonExchangeHandler).interfaceId);
    }

    /**
     * @notice Commit to an offer (first step of an exchange)
     *
     * Emits an BuyerCommitted event if successful.
     * Issues a voucher to the buyer address.
     *
     * Reverts if:
     * - offerId is invalid
     * - offer has been voided
     * - offer has expired
     * - offer is not yet available for commits
     * - offer's quantity available is zero
     * - buyer address is zero
     * - buyer account is inactive
     * - buyer is token-gated (conditional commit requirements not met or already used)
     * - offer price is in native token and buyer caller does not send enough
     * - offer price is in some ERC20 token and caller also send native currency
     * - contract at token address does not support erc20 function transferFrom
     * - calling transferFrom on token fails for some reason (e.g. protocol is not approved to transfer)
     * - seller has less funds available than sellerDeposit
     *
     * @param _buyer - the buyer's address (caller can commit on behalf of a buyer)
     * @param _offerId - the id of the offer to commit to
     */
    function commitToOffer(address payable _buyer, uint256 _offerId) external payable override {
        // Make sure buyer address is not zero address
        require(_buyer != address(0), INVALID_ADDRESS);

        // Get the offer
        bool exists;
        Offer storage offer;
        (exists, offer) = fetchOffer(_offerId);

        // Make sure offer exists, is available, and isn't void, expired, or sold out
        require(exists, NO_SUCH_OFFER);

        OfferDates storage offerDates = fetchOfferDates(_offerId);
        require(block.timestamp >= offerDates.validFrom, OFFER_NOT_AVAILABLE);
        require(!offer.voided, OFFER_HAS_BEEN_VOIDED);
        require(block.timestamp < offerDates.validUntil, OFFER_HAS_EXPIRED);
        require(offer.quantityAvailable > 0, OFFER_SOLD_OUT);

        uint256 exchangeId = protocolCounters().nextExchangeId++;

        // Authorize the buyer to commit if offer is in a conditional group
        require(authorizeCommit(_buyer, offer, exchangeId), CANNOT_COMMIT);

        // Fetch or create buyer
        (uint256 buyerId, Buyer storage buyer) = getValidBuyer(_buyer);

        // Encumber funds before creating the exchange
        FundsLib.encumberFunds(_offerId, buyerId);

        // Create and store a new exchange
        Exchange storage exchange = protocolEntities().exchanges[exchangeId];
        exchange.id = exchangeId;
        exchange.offerId = _offerId;
        exchange.buyerId = buyerId;
        exchange.state = ExchangeState.Committed;
        exchange.voucher.committedDate = block.timestamp;

        // Determine the time after which the voucher can be redeemed
        uint256 startDate = (block.timestamp >= offerDates.voucherRedeemableFrom)
            ? block.timestamp
            : offerDates.voucherRedeemableFrom;

        // Determine the time after which the voucher can no longer be redeemed
        exchange.voucher.validUntilDate = (offerDates.voucherRedeemableUntil > 0)
            ? offerDates.voucherRedeemableUntil
            : startDate + fetchOfferDurations(_offerId).voucherValid;

        // Map the offerId to the exchangeId as one-to-many
        protocolLookups().exchangeIdsByOffer[_offerId].push(exchangeId);

        // Shoudn't decrement if offer is unlimited
        if (offer.quantityAvailable != type(uint256).max) {
            // Decrement offer's quantity available
            offer.quantityAvailable--;
        }

        // Issue voucher
        protocolLookups().voucherCount[buyerId]++;
        IBosonVoucher bosonVoucher = IBosonVoucher(protocolLookups().cloneAddress[offer.sellerId]);
        bosonVoucher.issueVoucher(exchangeId, buyer);

        // Notify watchers of state change
        emit BuyerCommitted(_offerId, buyerId, exchangeId, exchange, msgSender());
    }

    /**
     * @notice Complete an exchange.
     *
     * Reverts if
     * - Exchange does not exist
     * - Exchange is not in redeemed state
     * - Caller is not buyer and offer fulfillment period has not elapsed
     *
     * Emits
     * - ExchangeCompleted
     *
     * @param _exchangeId - the id of the exchange to complete
     */
    function completeExchange(uint256 _exchangeId) public override {
        // Get the exchange, should be in redeemed state
        Exchange storage exchange = getValidExchange(_exchangeId, ExchangeState.Redeemed);
        uint256 offerId = exchange.offerId;

        // Get the offer, which will definitely exist
        Offer storage offer;
        (, offer) = fetchOffer(offerId);

        // Is this the buyer?
        bool buyerExists;
        uint256 buyerId;
        (buyerExists, buyerId) = getBuyerIdByWallet(msgSender());

        // Buyer may call any time. Seller or anyone else may call after fulfillment period elapses
        // N.B. An existing buyer or seller may be the "anyone else" on an exchange they are not a part of
        if (!buyerExists || buyerId != exchange.buyerId) {
            uint256 elapsed = block.timestamp - exchange.voucher.redeemedDate;
            require(elapsed >= fetchOfferDurations(offerId).fulfillmentPeriod, FULFILLMENT_PERIOD_NOT_ELAPSED);
        }

        // Finalize the exchange
        finalizeExchange(exchange, ExchangeState.Completed);

        // Notify watchers of state change
        emit ExchangeCompleted(offerId, exchange.buyerId, exchange.id, msgSender());
    }

    /**
     * @notice Revoke a voucher.
     *
     * Reverts if
     * - Exchange does not exist
     * - Exchange is not in committed state
     * - Caller is not seller's operator
     *
     * Emits
     * - VoucherRevoked
     *
     * @param _exchangeId - the id of the exchange
     */
    function revokeVoucher(uint256 _exchangeId) external override {
        // Get the exchange, should be in committed state
        Exchange storage exchange = getValidExchange(_exchangeId, ExchangeState.Committed);

        // Get seller id associated with caller
        bool sellerExists;
        uint256 sellerId;
        (sellerExists, sellerId) = getSellerIdByOperator(msgSender());

        // Get the offer, which will definitely exist
        Offer storage offer;
        (, offer) = fetchOffer(exchange.offerId);

        // Only seller's operator may call
        require(sellerExists && offer.sellerId == sellerId, NOT_OPERATOR);

        revokeVoucherInternal(exchange);
    }

    /**
     * @notice Revoke a voucher.
     *
     * Reverts if
     * - Exchange is not in committed state
     *
     * Emits
     * - VoucherRevoked
     *
     * @param exchange - the exchange
     */
    function revokeVoucherInternal(Exchange storage exchange) internal {
        // Finalize the exchange, burning the voucher
        finalizeExchange(exchange, ExchangeState.Revoked);

        // Notify watchers of state change
        emit VoucherRevoked(exchange.offerId, exchange.id, msgSender());
    }

    /**
     * @notice Cancel a voucher.
     *
     * Reverts if
     * - Exchange does not exist
     * - Exchange is not in committed state
     * - Caller does not own voucher
     *
     * Emits
     * - VoucherCanceled
     *
     * @param _exchangeId - the id of the exchange
     */
    function cancelVoucher(uint256 _exchangeId) external override {
        // Get the exchange, should be in committed state
        Exchange storage exchange = getValidExchange(_exchangeId, ExchangeState.Committed);

        // Make sure the caller is buyer associated with the exchange
        checkBuyer(exchange.buyerId);

        // Finalize the exchange, burning the voucher
        finalizeExchange(exchange, ExchangeState.Canceled);

        // Notify watchers of state change
        emit VoucherCanceled(exchange.offerId, _exchangeId, msgSender());
    }

    /**
     * @notice Expire a voucher.
     *
     * Reverts if
     * - Exchange does not exist
     * - Exchange is not in committed state
     * - Redemption period has not yet elapsed
     *
     * Emits
     * - VoucherExpired
     *
     * @param _exchangeId - the id of the exchange
     */
    function expireVoucher(uint256 _exchangeId) external override {
        // Get the exchange, should be in committed state
        Exchange storage exchange = getValidExchange(_exchangeId, ExchangeState.Committed);

        // Make sure that the voucher has expired
        require(block.timestamp >= exchange.voucher.validUntilDate, VOUCHER_STILL_VALID);

        // Finalize the exchange, burning the voucher
        finalizeExchange(exchange, ExchangeState.Canceled);

        // Make it possible to determine how this exchange reached the Canceled state
        exchange.voucher.expired = true;

        // Notify watchers of state change
        emit VoucherExpired(exchange.offerId, _exchangeId, msgSender());
    }

    /**
     * @notice Extend a Voucher's validity period.
     *
     * Reverts if
     * - Exchange does not exist
     * - Exchange is not in committed state
     * - Caller is not seller's operator
     * - New date is not later than the current one
     *
     * Emits
     * - VoucherExtended
     *
     * @param _exchangeId - the id of the exchange
     * @param _validUntilDate - the new voucher expiry date
     */
    function extendVoucher(uint256 _exchangeId, uint256 _validUntilDate) external {
        // Get the exchange, should be in committed state
        Exchange storage exchange = getValidExchange(_exchangeId, ExchangeState.Committed);

        // Get the offer, which will definitely exist
        Offer storage offer;
        uint256 offerId = exchange.offerId;
        (, offer) = fetchOffer(offerId);

        // Get seller id associated with caller
        bool sellerExists;
        uint256 sellerId;
        (sellerExists, sellerId) = getSellerIdByOperator(msgSender());

        // Only seller's operator may call
        require(sellerExists && offer.sellerId == sellerId, NOT_OPERATOR);

        // Make sure the proposed date is later than the current one
        require(_validUntilDate > exchange.voucher.validUntilDate, VOUCHER_EXTENSION_NOT_VALID);

        // Extend voucher
        exchange.voucher.validUntilDate = _validUntilDate;

        // Notify watchers of state exchange
        emit VoucherExtended(offerId, _exchangeId, _validUntilDate, msgSender());
    }

    /**
     * @notice Redeem a voucher.
     *
     * Reverts if
     * - Exchange does not exist
     * - Exchange is not in committed state
     * - Caller does not own voucher
     * - Current time is prior to offer.voucherRedeemableFromDate
     * - Current time is after exchange.voucher.validUntilDate
     *
     * Emits
     * - VoucherRedeemed
     *
     * @param _exchangeId - the id of the exchange
     */
    function redeemVoucher(uint256 _exchangeId) external override {
        // Get the exchange, should be in committed state
        Exchange storage exchange = getValidExchange(_exchangeId, ExchangeState.Committed);
        uint256 offerId = exchange.offerId;

        // Make sure the caller is buyer associated with the exchange
        checkBuyer(exchange.buyerId);

        // Make sure the voucher is redeemable
        require(
            block.timestamp >= fetchOfferDates(offerId).voucherRedeemableFrom &&
                block.timestamp <= exchange.voucher.validUntilDate,
            VOUCHER_NOT_REDEEMABLE
        );

        // Store the time the exchange was redeemed
        exchange.voucher.redeemedDate = block.timestamp;

        // Set the exchange state to the Redeemed
        exchange.state = ExchangeState.Redeemed;

        // Transfer any bundled twins to buyer
        // N.B.: If voucher was revoked because transfer twin failed, then voucher was already burned
        bool shouldBurnVoucher = transferTwins(exchange);

        if (shouldBurnVoucher) {
            // Burn the voucher
            burnVoucher(exchange);
        }

        // Notify watchers of state change
        emit VoucherRedeemed(offerId, _exchangeId, msgSender());
    }

    /**
     * @notice Inform protocol of new buyer associated with an exchange
     *
     * Reverts if
     * - Caller is not a clone address associated with the seller
     * - Exchange does not exist
     * - Exchange is not in committed state
     * - Voucher has expired
     * - New buyer's existing account is deactivated
     *
     * @param _exchangeId - the id of the exchange
     * @param _newBuyer - the address of the new buyer
     */
    function onVoucherTransferred(uint256 _exchangeId, address payable _newBuyer) external override {
        // Get the exchange, should be in committed state
        Exchange storage exchange = getValidExchange(_exchangeId, ExchangeState.Committed);

        // Make sure that the voucher is still valid
        require(block.timestamp <= exchange.voucher.validUntilDate, VOUCHER_HAS_EXPIRED);

        (, Offer storage offer) = fetchOffer(exchange.offerId);

        // Make sure that the voucher was issued on the clone that is making a call
        require(msg.sender == protocolLookups().cloneAddress[offer.sellerId], ACCESS_DENIED);

        // Decrease voucher counter for old buyer
        protocolLookups().voucherCount[exchange.buyerId]--;

        // Fetch or create buyer
        (uint256 buyerId, ) = getValidBuyer(_newBuyer);

        // Update buyer id for the exchange
        exchange.buyerId = buyerId;

        // Increase voucher counter for new buyer
        protocolLookups().voucherCount[buyerId]++;

        // Notify watchers of state change
        emit VoucherTransferred(exchange.offerId, _exchangeId, buyerId, msgSender());
    }

    /**
     * @notice Is the given exchange in a finalized state?
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
     */
    function getExchange(uint256 _exchangeId) external view override returns (bool exists, Exchange memory exchange) {
        return fetchExchange(_exchangeId);
    }

    /**
     * @notice Gets the state of a given exchange.
     *
     * @param _exchangeId - the id of the exchange to check
     * @return exists - true if the exchange exists
     * @return state - the exchange state. See {BosonTypes.ExchangeStates}
     */
    function getExchangeState(uint256 _exchangeId) external view override returns (bool exists, ExchangeState state) {
        Exchange memory exchange;
        (exists, exchange) = fetchExchange(_exchangeId);
        if (exists) state = exchange.state;
    }

    /**
     * @notice Gets the Id that will be assigned to the next exchange.
     *
     *  Does not increment the counter.
     *
     * @return nextExchangeId - the next exchange Id
     */
    function getNextExchangeId() external view override returns (uint256 nextExchangeId) {
        nextExchangeId = protocolCounters().nextExchangeId;
    }

    /**
     * @notice Transition exchange to a "finalized" state
     *
     * Target state must be Completed, Revoked, or Canceled.
     * Sets finalizedDate and releases funds associated with the exchange
     */
    function finalizeExchange(Exchange storage _exchange, ExchangeState _targetState) internal {
        // Make sure target state is a final state
        require(
            _targetState == ExchangeState.Completed ||
                _targetState == ExchangeState.Revoked ||
                _targetState == ExchangeState.Canceled
        );

        // Set the exchange state to the target state
        _exchange.state = _targetState;

        // Store the time the exchange was finalized
        _exchange.finalizedDate = block.timestamp;

        // Burn the voucher if canceling or revoking
        if (_targetState != ExchangeState.Completed) burnVoucher(_exchange);

        // Release the funds
        FundsLib.releaseFunds(_exchange.id);
    }

    /**
     * @notice Burn the voucher associated with a given exchange
     *
     * @param _exchange - the pointer to the exchange
     */
    function burnVoucher(Exchange storage _exchange) internal {
        // decrease the voucher count
        protocolLookups().voucherCount[_exchange.buyerId]--;

        // burn the voucher
        (, Offer storage offer) = fetchOffer(_exchange.offerId);
        IBosonVoucher bosonVoucher = IBosonVoucher(protocolLookups().cloneAddress[offer.sellerId]);
        bosonVoucher.burnVoucher(_exchange.id);
    }

    /**
     * @notice Transfer bundled twins associated with an exchange to the buyer
     *
     * Reverts if
     * - a twin transfer fails
     *
     * @param _exchange - the exchange
     * @return shouldBurnVoucher - whether or not the voucher should be burned
     */
    function transferTwins(Exchange storage _exchange) internal returns (bool shouldBurnVoucher) {
        // See if there is an associated bundle
        (bool exists, uint256 bundleId) = fetchBundleIdByOffer(_exchange.offerId);

        // Voucher should be burned in the happy path
        shouldBurnVoucher = true;

        // Transfer the twins
        if (exists) {
            // Get storage location for bundle
            (, Bundle storage bundle) = fetchBundle(bundleId);

            // Get the twin Ids in the bundle
            uint256[] storage twinIds = bundle.twinIds;

            // Get seller account
            (, Seller storage seller, ) = fetchSeller(bundle.sellerId);

            address sender = msgSender();
            // Variable to track whether some twin transfer failed
            bool transferFailed;

            uint256 exchangeId = _exchange.id;

            // Visit the twins
            for (uint256 i = 0; i < twinIds.length; i++) {
                // Get the twin
                (, Twin storage twin) = fetchTwin(twinIds[i]);

                // Transfer the token from the seller's operator to the buyer
                // N.B. Using call here so as to normalize the revert reason
                bytes memory result;
                bool success;
                uint256 tokenId = twin.tokenId;
                TokenType tokenType = twin.tokenType;

                // Shouldn't decrement supply if twin supply is unlimited
                if (twin.supplyAvailable != type(uint256).max) {
                    // Decrement by 1 if token type is NonFungible otherwise decrement amount (i.e, tokenType is MultiToken or FungibleToken)
                    twin.supplyAvailable = twin.tokenType == TokenType.NonFungibleToken
                        ? twin.supplyAvailable - 1
                        : twin.supplyAvailable - twin.amount;
                }

                if (tokenType == TokenType.FungibleToken && twin.supplyAvailable >= twin.amount) {
                    // ERC-20 style transfer
                    (success, result) = twin.tokenAddress.call(
                        abi.encodeWithSignature(
                            "transferFrom(address,address,uint256)",
                            seller.operator,
                            msgSender(),
                            twin.amount
                        )
                    );
                } else if (tokenType == TokenType.NonFungibleToken && twin.supplyAvailable > 0) {
                    // Token transfer order is ascending to avoid overflow when twin supply is unlimited
                    if (twin.supplyAvailable == type(uint256).max) {
                        twin.tokenId++;
                    } else {
                        // Token transfer order is descending
                        tokenId = twin.tokenId + twin.supplyAvailable;
                    }
                    // ERC-721 style transfer
                    (success, result) = twin.tokenAddress.call(
                        abi.encodeWithSignature(
                            "safeTransferFrom(address,address,uint256,bytes)",
                            seller.operator,
                            msgSender(),
                            tokenId,
                            ""
                        )
                    );
                } else if (twin.tokenType == TokenType.MultiToken && twin.supplyAvailable >= twin.amount) {
                    // ERC-1155 style transfer
                    (success, result) = twin.tokenAddress.call(
                        abi.encodeWithSignature(
                            "safeTransferFrom(address,address,uint256,uint256,bytes)",
                            seller.operator,
                            msgSender(),
                            tokenId,
                            twin.amount,
                            ""
                        )
                    );
                }

                // If token transfer failed
                if (!success) {
                    transferFailed = true;

                    emit TwinTransferFailed(twin.id, twin.tokenAddress, exchangeId, tokenId, twin.amount, sender);
                } else {
                    // Store twin receipt on twinReceiptsByExchange
                    protocolLookups().twinReceiptsByExchange[exchangeId].push(
                        TwinReceipt(twin.id, tokenId, twin.amount, twin.tokenAddress, twin.tokenType)
                    );

                    emit TwinTransferred(twin.id, twin.tokenAddress, exchangeId, tokenId, twin.amount, sender);
                }
            }

            if (transferFailed) {
                // Raise a dispute if caller is a contract
                if (isContract(sender)) {
                    string memory complaint = "Twin transfer failed and buyer address is a contract";

                    raiseDisputeInternal(_exchange, complaint, seller.id);
                } else {
                    // Revoke voucher if caller is an EOA
                    revokeVoucherInternal(_exchange);
                    // N.B.: If voucher was revoked because transfer twin failed, then voucher was already burned
                    shouldBurnVoucher = false;
                }
            }
        }
    }

    /**
     * @notice Transfer the voucher associated with an exchange to the buyer
     *
     * Reverts if buyer is inactive
     *
     * @param _buyer - the buyer address
     * @return buyerId - the buyer id
     * @return buyer - the buyer account
     */
    function getValidBuyer(address payable _buyer) internal returns (uint256 buyerId, Buyer storage buyer) {
        // Find or create the account associated with the specified buyer address
        bool exists;
        (exists, buyerId) = getBuyerIdByWallet(_buyer);

        if (!exists) {
            // Create the buyer account
            Buyer memory newBuyer = Buyer(0, _buyer, true);
            createBuyerInternal(newBuyer);
            buyerId = newBuyer.id;
        }

        // Fetch the existing buyer account
        (, buyer) = fetchBuyer(buyerId);

        // Make sure buyer account is active
        require(buyer.active, MUST_BE_ACTIVE);
    }

    /**
     * @notice Authorize the potential buyer to commit to an offer
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
     *     against their allowable commits for the whole group.
     *   - If the buyer has already committed the maximum number of times for the
     *     group, they can't commit again to any of its offers.
     *
     * The buyer is allowed to commit if no group or condition is set for this offer.
     *
     * @param _buyer buyer address
     * @param _offer the offer
     * @param exchangeId - the exchange id
     *
     * @return bool true if buyer is authorized to commit
     */
    function authorizeCommit(
        address _buyer,
        Offer storage _offer,
        uint256 exchangeId
    ) internal returns (bool) {
        // Allow by default
        bool allow = true;

        // For there to be a condition, there must be a group.
        (bool exists, uint256 groupId) = getGroupIdByOffer(_offer.id);
        if (exists) {
            // Get the group
            (, Group storage group) = fetchGroup(groupId);

            // If a condition is set, investigate, otherwise all buyers are allowed
            if (group.condition.method != EvaluationMethod.None) {
                // How many times has this address committed to offers in the group?
                uint256 commitCount = protocolLookups().conditionalCommitsByAddress[_buyer][groupId];

                // Evaluate condition if buyer hasn't exhausted their allowable commits, otherwise disallow
                if (commitCount < group.condition.maxCommits) {
                    // Buyer is allowed if they meet the group's condition
                    allow = (group.condition.method == EvaluationMethod.Threshold)
                        ? holdsThreshold(_buyer, group.condition)
                        : holdsSpecificToken(_buyer, group.condition);

                    if (allow) {
                        // Increment number of commits to the group for this address if they are allowed to commit
                        protocolLookups().conditionalCommitsByAddress[_buyer][groupId] = ++commitCount;
                        // Store the condition to be returned afterward on getReceipt function
                        protocolLookups().exchangeCondition[exchangeId] = group.condition;
                    }
                } else {
                    // Buyer has exhausted their allowable commits
                    allow = false;
                }
            }
        }

        return allow;
    }

    /**
     * @notice Does the buyer have the required balance of the conditional token?
     *
     * @param _buyer address of potential buyer
     * @param _condition the condition to be evaluated
     *
     * @return bool true if buyer meets the condition
     */
    function holdsThreshold(address _buyer, Condition storage _condition) internal view returns (bool) {
        return
            (
                (_condition.tokenType == TokenType.MultiToken)
                    ? MultiToken(_condition.tokenAddress).balanceOf(_buyer, _condition.tokenId)
                    : Token(_condition.tokenAddress).balanceOf(_buyer)
            ) >= _condition.threshold;
    }

    /**
     * @notice Does the buyer own a specific non-fungible token Id?
     *
     * @param _buyer  address of potential buyer
     * @param _condition the condition to be evaluated
     *
     * @return bool true if buyer meets the condition
     */
    function holdsSpecificToken(address _buyer, Condition storage _condition) internal view returns (bool) {
        return (Token(_condition.tokenAddress).ownerOf(_condition.tokenId) == _buyer);
    }

    /**
     * @notice Verify if a given address is a contract or not (EOA)
     *
     * @param _address address to verify
     * @return bool true if _address is a contract
     */
    function isContract(address _address) private view returns (bool) {
        return _address.code.length > 0;
    }

    /**
     * @notice Complete a batch of exchanges
     *
     * Emits a ExchangeCompleted event for every exchange if finalized to the complete state.
     *
     * Reverts if:
     * - Number of exchanges exceeds maximum allowed number per batch
     * - for any exchange:
     *   - Exchange does not exist
     *   - Exchange is not in redeemed state
     *   - Caller is not buyer and offer fulfillment period has not elapsed
     *
     * @param _exchangeIds - the array of exchanges ids
     */
    function completeExchangeBatch(uint256[] calldata _exchangeIds) external override {
        // limit maximum number of exchanges to avoid running into block gas limit in a loop
        require(_exchangeIds.length <= protocolLimits().maxExchangesPerBatch, TOO_MANY_EXCHANGES);

        for (uint256 i = 0; i < _exchangeIds.length; i++) {
            // complete the exchange
            completeExchange(_exchangeIds[i]);
        }
    }

    /**
     * @notice Get exchange receipt
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
        require(exists, NO_SUCH_EXCHANGE);

        // Verify if exchange is finalized, returns true if exchange is in one of the final states
        (, bool isFinalized) = isExchangeFinalized(_exchangeId);
        require(isFinalized, EXCHANGE_IS_NOT_IN_A_FINAL_STATE);

        // Add exchange to receipt
        receipt.exchangeId = exchange.id;
        receipt.buyerId = exchange.buyerId;
        receipt.finalizedDate = exchange.finalizedDate;
        receipt.committedDate = exchange.voucher.committedDate;
        receipt.redeemedDate = exchange.voucher.redeemedDate;
        receipt.voucherExpired = exchange.voucher.expired;

        // Fetch offer, we assume offer exist if exchange exist
        (, Offer storage offer) = fetchOffer(exchange.offerId);
        receipt.offerId = offer.id;
        receipt.sellerId = offer.sellerId;
        receipt.price = offer.price;
        receipt.sellerDeposit = offer.sellerDeposit;
        receipt.buyerCancelPenalty = offer.buyerCancelPenalty;
        receipt.exchangeToken = offer.exchangeToken;

        // Fetch buyer
        (, Buyer storage buyer) = fetchBuyer(exchange.buyerId);
        receipt.buyerAddress = buyer.wallet;

        // Fetch seller
        (, Seller storage seller, ) = fetchSeller(offer.sellerId);
        receipt.sellerOperatorAddress = seller.operator;

        // Fetch offer fees
        OfferFees storage offerFees = fetchOfferFees(offer.id);
        receipt.offerFees = offerFees;

        // Fetch agent
        (bool agentExists, uint256 agentId) = fetchAgentIdByOffer(offer.id);

        // Add agent data to receipt if exists
        if (agentExists) {
            (, Agent storage agent) = fetchAgent(agentId);
            receipt.agentAddress = agent.wallet;
            receipt.agentId = agentId;
        }

        // We assume dispute exist if exchange is in disputed state
        if (exchange.state == ExchangeState.Disputed) {
            // Fetch dispute resolution terms
            DisputeResolutionTerms storage disputeResolutionTerms = fetchDisputeResolutionTerms(offer.id);

            // Add disputeResolverId to receipt
            receipt.disputeResolverId = disputeResolutionTerms.disputeResolverId;

            // Fetch disputeResolver account
            (, DisputeResolver storage disputeResolver, ) = fetchDisputeResolver(
                disputeResolutionTerms.disputeResolverId
            );

            // Add disputeResolverOperatorAddress to receipt
            receipt.disputeResolverOperatorAddress = disputeResolver.operator;

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
}
