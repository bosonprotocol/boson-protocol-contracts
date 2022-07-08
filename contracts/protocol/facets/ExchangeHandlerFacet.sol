// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import { IBosonExchangeHandler } from "../../interfaces/handlers/IBosonExchangeHandler.sol";
import { IBosonAccountHandler } from "../../interfaces/handlers/IBosonAccountHandler.sol";
import { IBosonVoucher } from "../../interfaces/clients/IBosonVoucher.sol";
import { ITwinToken } from "../../interfaces/ITwinToken.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { AccountBase } from "../bases/AccountBase.sol";
import { FundsLib } from "../libs/FundsLib.sol";

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
contract ExchangeHandlerFacet is IBosonExchangeHandler, AccountBase {
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
     * - if contract at token address does not support erc20 function transferFrom
     * - if calling transferFrom on token fails for some reason (e.g. protocol is not approved to transfer)
     * - if seller has less funds available than sellerDeposit
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

        // Authorize the buyer to commit if offer is in a conditional group
        require(authorizeCommit(_buyer, offer), CANNOT_COMMIT);

        // Fetch or create buyer
        (uint256 buyerId, Buyer storage buyer) = getValidBuyer(_buyer);

        // Encumber funds before creating the exchange
        FundsLib.encumberFunds(_offerId, buyerId);

        // Create and store a new exchange
        uint256 exchangeId = protocolCounters().nextExchangeId++;
        Exchange storage exchange = protocolEntities().exchanges[exchangeId];
        exchange.id = exchangeId;
        exchange.offerId = _offerId;
        exchange.buyerId = buyerId;
        exchange.state = ExchangeState.Committed;
        exchange.voucher.committedDate = block.timestamp;

        // Store the time the voucher expires // TODO: implement the start and and based on new requirements
        uint256 startDate = (block.timestamp >= offerDates.voucherRedeemableFrom)
            ? block.timestamp
            : offerDates.voucherRedeemableFrom;
        exchange.voucher.validUntilDate = startDate + fetchOfferDurations(_offerId).voucherValid;

        // Map the offerId to the exchangeId as one-to-many
        protocolLookups().exchangeIdsByOffer[_offerId].push(exchangeId);

        // Decrement offer's quantity available
        offer.quantityAvailable--;

        // Issue voucher
        IBosonVoucher bosonVoucher = IBosonVoucher(protocolAddresses().voucherAddress);
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
     * - Caller is not buyer or seller's operator
     * - Caller is seller's operator and offer fulfillment period has not elapsed
     *
     * Emits
     * - ExchangeCompleted
     *
     * @param _exchangeId - the id of the exchange to complete
     */
    function completeExchange(uint256 _exchangeId) external override {
        // Get the exchange, should be in redeemed state
        Exchange storage exchange = getValidExchange(_exchangeId, ExchangeState.Redeemed);
        uint256 offerId = exchange.offerId;

        // Get the offer, which will definitely exist
        Offer storage offer;
        (, offer) = fetchOffer(offerId);

        // Get seller id associated with caller
        bool sellerExists;
        uint256 sellerId;
        (sellerExists, sellerId) = getSellerIdByOperator(msgSender());

        // Seller may only call after fulfillment period elapses, buyer may call any time
        if (sellerExists && offer.sellerId == sellerId) {
            // Make sure the fulfillment period has elapsed
            uint256 elapsed = block.timestamp - exchange.voucher.redeemedDate;
            require(elapsed >= fetchOfferDurations(offerId).fulfillmentPeriod, FULFILLMENT_PERIOD_NOT_ELAPSED);
        } else {
            // Is this the buyer?
            bool buyerExists;
            uint256 buyerId;
            (buyerExists, buyerId) = getBuyerIdByWallet(msgSender());
            require(buyerExists && buyerId == exchange.buyerId, NOT_BUYER_OR_SELLER);
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

        // Get the offer, which will definitely exist
        Offer storage offer;
        (, offer) = fetchOffer(exchange.offerId);

        // Get seller id associated with caller
        bool sellerExists;
        uint256 sellerId;
        (sellerExists, sellerId) = getSellerIdByOperator(msgSender());

        // Only seller's operator may call
        require(sellerExists && offer.sellerId == sellerId, NOT_OPERATOR);

        // Finalize the exchange, burning the voucher
        finalizeExchange(exchange, ExchangeState.Revoked);

        // Notify watchers of state change
        emit VoucherRevoked(offer.id, _exchangeId, msgSender());
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

        // Burn the voucher
        burnVoucher(_exchangeId);

        // Transfer any bundled twins to buyer
        transferTwins(exchange);

        // Notify watchers of state change
        emit VoucherRedeemed(offerId, _exchangeId, msgSender());
    }

    /**
     * @notice Inform protocol of new buyer associated with an exchange
     *
     * Reverts if
     * - Caller does not have CLIENT role
     * - Exchange does not exist
     * - Exchange is not in committed state
     * - Voucher has expired
     * - New buyer's existing account is deactivated
     *
     * @param _exchangeId - the id of the exchange
     * @param _newBuyer - the address of the new buyer
     */
    function onVoucherTransferred(uint256 _exchangeId, address payable _newBuyer) external override onlyRole(CLIENT) {
        // Get the exchange, should be in committed state
        Exchange storage exchange = getValidExchange(_exchangeId, ExchangeState.Committed);

        // Make sure that the voucher is still valid
        require(block.timestamp <= exchange.voucher.validUntilDate, VOUCHER_HAS_EXPIRED);

        // Fetch or create buyer
        (uint256 buyerId, ) = getValidBuyer(_newBuyer);

        // Update buyer id for the exchange
        exchange.buyerId = buyerId;

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
    function isExchangeFinalized(uint256 _exchangeId) external view override returns (bool exists, bool isFinalized) {
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
        if (_targetState != ExchangeState.Completed) burnVoucher(_exchange.id);

        // Release the funds
        FundsLib.releaseFunds(_exchange.id);
    }

    /**
     * @notice Burn the voucher associated with a given exchange
     *
     * @param _exchangeId - the id of the exchange
     */
    function burnVoucher(uint256 _exchangeId) internal {
        IBosonVoucher bosonVoucher = IBosonVoucher(protocolAddresses().voucherAddress);
        bosonVoucher.burnVoucher(_exchangeId);
    }

    /**
     * @notice Transfer bundled twins associated with an exchange to the buyer
     *
     * Reverts if
     * - a twin transfer fails
     *
     * @param _exchange - the exchange
     */
    function transferTwins(Exchange storage _exchange) internal {
        // See if there is an associated bundle
        (bool exists, uint256 bundleId) = fetchBundleIdByOffer(_exchange.offerId);

        // Transfer the twins
        if (exists) {
            // Get storage location for bundle
            (, Bundle storage bundle) = fetchBundle(bundleId);

            // Get the twin Ids in the bundle
            uint256[] storage twinIds = bundle.twinIds;

            // Get seller account
            (, Seller storage seller) = fetchSeller(bundle.sellerId);

            // Visit the twins
            for (uint256 i = 0; i < twinIds.length; i++) {
                // Get the twin
                (, Twin storage twin) = fetchTwin(twinIds[i]);

                // Transfer the token from the seller's operator to the buyer
                // N.B. Using call here so as to normalize the revert reason
                bool success;
                bytes memory result;
                if (twin.tokenType == TokenType.FungibleToken && twin.supplyAvailable >= twin.amount) {
                    // ERC-20 style transfer
                    uint256 amount = twin.amount;
                    twin.supplyAvailable -= amount;
                    (success, result) = twin.tokenAddress.call(
                        abi.encodeWithSignature(
                            "transferFrom(address,address,uint256)",
                            seller.operator,
                            msgSender(),
                            amount
                        )
                    );
               } else if (twin.tokenType == TokenType.NonFungibleToken && twin.supplyAvailable > 0) {
                    // ERC-721 style transfer
                    uint256 tokenId = twin.tokenId + twin.supplyAvailable - 1;
                    twin.supplyAvailable--;
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
                    uint256 amount = twin.amount;
                    twin.supplyAvailable -= amount;
                    (success, result) = twin.tokenAddress.call(
                        abi.encodeWithSignature(
                            "safeTransferFrom(address,address,uint256,uint256,bytes)",
                            seller.operator,
                            msgSender(),
                            twin.tokenId,
                            amount,
                            ""
                        )
                    );
                }
            }
            // @TODO comment the line below because we assume that for now we'll not revert the redeem if Twin transfer failed.
            // require(success, TWIN_TRANSFER_FAILED);
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
     *
     * @return bool true if buyer is authorized to commit
     */
    function authorizeCommit(address _buyer, Offer storage _offer)
    internal
    returns (bool)
    {
        // Allow by default
        bool allow = true;

        // For there to be a condition, there must be a group.
        (bool exists, uint256 groupId) = getGroupIdByOffer(_offer.id);
        if (exists) {

            // Get the group
            (,Group storage group) = fetchGroup(groupId);

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

                    // Increment number of commits to the group for this address if they are allowed to commit
                    if (allow) protocolLookups().conditionalCommitsByAddress[_buyer][groupId] = ++commitCount;

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
    function holdsThreshold(address _buyer, Condition storage _condition)
    internal
    view
    returns (bool)
    {
        return
        ((_condition.tokenType == TokenType.MultiToken)
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
    function holdsSpecificToken(address _buyer, Condition storage _condition)
    internal
    view
    returns (bool)
    {
        return (Token(_condition.tokenAddress).ownerOf(_condition.tokenId) == _buyer);
    }

}
