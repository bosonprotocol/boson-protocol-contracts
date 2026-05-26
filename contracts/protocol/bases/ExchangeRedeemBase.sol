// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.35;

import "../../domain/BosonConstants.sol";
import { IBosonExchangeEvents } from "../../interfaces/events/IBosonExchangeEvents.sol";
import { IBosonTwinEvents } from "../../interfaces/events/IBosonTwinEvents.sol";
import { IBosonVoucher } from "../../interfaces/clients/IBosonVoucher.sol";
import { DisputeBase } from "./DisputeBase.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Address } from "@openzeppelin/contracts/utils/Address.sol";

/**
 * @title ExchangeRedeemBase
 *
 * @notice Shared logic for redeeming vouchers, burning the underlying voucher NFT,
 * and transferring bundled twins. Reused by ExchangeHandlerFacet (for the standalone
 * redeemVoucher entry point and finalizeExchange) and OrchestrationHandlerFacet2 (for
 * atomic commit-and-redeem orchestration methods).
 */
contract ExchangeRedeemBase is DisputeBase, IBosonExchangeEvents, IBosonTwinEvents {
    using Address for address;
    uint256 internal immutable EXCHANGE_ID_2_2_0; // solhint-disable-line

    /**
     * @notice Burns the voucher associated with a given exchange.
     *
     * Emits ERC721 Transfer event in call stack if successful.
     *
     * @param _exchange - the pointer to the exchange for which the voucher should be burned
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
     * @notice Redeems a voucher (internal).
     *
     * Emits a VoucherRedeemed event if successful.
     * Emits TwinTransferred / TwinTransferFailed / TwinTransferSkipped depending on twin transfer outcome.
     *
     * Reverts if:
     * - Exchange does not exist
     * - Exchange is not in Committed state
     * - When `_skipVoucher` is false: the caller does not own the voucher
     * - Current time is prior to offer.voucherRedeemableFromDate
     * - Current time is after voucher.validUntilDate
     *
     * @param _exchangeId - the id of the exchange
     * @param _skipVoucher - when true, skip the bosonVoucher.burnVoucher() call and the
     *                       voucherCount[buyerId]-- write, AND skip the buyer-ownership
     *                       check. The flag is only set by atomic commit-and-redeem
     *                       orchestration paths, where `commitToOfferInternal` was just
     *                       called with `_committer = _msgSender()` in the same
     *                       transaction. Because the matching voucher mint was skipped,
     *                       no NFT exists for anyone to transfer, so the buyer recorded
     *                       on the exchange is provably still the caller — no need to
     *                       re-check.
     */
    function redeemVoucherInternal(uint256 _exchangeId, bool _skipVoucher) internal {
        // Get the exchange, should be in committed state
        (Exchange storage exchange, Voucher storage voucher) = getValidExchange(_exchangeId, ExchangeState.Committed);

        // Standalone redeemVoucher path: enforce that the caller owns the voucher.
        // Skipped on the orchestration commit-and-redeem path because the voucher was
        // never minted (see _skipVoucher in the natspec above), so it cannot have been
        // transferred — exchange.buyerId is guaranteed to correspond to _msgSender().
        if (!_skipVoucher) checkBuyer(exchange.buyerId);

        uint256 offerId = exchange.offerId;

        // Make sure the voucher is redeemable
        if (
            block.timestamp < fetchOfferDates(offerId).voucherRedeemableFrom || block.timestamp > voucher.validUntilDate
        ) {
            revert VoucherNotRedeemable();
        }

        // Store the time the exchange was redeemed
        voucher.redeemedDate = block.timestamp;

        // Set the exchange state to Redeemed
        exchange.state = ExchangeState.Redeemed;

        // Burn the voucher unless the matching mint was skipped on the commit side
        // (atomic commit-and-redeem orchestration).
        if (!_skipVoucher) burnVoucher(exchange);

        // Transfer any bundled twins to buyer
        transferTwins(exchange, voucher);

        // Notify watchers of state change
        emit VoucherRedeemed(offerId, _exchangeId, _msgSender());
    }

    /**
     * @notice Transfers bundled twins associated with an exchange to the buyer.
     *
     * Emits ERC20 Transfer, ERC721 Transfer, or ERC1155 TransferSingle events in call stack if successful.
     * Emits TwinTransferred if twin transfer was successful.
     * Emits TwinTransferFailed if twin transfer failed.
     * Emits TwinTransferSkipped if twin transfer was skipped when the number of twins is too high.
     *
     * If one of the twin transfers fails, the function will continue to transfer the remaining twins and
     * automatically raises a dispute for the exchange.
     *
     * @param _exchange - the exchange for which twins should be transferred
     * @param _voucher - the voucher associated with the exchange
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
            // Overflow happens for twinCount ~ 7.2x10^71, which is impossible to achieve
            uint256 reservedGas = (twinCount - 1) * SINGLE_TWIN_RESERVED_GAS + MINIMAL_RESIDUAL_GAS;

            // If number of twins is too high, skip the transfer and mark the transfer as failed.
            // Reserved gas is higher than the actual gas needed for successful twin redeem.
            // There is enough buffer that even if the reserved gas is above gas limit, the redeem will still succeed.
            // This check was added to prevent the DoS attack where the attacker would create a bundle with a huge number of twins.
            // For normal operations this still allows for a bundle with more than 180 twins to be redeemed, which should be enough for practical purposes.
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
                                    // If return data is longer than 32 bytes, consider transfer unsuccessful
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

                    // Reduce minimum gas required for successful execution
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
     * @notice Updates NFT ranges, so it's possible to reuse the tokens in other twins and to make
     * creation of new ranges viable.
     *
     * @param _lookups - storage pointer to the protocol lookups
     * @param _twin - storage pointer to the twin
     * @param _sellerId - the seller id
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
