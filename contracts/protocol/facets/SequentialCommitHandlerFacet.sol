// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.9;

import { IWETH9Like } from "../../interfaces/IWETH9Like.sol";
import { IBosonSequentialCommitHandler } from "../../interfaces/handlers/IBosonSequentialCommitHandler.sol";
import { IBosonVoucher } from "../../interfaces/clients/IBosonVoucher.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { PriceDiscoveryBase } from "../bases/PriceDiscoveryBase.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";
import { FundsLib } from "../libs/FundsLib.sol";
import "../../domain/BosonConstants.sol";
import { Address } from "../../ext_libs/Address.sol";
import { Math } from "../../ext_libs/Math.sol";

/**
 * @title SequentialCommitHandlerFacet
 *
 * @notice Handles sequential commits.
 */
contract SequentialCommitHandlerFacet is IBosonSequentialCommitHandler, PriceDiscoveryBase {
    using Address for address;

    /**
     * @notice Initializes facet.
     * This function is callable only once.
     */
    function initialize() public onlyUninitialized(type(IBosonSequentialCommitHandler).interfaceId) {
        DiamondLib.addSupportedInterface(type(IBosonSequentialCommitHandler).interfaceId);
    }

    /**
     * @notice Commits to an existing exchange. Price discovery is oflaoaded to external contract.
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
     *   - Transfer of voucher to the buyer fails for some reasong (e.g. buyer is contract that doesn't accept voucher)
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
        require(_buyer != address(0), INVALID_ADDRESS);

        uint256 exchangeId = _tokenId & type(uint128).max;

        // Exchange must exist
        (Exchange storage exchange, Voucher storage voucher) = getValidExchange(exchangeId, ExchangeState.Committed);

        // Make sure the voucher is still valid
        require(block.timestamp <= voucher.validUntilDate, VOUCHER_HAS_EXPIRED);

        // Fetch offer
        (, Offer storage offer) = fetchOffer(exchange.offerId);

        // Get token address
        address tokenAddress = offer.exchangeToken;

        // Get current buyer address. This is actually the seller in sequential commit. Need to do it before voucher is transferred
        address seller;
        uint256 buyerId = exchange.buyerId;
        {
            (, Buyer storage currentBuyer) = fetchBuyer(buyerId);
            seller = currentBuyer.wallet;
        }

        if (_priceDiscovery.side == Side.Bid) {
            // @TODO why don't allow third party to call?
            require(seller == msgSender(), NOT_VOUCHER_HOLDER);
        }

        // First call price discovery and get actual price
        // It might be lower tha submitted for buy orders and higher for sell orders
        uint256 actualPrice = fulfilOrder(_tokenId, offer, _priceDiscovery, _buyer);

        // Calculate the amount to be kept in escrow
        uint256 escrowAmount;

        {
            // Get sequential commits for this exchange
            ExchangeCosts[] storage exchangeCosts = protocolEntities().exchangeCosts[exchangeId];

            {
                // Calculate fees
                uint256 protocolFeeAmount = getProtocolFee(tokenAddress, actualPrice);

                // Calculate royalties
                (, uint256 royaltyAmount) = IBosonVoucher(protocolLookups().cloneAddress[offer.sellerId]).royaltyInfo(
                    exchangeId,
                    actualPrice
                );

                // Verify that fees and royalties are not higher than the price.
                require((protocolFeeAmount + royaltyAmount) <= actualPrice, FEE_AMOUNT_TOO_HIGH);

                // Get price paid by current buyer
                uint256 len = exchangeCosts.length;
                uint256 currentPrice = len == 0 ? offer.price : exchangeCosts[len - 1].price;

                // Calculate the minimal amount to be kept in the escrow
                escrowAmount = Math.max(actualPrice, protocolFeeAmount + royaltyAmount + currentPrice) - currentPrice;

                // Update sequential commit
                exchangeCosts.push(
                    ExchangeCosts({
                        resellerId: buyerId,
                        price: actualPrice,
                        protocolFeeAmount: protocolFeeAmount,
                        royaltyAmount: royaltyAmount
                    })
                );
            }

            address weth = protocolAddresses().weth;

            // Make sure enough get escrowed
            if (_priceDiscovery.side == Side.Ask) {
                if (escrowAmount > 0) {
                    // Price discovery should send funds to the seller
                    // Nothing in escrow, need to pull everything from seller
                    if (tokenAddress == address(0)) {
                        // If exchange is native currency, seller cannot directly approve protocol to transfer funds
                        // They need to approve wrapper contract, so protocol can pull funds from wrapper
                        FundsLib.transferFundsToProtocol(weth, seller, escrowAmount);
                        // But since protocol otherwise normally operates with native currency, needs to unwrap it (i.e. withdraw)
                        IWETH9Like(weth).withdraw(escrowAmount);
                    } else {
                        FundsLib.transferFundsToProtocol(tokenAddress, seller, escrowAmount);
                    }
                }
            } else {
                // when bid side, we have full proceeds in escrow. Keep minimal in, return the difference
                if (tokenAddress == address(0)) {
                    tokenAddress = weth;
                    if (escrowAmount > 0) IWETH9Like(weth).withdraw(escrowAmount);
                }

                uint256 payout = actualPrice - escrowAmount;
                if (payout > 0) FundsLib.transferFundsFromProtocol(tokenAddress, payable(seller), payout);
            }
        }

        clearStorage();

        // Since exchange and voucher are passed by reference, they are updated
        emit BuyerCommitted(exchange.offerId, exchange.buyerId, exchangeId, exchange, voucher, msgSender());
        // No need to update exchange detail. Most fields stay as they are, and buyerId was updated at the same time voucher is transferred
    }
}