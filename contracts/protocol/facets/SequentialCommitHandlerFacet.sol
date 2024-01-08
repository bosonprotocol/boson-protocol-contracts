// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import { IBosonSequentialCommitHandler } from "../../interfaces/handlers/IBosonSequentialCommitHandler.sol";
import { IBosonVoucher } from "../../interfaces/clients/IBosonVoucher.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { PriceDiscoveryBase } from "../bases/PriceDiscoveryBase.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";
import { FundsLib } from "../libs/FundsLib.sol";
import "../../domain/BosonConstants.sol";
import { Address } from "@openzeppelin/contracts/utils/Address.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

/**
 * @title SequentialCommitHandlerFacet
 *
 * @notice Handles sequential commits.
 */
contract SequentialCommitHandlerFacet is IBosonSequentialCommitHandler, PriceDiscoveryBase {
    using Address for address;

    /**
     * @notice
     * For offers with native exchange token, it is expected the the price discovery contracts will
     * operate with wrapped native token. Set the address of the wrapped native token in the constructor.
     *
     * After v2.2.0, token ids are derived from offerId and exchangeId.
     * EXCHANGE_ID_2_2_0 is the first exchange id to use for 2.2.0.
     * Set EXCHANGE_ID_2_2_0 in the constructor.
     *
     * @param _wNative - the address of the wrapped native token
     * @param _firstExchangeId2_2_0 - the first exchange id to use for 2.2.0
     */
    //solhint-disable-next-line
    constructor(address _wNative, uint256 _firstExchangeId2_2_0) PriceDiscoveryBase(_wNative, _firstExchangeId2_2_0) {}

    /**
     * @notice Initializes facet.
     * This function is callable only once.
     */
    function initialize() public onlyUninitialized(type(IBosonSequentialCommitHandler).interfaceId) {
        DiamondLib.addSupportedInterface(type(IBosonSequentialCommitHandler).interfaceId);
    }

    /**
     * @notice Commits to an existing exchange. Price discovery is offloaded to external contract.
     *
     * Emits a BuyerCommitted event if successful.
     * Transfers voucher to the buyer address.
     *
     * Reverts if:
     * - The exchanges region of protocol is paused
     * - The buyers region of protocol is paused
     * - Buyer address is zero
     * - Exchange does not exist
     * - Exchange is not in Committed state
     * - Voucher has expired
     * - It is a bid order and:
     *   - Caller is not the voucher holder
     *   - Voucher owner did not approve protocol to transfer the voucher
     *   - Price received from price discovery is lower than the expected price
     * - It is a ask order and:
     *   - Offer price is in native token and caller does not send enough
     *   - Offer price is in some ERC20 token and caller also sends native currency
     *   - Calling transferFrom on token fails for some reason (e.g. protocol is not approved to transfer)
     *   - Received ERC20 token amount differs from the expected value
     *   - Protocol does not receive the voucher
     *   - Transfer of voucher to the buyer fails for some reason (e.g. buyer is contract that doesn't accept voucher)
     *   - Reseller did not approve protocol to transfer exchange token in escrow
     * - Call to price discovery contract fails
     * - Protocol fee and royalties combined exceed the secondary price
     * - Transfer of exchange token fails
     *
     * @param _buyer - the buyer's address (caller can commit on behalf of a buyer)
     * @param _tokenId - the id of the token to commit to
     * @param _priceDiscovery - the fully populated BosonTypes.PriceDiscovery struct
     */
    function sequentialCommitToOffer(
        address payable _buyer,
        uint256 _tokenId,
        PriceDiscovery calldata _priceDiscovery
    ) external payable exchangesNotPaused buyersNotPaused nonReentrant {
        // Make sure buyer address is not zero address
        if (_buyer == address(0)) revert InvalidAddress();

        uint256 exchangeId = _tokenId & type(uint128).max;

        // Exchange must exist
        (Exchange storage exchange, Voucher storage voucher) = getValidExchange(exchangeId, ExchangeState.Committed);

        // Make sure the voucher is still valid
        if (block.timestamp > voucher.validUntilDate) revert VoucherHasExpired();

        // Create a memory struct for sequential commit and populate it as we go
        // This is done to avoid stack too deep error, while still keeping the number of SLOADs to a minimum
        ExchangeCosts memory exchangeCost;

        // Get current buyer address. This is actually the seller in sequential commit. Need to do it before voucher is transferred
        address seller;
        exchangeCost.resellerId = exchange.buyerId;
        {
            (, Buyer storage currentBuyer) = fetchBuyer(exchangeCost.resellerId);
            seller = currentBuyer.wallet;
        }

        // Fetch offer
        uint256 offerId = exchange.offerId;
        (, Offer storage offer) = fetchOffer(offerId);

        // First call price discovery and get actual price
        // It might be lower than submitted for buy orders and higher for sell orders
        exchangeCost.price = fulfilOrder(_tokenId, offer, _priceDiscovery, seller, _buyer);

        // Get token address
        address exchangeToken = offer.exchangeToken;

        // Calculate the amount to be kept in escrow
        uint256 escrowAmount;
        uint256 payout;
        {
            // Get sequential commits for this exchange
            ExchangeCosts[] storage exchangeCosts = protocolEntities().exchangeCosts[exchangeId];

            {
                // Calculate fees
                exchangeCost.protocolFeeAmount = getProtocolFee(exchangeToken, exchangeCost.price);

                // Calculate royalties
                {
                    RoyaltyInfo storage royaltyInfo;
                    (royaltyInfo, exchangeCost.royaltyInfoIndex, ) = fetchRoyalties(offerId, false);
                    exchangeCost.royaltyAmount =
                        (getTotalRoyaltyPercentage(royaltyInfo.bps) * exchangeCost.price) /
                        10000;
                }

                // Verify that fees and royalties are not higher than the price.
                if (exchangeCost.protocolFeeAmount + exchangeCost.royaltyAmount > exchangeCost.price) {
                    revert FeeAmountTooHigh();
                }

                // Get price paid by current buyer
                uint256 len = exchangeCosts.length;
                uint256 currentPrice = len == 0 ? offer.price : exchangeCosts[len - 1].price;

                // Calculate the minimal amount to be kept in the escrow
                escrowAmount =
                    Math.max(
                        exchangeCost.price,
                        exchangeCost.protocolFeeAmount + exchangeCost.royaltyAmount + currentPrice
                    ) -
                    currentPrice;

                // Store the exchange cost, so it can be used in calculations when releasing funds
                exchangeCosts.push(exchangeCost);
            }

            // Make sure enough get escrowed
            payout = exchangeCost.price - escrowAmount;

            if (_priceDiscovery.side == Side.Ask) {
                if (escrowAmount > 0) {
                    // Price discovery should send funds to the seller
                    // Nothing in escrow, need to pull everything from seller
                    if (exchangeToken == address(0)) {
                        // If exchange is native currency, seller cannot directly approve protocol to transfer funds
                        // They need to approve wrapper contract, so protocol can pull funds from wrapper
                        FundsLib.transferFundsToProtocol(address(wNative), seller, escrowAmount);
                        // But since protocol otherwise normally operates with native currency, needs to unwrap it (i.e. withdraw)
                        wNative.withdraw(escrowAmount);
                    } else {
                        FundsLib.transferFundsToProtocol(exchangeToken, seller, escrowAmount);
                    }
                }
            } else {
                // when bid side, we have full proceeds in escrow. Keep minimal in, return the difference
                if (exchangeCost.price > 0 && exchangeToken == address(0)) {
                    wNative.withdraw(exchangeCost.price);
                }

                if (payout > 0) {
                    FundsLib.transferFundsFromProtocol(exchangeToken, payable(seller), payout);
                }
            }
        }

        clearPriceDiscoveryStorage();

        // Since exchange and voucher are passed by reference, they are updated
        uint256 buyerId = exchange.buyerId;
        address sender = msgSender();
        if (exchangeCost.price > 0) emit FundsEncumbered(buyerId, exchangeToken, exchangeCost.price, sender);
        if (payout > 0) {
            emit FundsReleased(exchangeId, exchangeCost.resellerId, exchangeToken, payout, sender);
            emit FundsWithdrawn(exchangeCost.resellerId, seller, exchangeToken, payout, sender);
        }
        emit BuyerCommitted(offerId, buyerId, exchangeId, exchange, voucher, sender);
        // No need to update exchange detail. Most fields stay as they are, and buyerId was updated at the same time voucher is transferred
    }
}
