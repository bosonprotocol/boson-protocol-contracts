// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import { IBosonVoucher } from "../interfaces/clients/IBosonVoucher.sol";
import { BuyerBase } from "../protocol/bases/BuyerBase.sol";
import { DisputeBase } from "../protocol/bases/DisputeBase.sol";
import "../domain/BosonConstants.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import { ExchangeHandlerFacet } from "../protocol/facets/ExchangeHandlerFacet.sol";

/**
 * @title MockExchangeHandlerFacet
 *
 * @notice Handles exchanges associated with offers within the protocol
 */
contract MockExchangeHandlerFacet is BuyerBase, DisputeBase {
    event VoucherRedeemed2(uint256 indexed offerId, uint256 indexed exchangeId, address indexed executedBy);
    event VoucherRevoked2(uint256 indexed offerId, uint256 indexed exchangeId, address indexed executedBy);
    event TwinTransferred2(
        uint256 indexed twinId,
        address indexed tokenAddress,
        uint256 indexed exchangeId,
        uint256 tokenId,
        uint256 amount,
        address executedBy
    );
    event TwinTransferFailed2(
        uint256 indexed twinId,
        address indexed tokenAddress,
        uint256 indexed exchangeId,
        uint256 tokenId,
        uint256 amount,
        address executedBy
    );
    event ExchangeCompleted2(
        uint256 indexed offerId,
        uint256 indexed buyerId,
        uint256 indexed exchangeId,
        address executedBy
    );
    event VoucherCanceled2(uint256 indexed offerId, uint256 indexed exchangeId, address indexed executedBy);
    event VoucherExpired2(uint256 indexed offerId, uint256 indexed exchangeId, address indexed executedBy);
    event VoucherExtended2(
        uint256 indexed offerId,
        uint256 indexed exchangeId,
        uint256 validUntil,
        address indexed executedBy
    );

    using Address for address;

    /**
     * @notice Completes an exchange.
     *
     * Emits an ExchangeCompleted2 event if successful.
     *
     * Reverts if
     * - The exchanges region of protocol is paused
     * - Exchange does not exist
     * - Exchange is not in Redeemed state
     * - Caller is not buyer and offer dispute period has not elapsed
     *
     * @param _exchangeId - the id of the exchange to complete
     */
    function completeExchange(uint256 _exchangeId) public exchangesNotPaused nonReentrant {
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
            if (elapsed < fetchOfferDurations(offerId).disputePeriod) {
                revert DisputePeriodNotElapsed();
            }
        }

        // Finalize the exchange
        finalizeExchange(exchange, ExchangeState.Completed);

        // Notify watchers of state change
        emit ExchangeCompleted2(offerId, exchange.buyerId, exchange.id, sender);
    }

    /**
     * @notice Completes a batch of exchanges.
     *
     * Emits an ExchangeCompleted2 event for every exchange if finalized to the Complete state.
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
    function completeExchangeBatch(uint256[] calldata _exchangeIds) external exchangesNotPaused {
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
     * Emits a VoucherRevoked2 event if successful.
     *
     * Reverts if
     * - The exchanges region of protocol is paused
     * - Exchange does not exist
     * - Exchange is not in Committed state
     * - Caller is not seller's assistant
     *
     * @param _exchangeId - the id of the exchange
     */
    function revokeVoucher(uint256 _exchangeId) external exchangesNotPaused nonReentrant {
        // Get the exchange, should be in committed state
        (Exchange storage exchange, ) = getValidExchange(_exchangeId, ExchangeState.Committed);

        // Get seller id associated with caller
        bool sellerExists;
        uint256 sellerId;
        (sellerExists, sellerId) = getSellerIdByAssistant(msgSender());

        // Get the offer, which will definitely exist
        Offer storage offer;
        (, offer) = fetchOffer(exchange.offerId);

        // Only seller's assistant may call
        if (!sellerExists || offer.sellerId != sellerId) {
            revert NotAssistant();
        }

        // Revoke the voucher
        revokeVoucherInternal(exchange);
    }

    /**
     * @notice Cancels a voucher.
     *
     * Emits a VoucherCanceled2 event if successful.
     *
     * Reverts if
     * - The exchanges region of protocol is paused
     * - Exchange does not exist
     * - Exchange is not in Committed state
     * - Caller does not own voucher
     *
     * @param _exchangeId - the id of the exchange
     */
    function cancelVoucher(uint256 _exchangeId) external virtual exchangesNotPaused nonReentrant {
        // Get the exchange, should be in committed state
        (Exchange storage exchange, ) = getValidExchange(_exchangeId, ExchangeState.Committed);

        // Make sure the caller is buyer associated with the exchange
        checkBuyer(exchange.buyerId);

        // Finalize the exchange, burning the voucher
        finalizeExchange(exchange, ExchangeState.Canceled);

        // Notify watchers of state change
        emit VoucherCanceled2(exchange.offerId, _exchangeId, msgSender());
    }

    /**
     * @notice Expires a voucher.
     *
     * Emits a VoucherExpired2 event if successful.
     *
     * Reverts if
     * - The exchanges region of protocol is paused
     * - Exchange does not exist
     * - Exchange is not in Committed state
     * - Redemption period has not yet elapsed
     *
     * @param _exchangeId - the id of the exchange
     */
    function expireVoucher(uint256 _exchangeId) external exchangesNotPaused nonReentrant {
        // Get the exchange, should be in committed state
        (Exchange storage exchange, Voucher storage voucher) = getValidExchange(_exchangeId, ExchangeState.Committed);

        // Make sure that the voucher has expired
        if (block.timestamp < voucher.validUntilDate) {
            revert VoucherStillValid();
        }

        // Finalize the exchange, burning the voucher
        finalizeExchange(exchange, ExchangeState.Canceled);

        // Make it possible to determine how this exchange reached the Canceled state
        voucher.expired = true;

        // Notify watchers of state change
        emit VoucherExpired2(exchange.offerId, _exchangeId, msgSender());
    }

    /**
     * @notice Extends a Voucher's validity period.
     *
     * Emits a VoucherExtended2 event if successful.
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
        address sender = msgSender();

        // Get seller id associated with caller
        bool sellerExists;
        uint256 sellerId;
        (sellerExists, sellerId) = getSellerIdByAssistant(sender);

        // Only seller's assistant may call
        if (!sellerExists || offer.sellerId != sellerId) {
            revert NotAssistant();
        }

        // Make sure the proposed date is later than the current one
        if (_validUntilDate <= voucher.validUntilDate) {
            revert VoucherExtensionNotValid();
        }

        // Extend voucher
        voucher.validUntilDate = _validUntilDate;

        // Notify watchers of state exchange
        emit VoucherExtended2(offerId, _exchangeId, _validUntilDate, sender);
    }

    /**
     * @notice Redeems a voucher.
     *
     * Emits a VoucherRedeemed2 event if successful.
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
    function redeemVoucher(uint256 _exchangeId) external exchangesNotPaused nonReentrant {
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

        // Transfer any bundled twins to buyer
        // N.B.: If voucher was revoked because transfer twin failed, then voucher was already burned
        bool shouldBurnVoucher = transferTwins(exchange, voucher);

        if (shouldBurnVoucher) {
            // Burn the voucher
            burnVoucher(exchange);
        }

        // Notify watchers of state change
        emit VoucherRedeemed2(offerId, _exchangeId, msgSender());
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
        releaseFunds(_exchange.id);
    }

    /**
     * @notice Revokes a voucher.
     *
     * Emits a VoucherRevoked2 event if successful.
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
        emit VoucherRevoked2(exchange.offerId, exchange.id, msgSender());
    }

    /**
     * @notice Burns the voucher associated with a given exchange.
     *
     * Emits ERC721 Transfer event in call stack if successful.
     *
     * @param _exchange - the pointer to the exchange for which voucher should be burned
     */
    function burnVoucher(Exchange storage _exchange) internal {
        // Decrease the voucher count
        protocolLookups().voucherCount[_exchange.buyerId]--;

        // Burn the voucher
        (, Offer storage offer) = fetchOffer(_exchange.offerId);
        IBosonVoucher bosonVoucher = IBosonVoucher(protocolLookups().cloneAddress[offer.sellerId]);
        uint256 tokenId = _exchange.id + (_exchange.offerId << 128);
        bosonVoucher.burnVoucher(tokenId);
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
    function transferTwins(
        Exchange storage _exchange,
        Voucher storage _voucher
    ) internal returns (bool shouldBurnVoucher) {
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
            for (uint256 i = 0; i < twinIds.length; ) {
                // Get the twin
                (, Twin storage twin) = fetchTwin(twinIds[i]);

                // Transfer the token from the seller's assistant to the buyer
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
                            seller.assistant,
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
                            seller.assistant,
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
                            seller.assistant,
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
                    emit TwinTransferFailed2(twin.id, twin.tokenAddress, exchangeId, tokenId, twin.amount, sender);
                } else {
                    // Store twin receipt on twinReceiptsByExchange
                    protocolLookups().twinReceiptsByExchange[exchangeId].push(
                        TwinReceipt(twin.id, tokenId, twin.amount, twin.tokenAddress, twin.tokenType)
                    );

                    emit TwinTransferred2(twin.id, twin.tokenAddress, exchangeId, tokenId, twin.amount, sender);
                }

                unchecked {
                    i++;
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
}

contract MockExchangeHandlerFacetWithDefect is MockExchangeHandlerFacet {
    /**
     * @notice Cancels a voucher without finalizing the exchange. Hence introduces a defect.
     *
     * Emits a VoucherCanceled2 event if successful.
     *
     * Reverts if
     * - The exchanges region of protocol is paused
     * - Exchange does not exist
     * - Caller does not own voucher
     *
     * @param _exchangeId - the id of the exchange
     */
    function cancelVoucher(uint256 _exchangeId) external override exchangesNotPaused nonReentrant {
        // Get the exchange, should be in committed state
        (Exchange storage exchange, ) = getValidExchange(_exchangeId, ExchangeState.Committed);

        // Make sure the caller is buyer associated with the exchange
        checkBuyer(exchange.buyerId);

        // finalizeExchange() is not executed.

        // Notify watchers of state change
        emit VoucherCanceled2(exchange.offerId, _exchangeId, msgSender());
    }
}

/**
 * @title TestExchangeHandlerFacet
 *
 * @notice Extended ExchangeHandlerFacet with additional external functions for testing
 */
contract TestExchangeHandlerFacet is ExchangeHandlerFacet {
    //solhint-disable-next-line
    constructor(uint256 _firstExchangeId2_2_0) ExchangeHandlerFacet(_firstExchangeId2_2_0) {}

    /**
     * @notice Test function to test invalid final exchange state
     *
     * @param _exchangeId - the id of the exchange to finalize
     * @param _targetState - the target state to which the exchange should be transitioned
     */
    function finalizeExchange(uint256 _exchangeId, ExchangeState _targetState) external {
        (, Exchange storage exchange) = fetchExchange(_exchangeId);
        finalizeExchange(exchange, _targetState);
    }
}
