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
 * and transferring bundled twins. Reused by both ExchangeHandlerFacet (for the standalone
 * redeemVoucher entry point and finalizeExchange) and ExchangeCommitFacet (for atomic
 * commit-and-redeem orchestration methods).
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
     * - When _enforceBuyerCheck is true and the caller does not own the voucher
     * - Current time is prior to offer.voucherRedeemableFromDate
     * - Current time is after voucher.validUntilDate
     *
     * @param _exchangeId - the id of the exchange
     */
    function redeemVoucherInternal(uint256 _exchangeId) internal {
        // Get the exchange, should be in committed state
        (Exchange storage exchange, Voucher storage voucher) = getValidExchange(_exchangeId, ExchangeState.Committed);

        // Check buyer even in orchestration flows, to prevent unauthorized redemption of vouchers that could occur if a buyer commits to an offer and then transfers the voucher to another address before redeeming
        checkBuyer(exchange.buyerId);

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

        // Burn the voucher
        burnVoucher(exchange);

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
            uint256 reservedGas = (twinCount - 1) * SINGLE_TWIN_RESERVED_GAS + MINIMAL_RESIDUAL_GAS;

            if (reservedGas > block.gaslimit) {
                transferFailed = true;

                emit TwinTransferSkipped(_exchange.id, twinCount, sender);
            } else {
                for (uint256 i = 0; i < twinCount; ) {
                    (, Twin storage twinS) = fetchTwin(twinIds[i]);

                    Twin memory twinM;
                    twinM.tokenId = twinS.tokenId;
                    twinM.amount = twinS.amount;

                    bool success;
                    {
                        twinM.tokenType = twinS.tokenType;

                        twinM.supplyAvailable = twinS.supplyAvailable;
                        if (twinM.supplyAvailable != type(uint256).max) {
                            twinM.supplyAvailable = twinM.tokenType == TokenType.NonFungibleToken
                                ? twinM.supplyAvailable - 1
                                : twinM.supplyAvailable - twinM.amount;

                            twinS.supplyAvailable = twinM.supplyAvailable;
                        }

                        bytes memory data;

                        if (twinM.tokenType == TokenType.FungibleToken) {
                            data = abi.encodeCall(IERC20.transferFrom, (assistant, sender, twinM.amount));
                        } else if (twinM.tokenType == TokenType.NonFungibleToken) {
                            if (twinM.supplyAvailable == type(uint256).max) {
                                twinS.tokenId++;
                            } else {
                                twinM.tokenId += twinM.supplyAvailable;
                            }
                            data = abi.encodeWithSignature(
                                "safeTransferFrom(address,address,uint256,bytes)",
                                assistant,
                                sender,
                                twinM.tokenId,
                                ""
                            );
                        } else if (twinM.tokenType == TokenType.MultiToken) {
                            data = abi.encodeWithSignature(
                                "safeTransferFrom(address,address,uint256,uint256,bytes)",
                                assistant,
                                sender,
                                twinM.tokenId,
                                twinM.amount,
                                ""
                            );
                        }

                        twinM.tokenAddress = twinS.tokenAddress;
                        uint256 gasLeft = gasleft();
                        if (gasLeft > reservedGas && twinM.tokenAddress.isContract()) {
                            address to = twinM.tokenAddress;

                            bytes memory result;
                            assembly {
                                success := call(
                                    sub(gasLeft, reservedGas),
                                    to,
                                    0,
                                    add(data, 0x20),
                                    mload(data),
                                    add(result, 0x20),
                                    0x20
                                )

                                let returndataSize := returndatasize()

                                switch gt(returndataSize, 0x20)
                                case 0 {
                                    mstore(result, returndataSize)
                                }
                                case 1 {
                                    success := false
                                }
                            }

                            success =
                                success &&
                                (result.length == 0 || (result.length == 32 && abi.decode(result, (uint256)) == 1));
                        }
                    }

                    twinM.id = twinS.id;

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
        TokenRange[] storage twinRanges = _lookups.twinRangesBySeller[_sellerId][_twin.tokenAddress];
        bool unlimitedSupply = _twin.supplyAvailable == type(uint256).max;

        uint256 rangeIndex = _lookups.rangeIdByTwin[_twin.id] - 1;
        TokenRange storage range = twinRanges[rangeIndex];

        if (unlimitedSupply ? range.end == _twin.tokenId : range.start == _twin.tokenId) {
            uint256 lastIndex = twinRanges.length - 1;
            if (rangeIndex != lastIndex) {
                twinRanges[rangeIndex] = twinRanges[lastIndex];
                _lookups.rangeIdByTwin[range.twinId] = rangeIndex + 1;
            }

            twinRanges.pop();

            _lookups.rangeIdByTwin[_twin.id] = 0;
        } else {
            unlimitedSupply ? range.start++ : range.end--;
        }
    }
}
