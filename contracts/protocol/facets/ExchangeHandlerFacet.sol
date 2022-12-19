// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.9;

import { IBosonExchangeHandler } from "../../interfaces/handlers/IBosonExchangeHandler.sol";
import { IBosonAccountHandler } from "../../interfaces/handlers/IBosonAccountHandler.sol";
import { IBosonVoucher } from "../../interfaces/clients/IBosonVoucher.sol";
import { ITwinToken } from "../../interfaces/ITwinToken.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { BuyerBase } from "../bases/BuyerBase.sol";
import { DisputeBase } from "../bases/DisputeBase.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";
import { FundsLib } from "../libs/FundsLib.sol";
import "../../domain/BosonConstants.sol";
import { Address } from "../../ext_libs/Address.sol";
import { IERC1155 } from "../../interfaces/IERC1155.sol";
import { IERC721 } from "../../interfaces/IERC721.sol";
import { IERC20 } from "../../interfaces/IERC20.sol";

/**
 * @title ExchangeHandlerFacet
 *
 * @notice Handles exchanges associated with offers within the protocol.
 */
contract ExchangeHandlerFacet is IBosonExchangeHandler, BuyerBase, DisputeBase {
    using Address for address;

    /**
     * @notice Initializes facet.
     * This function is callable only once.
     */
    function initialize() public onlyUninitialized(type(IBosonExchangeHandler).interfaceId) {
        DiamondLib.addSupportedInterface(type(IBosonExchangeHandler).interfaceId);
    }

    /**
     * @notice Commits to an offer (first step of an exchange).
     *
     * Emits a BuyerCommitted event if successful.
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
     * - Buyer is token-gated (conditional commit requirements not met or already used)
     * - Offer price is in native token and caller does not send enough
     * - Offer price is in some ERC20 token and caller also sends native currency
     * - Contract at token address does not support ERC20 function transferFrom
     * - Calling transferFrom on token fails for some reason (e.g. protocol is not approved to transfer)
     * - Received ERC20 token amount differs from the expected value
     * - Seller has less funds available than sellerDeposit for non preminted offers
     * - Seller has less funds available than sellerDeposit and price for preminted offers
     *
     * @param _buyer - the buyer's address (caller can commit on behalf of a buyer)
     * @param _offerId - the id of the offer to commit to
     */
    function commitToOffer(address payable _buyer, uint256 _offerId)
        external
        payable
        override
        exchangesNotPaused
        buyersNotPaused
        nonReentrant
    {
        // Make sure buyer address is not zero address
        require(_buyer != address(0), INVALID_ADDRESS);

        // Get the offer
        bool exists;
        Offer storage offer;
        (exists, offer) = fetchOffer(_offerId);

        // Make sure offer exists, is available, and isn't void, expired, or sold out
        require(exists, NO_SUCH_OFFER);

        commitToOfferInternal(_buyer, offer, 0, false);
    }

    /**
     * @notice Commits to a preminted offer (first step of an exchange).
     *
     * Emits a BuyerCommitted event if successful.
     *
     * Reverts if:
     * - The exchanges region of protocol is paused
     * - The buyers region of protocol is paused
     * - Caller is not the voucher contract, owned by the seller
     * - Exchange exists already
     * - Offer has been voided
     * - Offer has expired
     * - Offer is not yet available for commits
     * - Buyer account is inactive
     * - Buyer is token-gated (conditional commit requirements not met or already used)
     * - Seller has less funds available than sellerDeposit for non preminted offers
     * - Seller has less funds available than sellerDeposit and price for preminted offers
     *
     * @param _buyer - the buyer's address (caller can commit on behalf of a buyer)
     * @param _offerId - the id of the offer to commit to
     * @param _exchangeId - the id of the exchange
     */
    function commitToPreMintedOffer(
        address payable _buyer,
        uint256 _offerId,
        uint256 _exchangeId
    ) external exchangesNotPaused buyersNotPaused nonReentrant {
        // Fetch the offer info
        (, Offer storage offer) = fetchOffer(_offerId);

        // Make sure that the voucher was issued on the clone that is making a call
        require(msg.sender == protocolLookups().cloneAddress[offer.sellerId], ACCESS_DENIED);

        // Exchange must not exist already
        (bool exists, ) = fetchExchange(_exchangeId);
        require(!exists, EXCHANGE_ALREADY_EXISTS);

        commitToOfferInternal(_buyer, offer, _exchangeId, true);
    }

    /**
     * @notice Commits to an offer. Helper function reused by commitToOffer and commitToPreMintedOffer.
     *
     * Emits a BuyerCommitted event if successful.
     * Issues a voucher to the buyer address for non preminted offers.
     *
     * Reverts if:
     * - Offer has been voided
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
     * - Seller has less funds available than sellerDeposit and price for preminted offers
     *
     * @param _buyer - the buyer's address (caller can commit on behalf of a buyer)
     * @param _offer - storage pointer to the offer
     * @param _exchangeId - the id of the exchange
     * @param _isPreminted - whether the offer is preminted
     */
    function commitToOfferInternal(
        address payable _buyer,
        Offer storage _offer,
        uint256 _exchangeId,
        bool _isPreminted
    ) internal {
        uint256 _offerId = _offer.id;
        // Make sure offer is available, and isn't void, expired, or sold out
        OfferDates storage offerDates = fetchOfferDates(_offerId);
        require(block.timestamp >= offerDates.validFrom, OFFER_NOT_AVAILABLE);
        require(!_offer.voided, OFFER_HAS_BEEN_VOIDED);
        require(block.timestamp < offerDates.validUntil, OFFER_HAS_EXPIRED);

        if (!_isPreminted) {
            // For non-preminted offers, quantityAvailable must be greater than zero, since it gets decremented
            require(_offer.quantityAvailable > 0, OFFER_SOLD_OUT);

            // Get next exchange id for non-preminted offers
            _exchangeId = protocolCounters().nextExchangeId++;
        }

        // Authorize the buyer to commit if offer is in a conditional group
        require(authorizeCommit(_buyer, _offer, _exchangeId), CANNOT_COMMIT);

        // Fetch or create buyer
        uint256 buyerId = getValidBuyer(_buyer);

        // Encumber funds before creating the exchange
        FundsLib.encumberFunds(_offerId, buyerId, _isPreminted);

        // Create and store a new exchange
        Exchange storage exchange = protocolEntities().exchanges[_exchangeId];
        exchange.id = _exchangeId;
        exchange.offerId = _offerId;
        exchange.buyerId = buyerId;
        exchange.state = ExchangeState.Committed;

        // Create and store a new voucher
        Voucher storage voucher = protocolEntities().vouchers[_exchangeId];
        voucher.committedDate = block.timestamp;

        // Operate in a block to avoid "stack too deep" error
        {
            // Cache protocol lookups for reference
            ProtocolLib.ProtocolLookups storage lookups = protocolLookups();

            // Determine the time after which the voucher can be redeemed
            uint256 startDate = (block.timestamp >= offerDates.voucherRedeemableFrom)
                ? block.timestamp
                : offerDates.voucherRedeemableFrom;

            // Determine the time after which the voucher can no longer be redeemed
            voucher.validUntilDate = (offerDates.voucherRedeemableUntil > 0)
                ? offerDates.voucherRedeemableUntil
                : startDate + fetchOfferDurations(_offerId).voucherValid;

            // Map the offerId to the exchangeId as one-to-many
            lookups.exchangeIdsByOffer[_offerId].push(_exchangeId);

            // Shouldn't decrement if offer is preminted or unlimited
            if (!_isPreminted && _offer.quantityAvailable != type(uint256).max) {
                // Decrement offer's quantity available
                _offer.quantityAvailable--;
            }

            // Issue voucher, unless it already exist (for preminted offers)
            lookups.voucherCount[buyerId]++;
            if (!_isPreminted) {
                IBosonVoucher bosonVoucher = IBosonVoucher(lookups.cloneAddress[_offer.sellerId]);
                bosonVoucher.issueVoucher(_exchangeId, _buyer);
            }
        }

        // Notify watchers of state change
        emit BuyerCommitted(_offerId, buyerId, _exchangeId, exchange, voucher, msgSender());
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
        address sender = msgSender();

        // Is this the buyer?
        bool buyerExists;
        uint256 buyerId;
        (buyerExists, buyerId) = getBuyerIdByWallet(sender);

        // Buyer may call any time. Seller or anyone else may call after dispute period elapses
        // N.B. An existing buyer or seller may be the "anyone else" on an exchange they are not a part of
        if (!buyerExists || buyerId != exchange.buyerId) {
            uint256 elapsed = block.timestamp - voucher.redeemedDate;
            require(elapsed >= fetchOfferDurations(offerId).disputePeriod, DISPUTE_PERIOD_NOT_ELAPSED);
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
     * - Number of exchanges exceeds maximum allowed number per batch
     * - For any exchange:
     *   - Exchange does not exist
     *   - Exchange is not in Redeemed state
     *   - Caller is not buyer and offer dispute period has not elapsed
     *
     * @param _exchangeIds - the array of exchanges ids
     */
    function completeExchangeBatch(uint256[] calldata _exchangeIds) external override exchangesNotPaused {
        // limit maximum number of exchanges to avoid running into block gas limit in a loop
        require(_exchangeIds.length <= protocolLimits().maxExchangesPerBatch, TOO_MANY_EXCHANGES);

        for (uint256 i = 0; i < _exchangeIds.length; i++) {
            // complete the exchange
            completeExchange(_exchangeIds[i]);
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
     * - Caller is not seller's operator
     *
     * @param _exchangeId - the id of the exchange
     */
    function revokeVoucher(uint256 _exchangeId) external override exchangesNotPaused nonReentrant {
        // Get the exchange, should be in committed state
        (Exchange storage exchange, ) = getValidExchange(_exchangeId, ExchangeState.Committed);

        // Get seller id associated with caller
        bool sellerExists;
        uint256 sellerId;
        (sellerExists, sellerId) = getSellerIdByOperator(msgSender());

        // Get the offer, which will definitely exist
        Offer storage offer;
        (, offer) = fetchOffer(exchange.offerId);

        // Only seller's operator may call
        require(sellerExists && offer.sellerId == sellerId, NOT_OPERATOR);

        // Revoke the voucher
        revokeVoucherInternal(exchange);
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
        emit VoucherCanceled(exchange.offerId, _exchangeId, msgSender());
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
        require(block.timestamp >= voucher.validUntilDate, VOUCHER_STILL_VALID);

        // Finalize the exchange, burning the voucher
        finalizeExchange(exchange, ExchangeState.Canceled);

        // Make it possible to determine how this exchange reached the Canceled state
        voucher.expired = true;

        // Notify watchers of state change
        emit VoucherExpired(exchange.offerId, _exchangeId, msgSender());
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
     * - Caller is not seller's operator
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
        address sender = msgSender();

        // Get seller id associated with caller
        bool sellerExists;
        uint256 sellerId;
        (sellerExists, sellerId) = getSellerIdByOperator(sender);

        // Only seller's operator may call
        require(sellerExists && offer.sellerId == sellerId, NOT_OPERATOR);

        // Make sure the proposed date is later than the current one
        require(_validUntilDate > voucher.validUntilDate, VOUCHER_EXTENSION_NOT_VALID);

        // Extend voucher
        voucher.validUntilDate = _validUntilDate;

        // Notify watchers of state exchange
        emit VoucherExtended(offerId, _exchangeId, _validUntilDate, sender);
    }

    /**
     * @notice Redeems a voucher.
     *
     * Emits a VoucherRedeemed event if successful.
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
        require(
            block.timestamp >= fetchOfferDates(offerId).voucherRedeemableFrom &&
                block.timestamp <= voucher.validUntilDate,
            VOUCHER_NOT_REDEEMABLE
        );

        // Store the time the exchange was redeemed
        voucher.redeemedDate = block.timestamp;

        // Set the exchange state to the Redeemed
        exchange.state = ExchangeState.Redeemed;

        // Transfer any bundled twins to buyer
        // N.B.: If voucher was revoked because transfer twin failed, then voucher was already burned
        bool shouldBurnVoucher = transferTwins(exchange, voucher);

        if (shouldBurnVoucher) {
            // Burn the voucher
            burnVoucher(exchange);
        }

        // Notify watchers of state change
        emit VoucherRedeemed(offerId, _exchangeId, msgSender());
    }

    /**
     * @notice Informs protocol of new buyer associated with an exchange.
     *
     * Emits a VoucherTransferred event if successful.
     *
     * Reverts if
     * - The buyers region of protocol is paused
     * - Caller is not a clone address associated with the seller
     * - Exchange does not exist
     * - Exchange is not in Committed state
     * - Voucher has expired
     * - New buyer's existing account is deactivated
     *
     * @param _exchangeId - the id of the exchange
     * @param _newBuyer - the address of the new buyer
     */
    function onVoucherTransferred(uint256 _exchangeId, address payable _newBuyer)
        external
        override
        buyersNotPaused
        nonReentrant
    {
        // Cache protocol lookups for reference
        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();

        // Get the exchange, should be in committed state
        (Exchange storage exchange, Voucher storage voucher) = getValidExchange(_exchangeId, ExchangeState.Committed);

        // Make sure that the voucher is still valid
        require(block.timestamp <= voucher.validUntilDate, VOUCHER_HAS_EXPIRED);

        (, Offer storage offer) = fetchOffer(exchange.offerId);

        // Make sure that the voucher was issued on the clone that is making a call
        require(msg.sender == lookups.cloneAddress[offer.sellerId], ACCESS_DENIED);

        // Decrease voucher counter for old buyer
        lookups.voucherCount[exchange.buyerId]--;

        // Fetch or create buyer
        uint256 buyerId = getValidBuyer(_newBuyer);

        // Update buyer id for the exchange
        exchange.buyerId = buyerId;

        // Increase voucher counter for new buyer
        lookups.voucherCount[buyerId]++;

        // Notify watchers of state change
        emit VoucherTransferred(exchange.offerId, _exchangeId, buyerId, msgSender());
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
    function getExchange(uint256 _exchangeId)
        external
        view
        override
        returns (
            bool exists,
            Exchange memory exchange,
            Voucher memory voucher
        )
    {
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
     * @notice Revokes a voucher.
     *
     * Emits a VoucherRevoked event if successful.
     *
     * Reverts if
     * - Exchange is not in Committed state
     *
     * @param exchange - the exchange to revoke
     */
    function revokeVoucherInternal(Exchange storage exchange) internal {
        // Finalize the exchange, burning the voucher
        finalizeExchange(exchange, ExchangeState.Revoked);

        // Notify watchers of state change
        emit VoucherRevoked(exchange.offerId, exchange.id, msgSender());
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
        (, Offer storage offer) = fetchOffer(_exchange.offerId);
        IBosonVoucher bosonVoucher = IBosonVoucher(lookups.cloneAddress[offer.sellerId]);
        bosonVoucher.burnVoucher(_exchange.id);
    }

    /**
     * @notice Transfers bundled twins associated with an exchange to the buyer.
     *
     * Emits ERC20 Transfer, ERC721 Transfer, or ERC1155 TransferSingle events in call stack if successful.
     *
     * Reverts if
     * - A twin transfer fails
     *
     * @param _exchange - the exchange for which twins should be transferred
     * @return shouldBurnVoucher - whether or not the voucher should be burned
     */
    function transferTwins(Exchange storage _exchange, Voucher storage _voucher)
        internal
        returns (bool shouldBurnVoucher)
    {
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

            // Variable to track whether some twin transfer failed
            bool transferFailed;

            uint256 exchangeId = _exchange.id;

            ProtocolLib.ProtocolLookups storage lookups = protocolLookups();

            address sender = msgSender();

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

                if (tokenType == TokenType.FungibleToken) {
                    // ERC-20 style transfer
                    (success, result) = twin.tokenAddress.call(
                        abi.encodeWithSignature(
                            "transferFrom(address,address,uint256)",
                            seller.operator,
                            sender,
                            twin.amount
                        )
                    );
                } else if (tokenType == TokenType.NonFungibleToken) {
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
                            sender,
                            tokenId,
                            ""
                        )
                    );
                } else if (twin.tokenType == TokenType.MultiToken) {
                    // ERC-1155 style transfer
                    (success, result) = twin.tokenAddress.call(
                        abi.encodeWithSignature(
                            "safeTransferFrom(address,address,uint256,uint256,bytes)",
                            seller.operator,
                            sender,
                            tokenId,
                            twin.amount,
                            ""
                        )
                    );
                }

                // If token transfer failed
                if (!success || (result.length > 0 && !abi.decode(result, (bool)))) {
                    transferFailed = true;
                    emit TwinTransferFailed(twin.id, twin.tokenAddress, exchangeId, tokenId, twin.amount, sender);
                } else {
                    // Store twin receipt on twinReceiptsByExchange
                    TwinReceipt storage twinReceipt = lookups.twinReceiptsByExchange[exchangeId].push();
                    twinReceipt.twinId = twin.id;
                    twinReceipt.tokenAddress = twin.tokenAddress;
                    twinReceipt.tokenId = tokenId;
                    twinReceipt.amount = twin.amount;
                    twinReceipt.tokenType = twin.tokenType;

                    emit TwinTransferred(twin.id, twin.tokenAddress, exchangeId, tokenId, twin.amount, sender);
                }
            }

            if (transferFailed) {
                // Raise a dispute if caller is a contract
                if (sender.isContract()) {
                    raiseDisputeInternal(_exchange, _voucher, seller.id);
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
     * @notice Checks if buyer exists for buyer address. If not, account is created for buyer address.
     *
     * Reverts if buyer exists but is inactive.
     *
     * @param _buyer - the buyer address to check
     * @return buyerId - the buyer id
     */
    function getValidBuyer(address payable _buyer) internal returns (uint256 buyerId) {
        // Find or create the account associated with the specified buyer address
        bool exists;
        (exists, buyerId) = getBuyerIdByWallet(_buyer);

        if (!exists) {
            // Create the buyer account
            Buyer memory newBuyer;
            newBuyer.wallet = _buyer;
            newBuyer.active = true;

            createBuyerInternal(newBuyer);
            buyerId = newBuyer.id;
        } else {
            // Fetch the existing buyer account
            (, Buyer storage buyer) = fetchBuyer(buyerId);

            // Make sure buyer account is active
            require(buyer.active, MUST_BE_ACTIVE);
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
     * @param _buyer buyer address
     * @param _offer the offer
     * @param exchangeId - the exchange id
     *
     * @return bool - true if buyer is authorized to commit
     */
    function authorizeCommit(
        address _buyer,
        Offer storage _offer,
        uint256 exchangeId
    ) internal returns (bool) {
        // Cache protocol lookups for reference
        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();

        // Allow by default
        bool allow = true;

        // For there to be a condition, there must be a group.
        (bool exists, uint256 groupId) = getGroupIdByOffer(_offer.id);
        if (exists) {
            // Get the condition
            Condition storage condition = fetchCondition(groupId);

            // If a condition is set, investigate, otherwise all buyers are allowed
            if (condition.method != EvaluationMethod.None) {
                // How many times has this address committed to offers in the group?
                uint256 commitCount = lookups.conditionalCommitsByAddress[_buyer][groupId];

                // Evaluate condition if buyer hasn't exhausted their allowable commits, otherwise disallow
                if (commitCount < condition.maxCommits) {
                    // Buyer is allowed if they meet the group's condition
                    allow = (condition.method == EvaluationMethod.Threshold)
                        ? holdsThreshold(_buyer, condition)
                        : holdsSpecificToken(_buyer, condition);

                    if (allow) {
                        // Increment number of commits to the group for this address if they are allowed to commit
                        lookups.conditionalCommitsByAddress[_buyer][groupId] = ++commitCount;
                        // Store the condition to be returned afterward on getReceipt function
                        lookups.exchangeCondition[exchangeId] = condition;
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
     * @notice Checks if the buyer has the required balance of the conditional token.
     *
     * @param _buyer - address of potential buyer
     * @param _condition - the condition to be evaluated
     *
     * @return bool - true if buyer meets the condition
     */
    function holdsThreshold(address _buyer, Condition storage _condition) internal view returns (bool) {
        uint256 balance;

        if (_condition.tokenType == TokenType.MultiToken) {
            balance = IERC1155(_condition.tokenAddress).balanceOf(_buyer, _condition.tokenId);
        } else if (_condition.tokenType == TokenType.NonFungibleToken) {
            balance = IERC721(_condition.tokenAddress).balanceOf(_buyer);
        } else {
            balance = IERC20(_condition.tokenAddress).balanceOf(_buyer);
        }
        return balance >= _condition.threshold;
    }

    /**
     * @notice Checks if the buyer own a specific non-fungible token id.
     *
     * @param _buyer - address of potential buyer
     * @param _condition - the condition to be evaluated
     *
     * @return bool - true if buyer meets the condition
     */
    function holdsSpecificToken(address _buyer, Condition storage _condition) internal view returns (bool) {
        return (IERC721(_condition.tokenAddress).ownerOf(_condition.tokenId) == _buyer);
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
        require(exists, NO_SUCH_EXCHANGE);

        // Verify if exchange is finalized, returns true if exchange is in one of the final states
        (, bool isFinalized) = isExchangeFinalized(_exchangeId);
        require(isFinalized, EXCHANGE_IS_NOT_IN_A_FINAL_STATE);

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
}
