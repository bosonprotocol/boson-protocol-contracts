// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import { IBosonSequentialCommitHandler } from "../../interfaces/handlers/IBosonSequentialCommitHandler.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { PriceDiscoveryBase } from "../bases/PriceDiscoveryBase.sol";
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
     * For offers with native exchange token, it is expected that the price discovery contracts will
     * operate with wrapped native token. Set the address of the wrapped native token in the constructor.
     *
     * @param _wNative - the address of the wrapped native token
     */
    //solhint-disable-next-line
    constructor(address _wNative) PriceDiscoveryBase(_wNative) {}

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
    ) external payable exchangesNotPaused buyersNotPaused sequentialCommitNotPaused nonReentrant {
        // Make sure buyer address is not zero address
        if (_buyer == address(0)) revert InvalidAddress();

        uint256 exchangeId = _tokenId & type(uint128).max;

        // Exchange must exist
        (Exchange storage exchange, Voucher storage voucher) = getValidExchange(exchangeId, ExchangeState.Committed);

        // Make sure the voucher is still valid
        if (block.timestamp > voucher.validUntilDate) revert VoucherHasExpired();

        // Create a memory struct for sequential commit and populate it as we go
        // This is done to avoid stack too deep error, while still keeping the number of SLOADs to a minimum
        ExchangeCosts memory thisExchangeCost;

        // Get current buyer address. This is actually the seller in sequential commit. Need to do it before voucher is transferred
        address seller;
        thisExchangeCost.resellerId = exchange.buyerId;
        {
            (, Buyer storage currentBuyer) = fetchBuyer(thisExchangeCost.resellerId);
            seller = currentBuyer.wallet;
        }

        // Fetch offer
        uint256 offerId = exchange.offerId;
        (, Offer storage offer) = fetchOffer(offerId);

        // First call price discovery and get actual price
        // It might be lower than submitted for buy orders and higher for sell orders
        thisExchangeCost.price = fulfilOrder(_tokenId, offer, _priceDiscovery, seller, _buyer);

        // Get token address
        address exchangeToken = offer.exchangeToken;

        // Calculate the amount to be kept in escrow
        uint256 additionalEscrowAmount;
        uint256 immediatePayout;
        {
            // Get sequential commits for this exchange
            ExchangeCosts[] storage exchangeCosts = protocolEntities().exchangeCosts[exchangeId];

            {
                // Calculate fees
                thisExchangeCost.protocolFeeAmount = _getProtocolFee(exchangeToken, thisExchangeCost.price);

                // Calculate royalties
                {
                    RoyaltyInfo storage royaltyInfo;
                    (royaltyInfo, thisExchangeCost.royaltyInfoIndex, ) = fetchRoyalties(offerId, false);
                    thisExchangeCost.royaltyAmount =
                        (getTotalRoyaltyPercentage(royaltyInfo.bps) * thisExchangeCost.price) /
                        HUNDRED_PERCENT;
                }

                // Verify that fees and royalties are not higher than the price.
                if (thisExchangeCost.protocolFeeAmount + thisExchangeCost.royaltyAmount > thisExchangeCost.price) {
                    revert FeeAmountTooHigh();
                }

                // Get the price, originally paid by the reseller
                uint256 oldPrice;
                unchecked {
                    uint256 len = exchangeCosts.length;
                    oldPrice = len == 0 ? offer.price : exchangeCosts[len - 1].price;
                }

                // Calculate the minimal amount to be kept in the escrow
                unchecked {
                    additionalEscrowAmount =
                        thisExchangeCost.price -
                        Math.min(
                            oldPrice,
                            thisExchangeCost.price - thisExchangeCost.royaltyAmount - thisExchangeCost.protocolFeeAmount
                        );
                }

                // Store the exchange cost, so it can be used in calculations when releasing funds
                exchangeCosts.push(thisExchangeCost);
            }

            // Make sure enough get escrowed
            // Escrow amount is guaranteed to be less than or equal to price
            unchecked {
                immediatePayout = thisExchangeCost.price - additionalEscrowAmount;
            }

            // we have full proceeds in escrow. Keep minimal in, return the difference
            if (thisExchangeCost.price > 0 && exchangeToken == address(0)) {
                wNative.withdraw(thisExchangeCost.price);
            }

            if (immediatePayout > 0) {
                transferFundsOut(exchangeToken, payable(seller), immediatePayout);
            }
        }

        clearPriceDiscoveryStorage();

        // Since exchange and voucher are passed by reference, they are updated
        uint256 buyerId = exchange.buyerId;
        address sender = _msgSender();
        if (thisExchangeCost.price > 0) {
            emit FundsDeposited(buyerId, sender, exchangeToken, thisExchangeCost.price);
            emit FundsEncumbered(buyerId, exchangeToken, thisExchangeCost.price, sender);
        }
        if (immediatePayout > 0) {
            emit FundsReleased(exchangeId, thisExchangeCost.resellerId, exchangeToken, immediatePayout, sender);
            emit FundsWithdrawn(thisExchangeCost.resellerId, seller, exchangeToken, immediatePayout, sender);
        }
        emit BuyerCommitted(offerId, buyerId, exchangeId, exchange, voucher, sender);
        // No need to update exchange detail. Most fields stay as they are, and buyerId was updated at the same time voucher is transferred
    }

    /**
     * @notice ERC-3009 sibling of `sequentialCommitToOffer`. Only ask orders are supported (bid orders
     * pull funds from the voucher holder, not the caller, so the auth payload is meaningless and the
     * call reverts with `AuthorizationNotApplicable`). The caller (`_msgSender()`) is the new buyer and
     * the authorizer of the ERC-3009 signature. The exchange token MUST be ERC20.
     *
     * Emits a BuyerCommitted event if successful.
     * Transfers voucher to the buyer address.
     *
     * @param _buyer - the buyer's address
     * @param _tokenId - the id of the token to commit to
     * @param _priceDiscovery - the fully populated BosonTypes.PriceDiscovery struct (must be Ask)
     * @param _authorization - abi-encoded ERC-3009 authorization payload signed by `_msgSender()`
     */
    function sequentialCommitToOfferWithAuthorization(
        address payable _buyer,
        uint256 _tokenId,
        PriceDiscovery calldata _priceDiscovery,
        bytes memory _authorization
    ) external exchangesNotPaused buyersNotPaused sequentialCommitNotPaused nonReentrant {
        if (_buyer == address(0)) revert InvalidAddress();

        uint256 exchangeId = _tokenId & type(uint128).max;
        (Exchange storage exchange, ) = getValidExchange(exchangeId, ExchangeState.Committed);

        address exchangeToken;
        {
            (, Offer storage o) = fetchOffer(exchange.offerId);
            exchangeToken = o.exchangeToken;
        }

        // Pull buyer's funds into protocol via signed authorization BEFORE entering price-discovery flow.
        // This decouples the auth bytes from the deeper call stack and avoids stack-too-deep.
        // Validation that exchangeToken is ERC20 happens inside validateIncomingPaymentWithAuthorization.
        validateIncomingPaymentWithAuthorization(
            exchangeToken,
            _priceDiscovery.price,
            _msgSender(),
            _authorization
        );
        // _authorization no longer used past this point — pass control to helper without it in scope

        _continueSequentialCommitFundsAlreadyIn(_buyer, _tokenId, _priceDiscovery, exchangeId);
    }

    /**
     * @notice Mirror of `sequentialCommitToOffer`'s body that assumes the buyer's funds were already
     * pulled into the protocol before this is invoked. Used by `sequentialCommitToOfferWithAuthorization`
     * to keep the authorization bytes out of the deeper call stack (avoids stack-too-deep). The
     * exchangeToken is guaranteed to be ERC20 (asserted upstream by `validateIncomingPaymentWithAuthorization`).
     */
    function _continueSequentialCommitFundsAlreadyIn(
        address payable _buyer,
        uint256 _tokenId,
        PriceDiscovery calldata _priceDiscovery,
        uint256 exchangeId
    ) internal {
        (Exchange storage exchange, Voucher storage voucher) = getValidExchange(exchangeId, ExchangeState.Committed);
        if (block.timestamp > voucher.validUntilDate) revert VoucherHasExpired();

        ExchangeCosts memory thisExchangeCost;
        thisExchangeCost.resellerId = exchange.buyerId;

        address seller;
        {
            (, Buyer storage currentBuyer) = fetchBuyer(thisExchangeCost.resellerId);
            seller = currentBuyer.wallet;
        }

        uint256 offerId = exchange.offerId;
        (, Offer storage offer) = fetchOffer(offerId);

        thisExchangeCost.price = fulfilOrderFundsAlreadyIn(_tokenId, offer, _priceDiscovery, seller, _buyer);

        _settleSequentialAfterFulfilWithAuth(exchangeId, offerId, offer, exchange, voucher, seller, thisExchangeCost);
    }

    /**
     * @notice Helper for `sequentialCommitToOfferWithAuthorization` — extracted to avoid stack-too-deep.
     * Computes fees/royalties/escrow, performs immediate payout to seller, clears price discovery
     * storage, and emits funds-related events. The exchange token is guaranteed to be ERC20 by
     * `fulfilAskOrderWithAuthorization`, so the wNative withdraw branch is omitted.
     */
    function _settleSequentialAfterFulfilWithAuth(
        uint256 _exchangeId,
        uint256 _offerId,
        Offer storage _offer,
        Exchange storage _exchange,
        Voucher storage _voucher,
        address _seller,
        ExchangeCosts memory _cost
    ) internal {
        address exchangeToken = _offer.exchangeToken;

        uint256 additionalEscrowAmount;
        uint256 immediatePayout;
        {
            ExchangeCosts[] storage exchangeCosts = protocolEntities().exchangeCosts[_exchangeId];

            _cost.protocolFeeAmount = _getProtocolFee(exchangeToken, _cost.price);

            {
                RoyaltyInfo storage royaltyInfo;
                (royaltyInfo, _cost.royaltyInfoIndex, ) = fetchRoyalties(_offerId, false);
                _cost.royaltyAmount = (getTotalRoyaltyPercentage(royaltyInfo.bps) * _cost.price) / HUNDRED_PERCENT;
            }

            if (_cost.protocolFeeAmount + _cost.royaltyAmount > _cost.price) {
                revert FeeAmountTooHigh();
            }

            uint256 oldPrice;
            unchecked {
                uint256 len = exchangeCosts.length;
                oldPrice = len == 0 ? _offer.price : exchangeCosts[len - 1].price;
            }

            unchecked {
                additionalEscrowAmount =
                    _cost.price -
                    Math.min(oldPrice, _cost.price - _cost.royaltyAmount - _cost.protocolFeeAmount);
            }

            exchangeCosts.push(_cost);

            unchecked {
                immediatePayout = _cost.price - additionalEscrowAmount;
            }

            if (immediatePayout > 0) {
                transferFundsOut(exchangeToken, payable(_seller), immediatePayout);
            }
        }

        clearPriceDiscoveryStorage();

        uint256 buyerId = _exchange.buyerId;
        address sender = _msgSender();
        if (_cost.price > 0) {
            emit FundsDeposited(buyerId, sender, exchangeToken, _cost.price);
            emit FundsEncumbered(buyerId, exchangeToken, _cost.price, sender);
        }
        if (immediatePayout > 0) {
            emit FundsReleased(_exchangeId, _cost.resellerId, exchangeToken, immediatePayout, sender);
            emit FundsWithdrawn(_cost.resellerId, _seller, exchangeToken, immediatePayout, sender);
        }
        emit BuyerCommitted(_offerId, buyerId, _exchangeId, _exchange, _voucher, sender);
    }
}
