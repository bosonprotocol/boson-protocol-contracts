// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import "../../domain/BosonConstants.sol";
import { BosonErrors } from "../../domain/BosonErrors.sol";
import { BosonTypes } from "../../domain/BosonTypes.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IBosonFundsBaseEvents } from "../../interfaces/events/IBosonFundsEvents.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { IDRFeeMutualizer } from "../../interfaces/clients/IDRFeeMutualizer.sol";
import { Context } from "@openzeppelin/contracts/utils/Context.sol";
import { IWrappedNative } from "../../interfaces/IWrappedNative.sol";

/**
 * @title FundsBase
 *
 * @dev
 */
abstract contract FundsBase is Context {
    using SafeERC20 for IERC20;
    IWrappedNative internal immutable wNative;

    /**
     * @notice Takes in the offer id and entity id and encumbers the appropriate funds during commitToOffer.
     * For seller-created offers: encumbers seller's pre-deposited deposit and validates buyer's incoming payment.
     * For buyer-created offers: encumbers buyer's pre-deposited payment and validates seller's incoming deposit.
     * If offer is preminted, caller's funds are not encumbered, but the funds are covered from pre-deposited amounts.
     *
     * Emits FundsEncumbered event if successful.
     *
     * Reverts if:
     * - Incoming payment is in native token and caller does not send enough
     * - Incoming payment is in some ERC20 token and caller also sends native currency
     * - Contract at token address does not support ERC20 function transferFrom
     * - Calling transferFrom on token fails for some reason (e.g. protocol is not approved to transfer)
     * - Entity has less pre-deposited funds available than required amount
     * - Received ERC20 token amount differs from the expected value
     *
     * @param _offerId - id of the offer with the details
     * @param _entityId - id of the committing entity (buyer for seller-created offers, seller for buyer-created offers)
     * @param _incomingAmount - the amount being paid by the committing entity
     * @param _isPreminted - flag indicating if the offer is preminted
     * @param _priceType - price type, either static or discovery
     */
    function encumberFunds(
        uint256 _offerId,
        uint256 _entityId,
        uint256 _incomingAmount,
        bool _isPreminted,
        BosonTypes.PriceType _priceType
    ) internal {
        // Load protocol entities storage
        ProtocolLib.ProtocolEntities storage pe = ProtocolLib.protocolEntities();

        // get message sender
        address sender = _msgSender();

        // fetch offer to get the exchange token, price and seller
        // this will be called only from commitToOffer so we expect that exchange actually exist
        BosonTypes.Offer storage offer = pe.offers[_offerId];
        address exchangeToken = offer.exchangeToken;

        if (!_isPreminted) {
            validateIncomingPayment(exchangeToken, _incomingAmount);
            emit IBosonFundsBaseEvents.FundsDeposited(_entityId, sender, exchangeToken, _incomingAmount);
            emit IBosonFundsBaseEvents.FundsEncumbered(_entityId, exchangeToken, _incomingAmount, sender);
        }

        if (offer.creator == BosonTypes.OfferCreator.Buyer) {
            decreaseAvailableFunds(offer.buyerId, exchangeToken, offer.price);
            emit IBosonFundsBaseEvents.FundsEncumbered(offer.buyerId, exchangeToken, offer.price, sender);
        } else {
            uint256 sellerId = offer.sellerId;
            bool isPriceDiscovery = _priceType == BosonTypes.PriceType.Discovery;
            uint256 sellerFundsEncumbered = offer.sellerDeposit +
                (_isPreminted && !isPriceDiscovery ? _incomingAmount : 0);
            decreaseAvailableFunds(sellerId, exchangeToken, sellerFundsEncumbered);
            emit IBosonFundsBaseEvents.FundsEncumbered(sellerId, exchangeToken, sellerFundsEncumbered, sender);
        }
    }

    /**
     * @notice Validates that incoming payments matches expectation. If token is a native currency, it makes sure
     * msg.value is correct. If token is ERC20, it transfers the value from the sender to the protocol.
     *
     * Emits ERC20 Transfer event in call stack if successful.
     *
     * Reverts if:
     * - Offer price is in native token and caller does not send enough
     * - Offer price is in some ERC20 token and caller also sends native currency
     * - Contract at token address does not support ERC20 function transferFrom
     * - Calling transferFrom on token fails for some reason (e.g. protocol is not approved to transfer)
     * - Received ERC20 token amount differs from the expected value
     *
     * @param _exchangeToken - address of the token (0x for native currency)
     * @param _value - value expected to receive
     */
    function validateIncomingPayment(address _exchangeToken, uint256 _value) internal {
        if (_exchangeToken == address(0)) {
            // if transfer is in the native currency, msg.value must match offer price
            if (msg.value != _value) revert BosonErrors.InsufficientValueReceived();
        } else {
            // when price is in an erc20 token, transferring the native currency is not allowed
            if (msg.value != 0) revert BosonErrors.NativeNotAllowed();

            // if transfer is in ERC20 token, try to transfer the amount from buyer to the protocol
            transferFundsIn(_exchangeToken, _value);
        }
    }

    /**
     * @notice Takes in the exchange id and releases the funds to buyer, seller and dispute resolver depending on the state of the exchange.
     * It is called only from finalizeExchange and finalizeDispute.
     *
     * Emits FundsReleased and/or ProtocolFeeCollected event if payoffs are warranted and transaction is successful.
     *
     * @param _exchangeId - exchange id
     */
    function releaseFunds(uint256 _exchangeId) internal {
        // Load protocol entities storage
        ProtocolLib.ProtocolEntities storage pe = ProtocolLib.protocolEntities();

        // Get the exchange and its state
        // Since this should be called only from certain functions from exchangeHandler and disputeHandler
        // exchange must exist and be in a completed state, so that's not checked explicitly
        BosonTypes.Exchange storage exchange = pe.exchanges[_exchangeId];

        // Get offer from storage to get the details about sellerDeposit, price, sellerId, exchangeToken and buyerCancelPenalty
        BosonTypes.Offer storage offer = pe.offers[exchange.offerId];

        // calculate the payoffs depending on state exchange is in
        BosonTypes.Payoff memory payoff;

        BosonTypes.OfferFees storage offerFee = pe.offerFees[exchange.offerId];
        uint256 offerPrice = offer.priceType == BosonTypes.PriceType.Discovery ? 0 : offer.price;
        BosonTypes.ExchangeCosts[] storage exchangeCosts = pe.exchangeCosts[_exchangeId];
        uint256 lastPrice = exchangeCosts.length == 0 ? offerPrice : exchangeCosts[exchangeCosts.length - 1].price;
        {
            // scope to avoid stack too deep errors
            BosonTypes.ExchangeState exchangeState = exchange.state;
            uint256 sellerDeposit = offer.sellerDeposit;
            bool isEscalated = pe.disputeDates[_exchangeId].escalated != 0;

            if (exchangeState == BosonTypes.ExchangeState.Completed) {
                // COMPLETED
                payoff.protocol = offerFee.protocolFee;
                // buyerPayoff is 0
                payoff.agent = offerFee.agentFee;
                payoff.seller = offerPrice + sellerDeposit - payoff.protocol - payoff.agent;
            } else if (exchangeState == BosonTypes.ExchangeState.Revoked) {
                // REVOKED
                // sellerPayoff is 0
                payoff.buyer = lastPrice + sellerDeposit;
            } else if (exchangeState == BosonTypes.ExchangeState.Canceled) {
                // CANCELED
                uint256 buyerCancelPenalty = offer.buyerCancelPenalty;
                payoff.seller = sellerDeposit + buyerCancelPenalty;
                payoff.buyer = lastPrice - buyerCancelPenalty;
            } else if (exchangeState == BosonTypes.ExchangeState.Disputed) {
                // DISPUTED
                // determine if buyerEscalationDeposit was encumbered or not
                // if dispute was escalated, disputeDates.escalated is populated
                uint256 buyerEscalationDeposit = isEscalated
                    ? pe.disputeResolutionTerms[exchange.offerId].buyerEscalationDeposit
                    : 0;

                // get the information about the dispute, which must exist
                BosonTypes.Dispute storage dispute = pe.disputes[_exchangeId];
                BosonTypes.DisputeState disputeState = dispute.state;

                if (disputeState == BosonTypes.DisputeState.Retracted) {
                    // RETRACTED - same as "COMPLETED"
                    payoff.protocol = offerFee.protocolFee;
                    payoff.agent = offerFee.agentFee;
                    // buyerPayoff is 0
                    payoff.seller =
                        offerPrice +
                        sellerDeposit -
                        payoff.protocol -
                        payoff.agent +
                        buyerEscalationDeposit;

                    // DR is paid if dispute was escalated
                    payoff.disputeResolver = isEscalated ? pe.disputeResolutionTerms[exchange.offerId].feeAmount : 0;
                } else if (disputeState == BosonTypes.DisputeState.Refused) {
                    // REFUSED
                    payoff.seller = sellerDeposit;
                    payoff.buyer = lastPrice + buyerEscalationDeposit;
                    // DR is not paid when dispute is refused
                } else {
                    // RESOLVED or DECIDED
                    uint256 commonPot = sellerDeposit + buyerEscalationDeposit;
                    payoff.buyer = applyPercent(commonPot, dispute.buyerPercent);
                    payoff.seller = commonPot - payoff.buyer;

                    payoff.buyer = payoff.buyer + applyPercent(lastPrice, dispute.buyerPercent);
                    payoff.seller = payoff.seller + offerPrice - applyPercent(offerPrice, dispute.buyerPercent);

                    // DR is always paid for escalated disputes (Decided or Resolved with escalation)
                    if (isEscalated) {
                        payoff.disputeResolver = pe.disputeResolutionTerms[exchange.offerId].feeAmount;
                    }
                }
            }
        }

        address exchangeToken = offer.exchangeToken;

        // Original seller and last buyer are done
        // Release funds to intermediate sellers (if they exist)
        // and add the protocol fee to the total
        {
            (uint256 sequentialProtocolFee, uint256 sequentialRoyalties) = releaseFundsToIntermediateSellers(
                _exchangeId,
                exchange.state,
                offerPrice,
                exchangeToken,
                offer
            );
            payoff.seller += sequentialRoyalties;
            payoff.protocol += sequentialProtocolFee;
        }

        // Store payoffs to availablefunds and notify the external observers
        address sender = _msgSender();
        if (payoff.seller > 0) {
            increaseAvailableFundsAndEmitEvent(_exchangeId, offer.sellerId, exchangeToken, payoff.seller, sender);
        }
        if (payoff.buyer > 0) {
            increaseAvailableFundsAndEmitEvent(_exchangeId, exchange.buyerId, exchangeToken, payoff.buyer, sender);
        }

        if (payoff.protocol > 0) {
            increaseAvailableFunds(PROTOCOL_ENTITY_ID, exchangeToken, payoff.protocol);
            emit IBosonFundsBaseEvents.ProtocolFeeCollected(_exchangeId, exchangeToken, payoff.protocol, sender);
        }
        if (payoff.agent > 0) {
            // Get the agent for offer
            uint256 agentId = ProtocolLib.protocolLookups().agentIdByOffer[exchange.offerId];
            increaseAvailableFundsAndEmitEvent(_exchangeId, agentId, exchangeToken, payoff.agent, sender);
        }
        BosonTypes.DisputeResolutionTerms storage drTerms = pe.disputeResolutionTerms[offer.id];
        if (payoff.disputeResolver > 0) {
            increaseAvailableFundsAndEmitEvent(
                _exchangeId,
                drTerms.disputeResolverId,
                exchangeToken,
                payoff.disputeResolver,
                sender
            );
        }

        // Return unused DR fee to mutualizer or seller's pool
        if (drTerms.feeAmount != 0) {
            uint256 returnAmount = drTerms.feeAmount - payoff.disputeResolver;

            // Use exchange-level mutualizer address (locked at commitment time)
            address mutualizerAddress = exchange.mutualizerAddress;
            if (mutualizerAddress == address(0)) {
                if (returnAmount > 0) {
                    increaseAvailableFundsAndEmitEvent(
                        _exchangeId,
                        offer.sellerId,
                        exchangeToken,
                        returnAmount,
                        sender
                    );
                }
            } else {
                uint256 exchangeId = _exchangeId; // stack too deep ToDO: any other way to avoid this?

                if (returnAmount > 0) {
                    if (exchangeToken == address(0)) {
                        exchangeToken = address(wNative);
                        wNative.deposit{ value: returnAmount }();
                    }
                    uint256 oldAllowance = IERC20(exchangeToken).allowance(address(this), mutualizerAddress);
                    IERC20(exchangeToken).forceApprove(mutualizerAddress, returnAmount + oldAllowance);
                }

                try
                    IDRFeeMutualizer(mutualizerAddress).finalizeExchange{ gas: FINALIZE_EXCHANGE_FEE_GAS }(
                        exchangeId,
                        returnAmount
                    )
                {
                    emit IBosonFundsBaseEvents.DRFeeReturned(
                        exchangeId,
                        exchangeToken,
                        returnAmount,
                        mutualizerAddress,
                        sender
                    );
                } catch {
                    // Ignore failure to not block the main flow
                    emit IBosonFundsBaseEvents.DRFeeReturnFailed(
                        exchangeId,
                        exchangeToken,
                        returnAmount,
                        mutualizerAddress,
                        sender
                    );
                }
            }
        }
    }

    /**
     * @notice Takes the exchange id and releases the funds to original seller if offer.priceType is Discovery
     * and to all intermediate resellers in case of sequential commit, depending on the state of the exchange.
     * It is called only from releaseFunds. Protocol fee and royalties are calculated and returned to releaseFunds, where they are added to the total.
     *
     * Emits FundsReleased events for non zero payoffs.
     *
     * @param _exchangeId - exchange id
     * @param _exchangeState - state of the exchange
     * @param _initialPrice - initial price of the offer
     * @param _exchangeToken - address of the token used for the exchange
     * @param _offer - offer struct
     * @return protocolFee - protocol fee from secondary sales
     * @return sellerRoyalties - royalties from secondary sales collected for the seller
     */
    function releaseFundsToIntermediateSellers(
        uint256 _exchangeId,
        BosonTypes.ExchangeState _exchangeState,
        uint256 _initialPrice,
        address _exchangeToken,
        BosonTypes.Offer storage _offer
    ) internal returns (uint256 protocolFee, uint256 sellerRoyalties) {
        BosonTypes.ExchangeCosts[] storage exchangeCosts;

        // calculate effective price multiplier
        uint256 effectivePriceMultiplier;
        {
            ProtocolLib.ProtocolEntities storage pe = ProtocolLib.protocolEntities();

            exchangeCosts = pe.exchangeCosts[_exchangeId];

            // if price type was static and no sequential commit happened, just return
            if (exchangeCosts.length == 0) {
                return (0, 0);
            }

            {
                if (_exchangeState == BosonTypes.ExchangeState.Completed) {
                    // COMPLETED, buyer pays full price
                    effectivePriceMultiplier = HUNDRED_PERCENT;
                } else if (
                    _exchangeState == BosonTypes.ExchangeState.Revoked ||
                    _exchangeState == BosonTypes.ExchangeState.Canceled
                ) {
                    // REVOKED or CANCELED, buyer pays nothing (buyerCancelPenalty is not considered payment)
                    effectivePriceMultiplier = 0;
                } else if (_exchangeState == BosonTypes.ExchangeState.Disputed) {
                    // DISPUTED
                    // get the information about the dispute, which must exist
                    BosonTypes.Dispute storage dispute = pe.disputes[_exchangeId];
                    BosonTypes.DisputeState disputeState = dispute.state;

                    if (disputeState == BosonTypes.DisputeState.Retracted) {
                        // RETRACTED - same as "COMPLETED"
                        effectivePriceMultiplier = HUNDRED_PERCENT;
                    } else if (disputeState == BosonTypes.DisputeState.Refused) {
                        // REFUSED, buyer pays nothing
                        effectivePriceMultiplier = 0;
                    } else {
                        // RESOLVED or DECIDED
                        effectivePriceMultiplier = HUNDRED_PERCENT - dispute.buyerPercent;
                    }
                }
            }
        }

        uint256 resellerBuyPrice = _initialPrice; // the price that reseller paid for the voucher
        address msgSender = _msgSender();
        uint256 len = exchangeCosts.length;
        for (uint256 i = 0; i < len; ) {
            // Since all elements of exchangeCosts[i] are used, it makes sense to copy them to memory
            BosonTypes.ExchangeCosts memory secondaryCommit = exchangeCosts[i];

            // amount to be released
            uint256 currentResellerAmount;

            // inside the scope to avoid stack too deep error
            {
                if (effectivePriceMultiplier > 0) {
                    protocolFee =
                        protocolFee +
                        applyPercent(secondaryCommit.protocolFeeAmount, effectivePriceMultiplier);
                    sellerRoyalties += distributeRoyalties(
                        _exchangeId,
                        _offer,
                        secondaryCommit,
                        effectivePriceMultiplier
                    );
                }

                // secondary price without protocol fee and royalties
                uint256 reducedSecondaryPrice = secondaryCommit.price -
                    secondaryCommit.protocolFeeAmount -
                    secondaryCommit.royaltyAmount;

                // Calculate amount to be released to the reseller:
                // + part of the price that they paid (relevant for unhappy paths)
                // + price of the voucher that they sold reduced for part that goes to next reseller, royalties and protocol fee
                // - immediate payout that was released already during the sequential commit
                currentResellerAmount =
                    applyPercent(resellerBuyPrice, (HUNDRED_PERCENT - effectivePriceMultiplier)) +
                    secondaryCommit.price -
                    applyPercent(secondaryCommit.price, (HUNDRED_PERCENT - effectivePriceMultiplier)) -
                    applyPercent(secondaryCommit.protocolFeeAmount, effectivePriceMultiplier) -
                    applyPercent(secondaryCommit.royaltyAmount, effectivePriceMultiplier) -
                    Math.min(resellerBuyPrice, reducedSecondaryPrice);

                resellerBuyPrice = secondaryCommit.price;
            }

            if (currentResellerAmount > 0) {
                increaseAvailableFundsAndEmitEvent(
                    _exchangeId,
                    secondaryCommit.resellerId,
                    _exchangeToken,
                    currentResellerAmount,
                    msgSender
                );
            }

            unchecked {
                i++;
            }
        }
    }

    /**
     * @notice Forwards values to increaseAvailableFunds and emits notifies external listeners.
     *
     * Emits FundsReleased events
     *
     * @param _exchangeId - exchange id
     * @param _entityId - id of the entity to which the funds are released
     * @param _tokenAddress - address of the token used for the exchange
     * @param _amount - amount of tokens to be released
     * @param _sender - address of the sender that executed the transaction
     */
    function increaseAvailableFundsAndEmitEvent(
        uint256 _exchangeId,
        uint256 _entityId,
        address _tokenAddress,
        uint256 _amount,
        address _sender
    ) internal {
        increaseAvailableFunds(_entityId, _tokenAddress, _amount);
        emit IBosonFundsBaseEvents.FundsReleased(_exchangeId, _entityId, _tokenAddress, _amount, _sender);
    }

    /**
     * @notice Tries to transfer tokens from the caller to the protocol.
     *
     * Emits ERC20 Transfer event in call stack if successful.
     *
     * Reverts if:
     * - Contract at token address does not support ERC20 function transferFrom
     * - Calling transferFrom on token fails for some reason (e.g. protocol is not approved to transfer)
     * - Received ERC20 token amount differs from the expected value
     *
     * @param _tokenAddress - address of the token to be transferred
     * @param _from - address to transfer funds from
     * @param _amount - amount to be transferred
     */
    function transferFundsIn(address _tokenAddress, address _from, uint256 _amount) internal {
        if (_amount > 0) {
            // protocol balance before the transfer
            uint256 protocolTokenBalanceBefore = IERC20(_tokenAddress).balanceOf(address(this));
            // transfer ERC20 tokens from the caller
            IERC20(_tokenAddress).safeTransferFrom(_from, address(this), _amount);
            // protocol balance after the transfer
            uint256 protocolTokenBalanceAfter = IERC20(_tokenAddress).balanceOf(address(this));
            // make sure that expected amount of tokens was transferred
            if (protocolTokenBalanceAfter - protocolTokenBalanceBefore != _amount)
                revert BosonErrors.InsufficientValueReceived();
        }
    }

    /**
     * @notice Same as transferFundsIn(address _tokenAddress, address _from, uint256 _amount),
     * but _from is message sender
     *
     * @param _tokenAddress - address of the token to be transferred
     * @param _amount - amount to be transferred
     */
    function transferFundsIn(address _tokenAddress, uint256 _amount) internal {
        transferFundsIn(_tokenAddress, _msgSender(), _amount);
    }

    /**
     * @notice Tries to transfer native currency or tokens from the protocol to the recipient.
     *
     * Emits FundsWithdrawn event if successful.
     * Emits ERC20 Transfer event in call stack if ERC20 token is withdrawn and transfer is successful.
     *
     * Reverts if:
     * - Transfer of native currency is not successful (i.e. recipient is a contract which reverted)
     * - Contract at token address does not support ERC20 function transfer
     * - Available funds is less than amount to be decreased
     *
     * @param _entityId - id of entity for which funds should be decreased, or 0 for protocol
     * @param _tokenAddress - address of the token to be transferred
     * @param _to - address of the recipient
     * @param _amount - amount to be transferred
     */
    function transferFundsOut(uint256 _entityId, address _tokenAddress, address payable _to, uint256 _amount) internal {
        // first decrease the amount to prevent the reentrancy attack
        decreaseAvailableFunds(_entityId, _tokenAddress, _amount);

        // try to transfer the funds
        transferFundsOut(_tokenAddress, _to, _amount);

        // notify the external observers
        emit IBosonFundsBaseEvents.FundsWithdrawn(_entityId, _to, _tokenAddress, _amount, _msgSender());
    }

    /**
     * @notice Tries to transfer native currency or tokens from the protocol to the recipient.
     *
     * Emits ERC20 Transfer event in call stack if ERC20 token is withdrawn and transfer is successful.
     *
     * Reverts if:
     * - Transfer of native currency is not successful (i.e. recipient is a contract which reverted)
     * - Contract at token address does not support ERC20 function transfer
     * - Available funds is less than amount to be decreased
     *
     * @param _tokenAddress - address of the token to be transferred
     * @param _to - address of the recipient
     * @param _amount - amount to be transferred
     */
    function transferFundsOut(address _tokenAddress, address payable _to, uint256 _amount) internal {
        // try to transfer the funds
        if (_tokenAddress == address(0)) {
            // transfer native currency
            (bool success, ) = _to.call{ value: _amount }("");
            if (!success) revert BosonErrors.TokenTransferFailed();
        } else {
            // transfer ERC20 tokens
            IERC20(_tokenAddress).safeTransfer(_to, _amount);
        }
    }

    /**
     * @notice Increases the amount, available to withdraw or use as a seller deposit.
     *
     * @param _entityId - id of entity for which funds should be increased, or 0 for protocol
     * @param _tokenAddress - funds contract address or zero address for native currency
     * @param _amount - amount to be credited
     */
    function increaseAvailableFunds(uint256 _entityId, address _tokenAddress, uint256 _amount) internal {
        ProtocolLib.ProtocolLookups storage pl = ProtocolLib.protocolLookups();

        // if the current amount of token is 0, the token address must be added to the token list
        mapping(address => uint256) storage availableFunds = pl.availableFunds[_entityId];
        if (availableFunds[_tokenAddress] == 0) {
            address[] storage tokenList = pl.tokenList[_entityId];
            tokenList.push(_tokenAddress);
            //Set index mapping. Should be index in tokenList array + 1
            pl.tokenIndexByAccount[_entityId][_tokenAddress] = tokenList.length;
        }

        // update the available funds
        availableFunds[_tokenAddress] += _amount;
    }

    /**
     * @notice Decreases the amount available to withdraw or use as a seller deposit.
     *
     * Reverts if:
     * - Available funds is less than amount to be decreased
     *
     * @param _entityId - id of entity for which funds should be decreased, or 0 for protocol
     * @param _tokenAddress - funds contract address or zero address for native currency
     * @param _amount - amount to be taken away
     */
    function decreaseAvailableFunds(uint256 _entityId, address _tokenAddress, uint256 _amount) internal {
        if (_amount > 0) {
            ProtocolLib.ProtocolLookups storage pl = ProtocolLib.protocolLookups();

            // get available funds from storage
            mapping(address => uint256) storage availableFunds = pl.availableFunds[_entityId];
            uint256 entityFunds = availableFunds[_tokenAddress];

            // make sure that seller has enough funds in the pool and reduce the available funds
            if (entityFunds < _amount) revert BosonErrors.InsufficientAvailableFunds();

            // Use unchecked to optimize execution cost. The math is safe because of the require above.
            unchecked {
                availableFunds[_tokenAddress] = entityFunds - _amount;
            }

            // if available funds are totally emptied, the token address is removed from the seller's tokenList
            if (entityFunds == _amount) {
                // Get the index in the tokenList array, which is 1 less than the tokenIndexByAccount index
                address[] storage tokenList = pl.tokenList[_entityId];
                uint256 lastTokenIndex = tokenList.length - 1;
                mapping(address => uint256) storage entityTokens = pl.tokenIndexByAccount[_entityId];
                uint256 index = entityTokens[_tokenAddress] - 1;

                // if target is last index then only pop and delete are needed
                // otherwise, we overwrite the target with the last token first
                if (index != lastTokenIndex) {
                    // Need to fill gap caused by delete if more than one element in storage array
                    address tokenToMove = tokenList[lastTokenIndex];
                    // Copy the last token in the array to this index to fill the gap
                    tokenList[index] = tokenToMove;
                    // Reset index mapping. Should be index in tokenList array + 1
                    entityTokens[tokenToMove] = index + 1;
                }
                // Delete last token address in the array, which was just moved to fill the gap
                tokenList.pop();
                // Delete from index mapping
                delete entityTokens[_tokenAddress];
            }
        }
    }

    /**
     * @notice Distributes the royalties to external recipients and seller's treasury.
     *
     * @param _offer - storage pointer to the offer
     * @param _secondaryCommit - information about the secondary commit (royaltyInfoIndex, price, escrowedRoyaltyAmount)
     * @param _effectivePriceMultiplier - multiplier for the price, depending on the state of the exchange
     */
    function distributeRoyalties(
        uint256 _exchangeId,
        BosonTypes.Offer storage _offer,
        BosonTypes.ExchangeCosts memory _secondaryCommit,
        uint256 _effectivePriceMultiplier
    ) internal returns (uint256 sellerRoyalties) {
        address sender = _msgSender();
        address exchangeToken = _offer.exchangeToken;
        BosonTypes.RoyaltyInfo storage _royaltyInfo = _offer.royaltyInfo[_secondaryCommit.royaltyInfoIndex];
        uint256 len = _royaltyInfo.recipients.length;
        uint256 totalAmount;
        uint256 effectivePrice = applyPercent(_secondaryCommit.price, _effectivePriceMultiplier);
        ProtocolLib.ProtocolLookups storage pl = ProtocolLib.protocolLookups();
        for (uint256 i = 0; i < len; ) {
            address payable recipient = _royaltyInfo.recipients[i];
            uint256 amount = applyPercent(_royaltyInfo.bps[i], effectivePrice);
            totalAmount += amount;
            if (recipient == address(0)) {
                // goes to seller's treasury
                sellerRoyalties += amount;
            } else {
                // Make funds available to withdraw
                if (amount > 0) {
                    increaseAvailableFundsAndEmitEvent(
                        _exchangeId,
                        pl.royaltyRecipientIdByWallet[recipient],
                        exchangeToken,
                        amount,
                        sender
                    );
                }
            }

            unchecked {
                i++;
            }
        }

        // if there is a remainder due to rounding, it goes to the seller's treasury
        sellerRoyalties =
            sellerRoyalties +
            applyPercent(_secondaryCommit.royaltyAmount, _effectivePriceMultiplier) -
            totalAmount;
    }

    /**
     * @notice Returns the balance of the protocol for the given token address
     *
     * @param _tokenAddress - the address of the token to check the balance for
     * @return balance - the balance of the protocol for the given token address
     */
    function getBalance(address _tokenAddress) internal view returns (uint256) {
        return _tokenAddress == address(0) ? address(this).balance : IERC20(_tokenAddress).balanceOf(address(this));
    }

    /**
     * @notice Calulates the percentage of the amount.
     *
     * @param _amount - amount to be used for the calculation
     * @param _percent - percentage to be calculated, in basis points (1% = 100, 100% = 10000)
     */
    function applyPercent(uint256 _amount, uint256 _percent) internal pure returns (uint256) {
        if (_percent == HUNDRED_PERCENT) return _amount;
        if (_percent == 0) return 0;

        return (_amount * _percent) / HUNDRED_PERCENT;
    }
}
