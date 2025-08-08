// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import "../../domain/BosonConstants.sol";
import { BosonErrors } from "../../domain/BosonErrors.sol";
import { IBosonExchangeManagementHandler } from "../../interfaces/handlers/IBosonExchangeManagementHandler.sol";
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
 * @notice Handles exchange lifecycle management within the protocol.
 * This facet contains functions for managing existing exchanges including voucher lifecycle,
 * completion, and query operations.
 */
contract ExchangeHandlerFacet is DisputeBase, BuyerBase, IBosonExchangeManagementHandler {
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
    function initialize() public onlyUninitialized(type(IBosonExchangeManagementHandler).interfaceId) {
        DiamondLib.addSupportedInterface(type(IBosonExchangeManagementHandler).interfaceId);
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
}
