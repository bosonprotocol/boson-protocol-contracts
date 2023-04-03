// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "hardhat/console.sol";
import "../../domain/BosonConstants.sol";
import { BosonTypes } from "../../domain/BosonTypes.sol";
import { EIP712Lib } from "../libs/EIP712Lib.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";
import { IERC20 } from "../../interfaces/IERC20.sol";
import { SafeERC20 } from "../../ext_libs/SafeERC20.sol";

/**
 * @title FundsLib
 *
 * @dev
 */
library FundsLib {
    using SafeERC20 for IERC20;

    event FundsEncumbered(
        uint256 indexed entityId,
        address indexed exchangeToken,
        uint256 amount,
        address indexed executedBy
    );
    event FundsReleased(
        uint256 indexed exchangeId,
        uint256 indexed entityId,
        address indexed exchangeToken,
        uint256 amount,
        address executedBy
    );
    event ProtocolFeeCollected(
        uint256 indexed exchangeId,
        address indexed exchangeToken,
        uint256 amount,
        address indexed executedBy
    );
    event FundsWithdrawn(
        uint256 indexed sellerId,
        address indexed withdrawnTo,
        address indexed tokenAddress,
        uint256 amount,
        address executedBy
    );

    /**
     * @notice Takes in the offer id and buyer id and encumbers buyer's and seller's funds during the commitToOffer.
     * If offer is preminted, caller's funds are not encumbered, but the price is covered from the seller's funds.
     *
     * Emits FundsEncumbered event if successful.
     *
     * Reverts if:
     * - Offer price is in native token and caller does not send enough
     * - Offer price is in some ERC20 token and caller also sends native currency
     * - Contract at token address does not support ERC20 function transferFrom
     * - Calling transferFrom on token fails for some reason (e.g. protocol is not approved to transfer)
     * - Seller has less funds available than sellerDeposit for non preminted offers
     * - Seller has less funds available than sellerDeposit and price for preminted offers
     * - Received ERC20 token amount differs from the expected value
     *
     * @param _offerId - id of the offer with the details
     * @param _buyerId - id of the buyer
     * @param _price - the price, either price discovered externally or set on offer creation
     */
    function encumberFunds(
        uint256 _offerId,
        uint256 _buyerId,
        uint256 _price,
        bool _isPreminted,
        BosonTypes.OfferPrice _priceType
    ) internal {
        // Load protocol entities storage
        ProtocolLib.ProtocolEntities storage pe = ProtocolLib.protocolEntities();

        // get message sender
        address sender = EIP712Lib.msgSender();

        // fetch offer to get the exchange token, price and seller
        // this will be called only from commitToOffer so we expect that exchange actually exist
        BosonTypes.Offer storage offer = pe.offers[_offerId];
        address exchangeToken = offer.exchangeToken;

        bool isPriceDiscovery = _priceType == BosonTypes.OfferPrice.Discovery;
        // if offer is non-preminted or is preMinted but price type is discovery the transaction is starting from protocol and caller must provide the payment
        if (!_isPreminted || isPriceDiscovery) {
            validateIncomingPayment(exchangeToken, _price);
            emit FundsEncumbered(_buyerId, exchangeToken, _price, sender);
        }

        // decrease available funds
        uint256 sellerId = offer.sellerId;
        uint256 sellerFundsEncumbered = offer.sellerDeposit + (_isPreminted && !isPriceDiscovery ? _price : 0); // for preminted offer and price type is fixed, encumber also price from seller's available funds
        decreaseAvailableFunds(sellerId, exchangeToken, sellerFundsEncumbered);

        // notify external observers
        emit FundsEncumbered(sellerId, exchangeToken, sellerFundsEncumbered, sender);
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
            console.log("validateIncomingPayment");
            console.log(msg.value);
            console.log(_value);
            // if transfer is in the native currency, msg.value must be at leat the price
            require(msg.value >= _value, INSUFFICIENT_VALUE_RECEIVED);
        } else {
            // when price is in an erc20 token, transferring the native currency is not allowed
            require(msg.value == 0, NATIVE_NOT_ALLOWED);

            // if transfer is in ERC20 token, try to transfer the amount from buyer to the protocol
            transferFundsToProtocol(_exchangeToken, _value);
        }
    }

    /**
     * @notice Takes in the exchange id and releases the funds to buyer and seller, depending on the state of the exchange.
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
        uint256 sellerPayoff;
        uint256 buyerPayoff;
        uint256 protocolFee;
        uint256 agentFee;

        BosonTypes.OfferFees storage offerFee = pe.offerFees[exchange.offerId];
        uint256 price = offer.price;
        {
            // scope to avoid stack too deep errors
            BosonTypes.ExchangeState exchangeState = exchange.state;
            uint256 sellerDeposit = offer.sellerDeposit;

            if (exchangeState == BosonTypes.ExchangeState.Completed) {
                // COMPLETED
                protocolFee = offerFee.protocolFee;
                // buyerPayoff is 0
                agentFee = offerFee.agentFee;
                sellerPayoff = price + sellerDeposit - protocolFee - agentFee;
            } else if (exchangeState == BosonTypes.ExchangeState.Revoked) {
                // REVOKED
                // sellerPayoff is 0
                buyerPayoff = price + sellerDeposit;
            } else if (exchangeState == BosonTypes.ExchangeState.Canceled) {
                // CANCELED
                uint256 buyerCancelPenalty = offer.buyerCancelPenalty;
                sellerPayoff = sellerDeposit + buyerCancelPenalty;
                buyerPayoff = price - buyerCancelPenalty;
            } else if (exchangeState == BosonTypes.ExchangeState.Disputed) {
                // DISPUTED
                // determine if buyerEscalationDeposit was encumbered or not
                // if dispute was escalated, disputeDates.escalated is populated
                uint256 buyerEscalationDeposit = pe.disputeDates[_exchangeId].escalated > 0
                    ? pe.disputeResolutionTerms[exchange.offerId].buyerEscalationDeposit
                    : 0;

                // get the information about the dispute, which must exist
                BosonTypes.Dispute storage dispute = pe.disputes[_exchangeId];
                BosonTypes.DisputeState disputeState = dispute.state;

                if (disputeState == BosonTypes.DisputeState.Retracted) {
                    // RETRACTED - same as "COMPLETED"
                    protocolFee = offerFee.protocolFee;
                    agentFee = offerFee.agentFee;
                    // buyerPayoff is 0
                    sellerPayoff = price + sellerDeposit - protocolFee - agentFee + buyerEscalationDeposit;
                } else if (disputeState == BosonTypes.DisputeState.Refused) {
                    // REFUSED
                    sellerPayoff = sellerDeposit;
                    buyerPayoff = price + buyerEscalationDeposit;
                } else {
                    // RESOLVED or DECIDED
                    uint256 pot = price + sellerDeposit + buyerEscalationDeposit;
                    buyerPayoff = (pot * dispute.buyerPercent) / 10000;
                    sellerPayoff = pot - buyerPayoff;
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
                price,
                exchangeToken
            );
            sellerPayoff += sequentialRoyalties;
            protocolFee += sequentialProtocolFee;
        }

        // Store payoffs to availablefunds and notify the external observers
        address sender = EIP712Lib.msgSender();
        if (sellerPayoff > 0) {
            increaseAvailableFundsAndEmitEvent(_exchangeId, offer.sellerId, exchangeToken, sellerPayoff, sender);
        }
        if (buyerPayoff > 0) {
            increaseAvailableFundsAndEmitEvent(_exchangeId, exchange.buyerId, exchangeToken, buyerPayoff, sender);
        }

        if (protocolFee > 0) {
            increaseAvailableFunds(0, exchangeToken, protocolFee);
            emit ProtocolFeeCollected(_exchangeId, exchangeToken, protocolFee, sender);
        }
        if (agentFee > 0) {
            // Get the agent for offer
            uint256 agentId = ProtocolLib.protocolLookups().agentIdByOffer[exchange.offerId];
            increaseAvailableFundsAndEmitEvent(_exchangeId, agentId, exchangeToken, agentFee, sender);
        }
    }

    /**
     * @notice Takes in the exchange id and releases the funds to all intermediate reseller, depending on the state of the exchange.
     * It is called only from releaseFunds. Protocol fee and royalties are calculated and returned to releaseFunds, where are added to the total.
     *
     * Emits FundsReleased events for non zero payoffs.
     *
     * @param _exchangeId - exchange id
     * @param _exchangeState - state of the exchange
     * @param _initialPrice - initial price of the offer
     * @param _exchangeToken - address of the token used for the exchange
     * @return protocolFee - protocol fee from secondary sales
     * @return royalties - royalties from secondary sales
     */
    function releaseFundsToIntermediateSellers(
        uint256 _exchangeId,
        BosonTypes.ExchangeState _exchangeState,
        uint256 _initialPrice,
        address _exchangeToken
    ) internal returns (uint256 protocolFee, uint256 royalties) {
        BosonTypes.SequentialCommit[] storage sequentialCommits;

        // calculate effective price multiplier
        uint256 effectivePriceMultiplier;
        {
            ProtocolLib.ProtocolEntities storage pe = ProtocolLib.protocolEntities();

            sequentialCommits = pe.sequentialCommits[_exchangeId];

            // if no sequential commit happened, just return
            if (sequentialCommits.length == 0) {
                return (0, 0);
            }

            {
                if (_exchangeState == BosonTypes.ExchangeState.Completed) {
                    // COMPLETED, buyer pays full price
                    effectivePriceMultiplier = 10000;
                } else if (
                    _exchangeState == BosonTypes.ExchangeState.Revoked ||
                    _exchangeState == BosonTypes.ExchangeState.Canceled
                ) {
                    // REVOKED or CANCELED, buyer pays nothing (buyerCancelationPenalty is not considered payment)
                    effectivePriceMultiplier = 0;
                } else if (_exchangeState == BosonTypes.ExchangeState.Disputed) {
                    // DISPUTED
                    // get the information about the dispute, which must exist
                    BosonTypes.Dispute storage dispute = pe.disputes[_exchangeId];
                    BosonTypes.DisputeState disputeState = dispute.state;

                    if (disputeState == BosonTypes.DisputeState.Retracted) {
                        // RETRACTED - same as "COMPLETED"
                        effectivePriceMultiplier = 10000;
                    } else if (disputeState == BosonTypes.DisputeState.Refused) {
                        // REFUSED, buyer pays nothing
                        effectivePriceMultiplier = 0;
                    } else {
                        // RESOLVED or DECIDED
                        effectivePriceMultiplier = 10000 - dispute.buyerPercent;
                    }
                }
            }
        }

        uint256 resellerBuyPrice = _initialPrice; // the price that reseller paid for the voucher
        address msgSender = EIP712Lib.msgSender();
        uint256 len = sequentialCommits.length;
        for (uint256 i = 0; i < len; i++) {
            BosonTypes.SequentialCommit storage sc = sequentialCommits[i];

            // amount to be released
            uint256 currentResellerAmount;

            // inside the scope to avoid stack too deep error
            {
                uint256 price = sc.price;
                uint256 protocolFeeAmount = sc.protocolFeeAmount;
                uint256 royaltyAmount = sc.royaltyAmount;

                protocolFee += protocolFeeAmount;
                royalties += royaltyAmount;

                // secondary price without protocol fee and royalties
                uint256 reducedSecondaryPrice = price - protocolFeeAmount - royaltyAmount;

                // current reseller gets the difference between final payout and the immediate payout they received at the time of secondary sale
                currentResellerAmount =
                    (
                        reducedSecondaryPrice > resellerBuyPrice
                            ? effectivePriceMultiplier * (reducedSecondaryPrice - resellerBuyPrice)
                            : (10000 - effectivePriceMultiplier) * (resellerBuyPrice - reducedSecondaryPrice)
                    ) /
                    10000;

                resellerBuyPrice = price;
            }

            if (currentResellerAmount > 0) {
                increaseAvailableFundsAndEmitEvent(
                    _exchangeId,
                    sc.resellerId,
                    _exchangeToken,
                    currentResellerAmount,
                    msgSender
                );
            }
        }

        // protocolFee and royalties can be multiplied by effectivePriceMultiplier just at the end
        protocolFee = (protocolFee * effectivePriceMultiplier) / 10000;
        royalties = (royalties * effectivePriceMultiplier) / 10000;
    }

    /**
     * @notice Forwared values to increaseAvailableFunds and emits notifies external listeners.
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
        emit FundsReleased(_exchangeId, _entityId, _tokenAddress, _amount, _sender);
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
    function transferFundsToProtocol(
        address _tokenAddress,
        address _from,
        uint256 _amount
    ) internal {
        if (_amount > 0) {
            // protocol balance before the transfer
            uint256 protocolTokenBalanceBefore = IERC20(_tokenAddress).balanceOf(address(this));

            // transfer ERC20 tokens from the caller
            IERC20(_tokenAddress).safeTransferFrom(_from, address(this), _amount);

            // protocol balance after the transfer
            uint256 protocolTokenBalanceAfter = IERC20(_tokenAddress).balanceOf(address(this));

            // make sure that expected amount of tokens was transferred
            require(protocolTokenBalanceAfter - protocolTokenBalanceBefore == _amount, INSUFFICIENT_VALUE_RECEIVED);
        }
    }

    function transferFundsToProtocol(address _tokenAddress, uint256 _amount) internal {
        transferFundsToProtocol(_tokenAddress, EIP712Lib.msgSender(), _amount);
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
     * @param _tokenAddress - address of the token to be transferred
     * @param _to - address of the recipient
     * @param _amount - amount to be transferred
     */
    function transferFundsFromProtocol(
        uint256 _entityId,
        address _tokenAddress,
        address payable _to,
        uint256 _amount
    ) internal {
        // first decrease the amount to prevent the reentrancy attack
        decreaseAvailableFunds(_entityId, _tokenAddress, _amount);

        // try to transfer the funds
        transferFundsFromProtocol(_tokenAddress, _to, _amount);

        // notify the external observers
        emit FundsWithdrawn(_entityId, _to, _tokenAddress, _amount, EIP712Lib.msgSender());
    }

    function transferFundsFromProtocol(
        address _tokenAddress,
        address payable _to,
        uint256 _amount
    ) internal {
        // try to transfer the funds
        if (_tokenAddress == address(0)) {
            // transfer native currency
            (bool success, ) = _to.call{ value: _amount }("");
            require(success, TOKEN_TRANSFER_FAILED);
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
    function increaseAvailableFunds(
        uint256 _entityId,
        address _tokenAddress,
        uint256 _amount
    ) internal {
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
    function decreaseAvailableFunds(
        uint256 _entityId,
        address _tokenAddress,
        uint256 _amount
    ) internal {
        if (_amount > 0) {
            ProtocolLib.ProtocolLookups storage pl = ProtocolLib.protocolLookups();

            // get available funds from storage
            mapping(address => uint256) storage availableFunds = pl.availableFunds[_entityId];
            uint256 entityFunds = availableFunds[_tokenAddress];

            // make sure that seller has enough funds in the pool and reduce the available funds
            require(entityFunds >= _amount, INSUFFICIENT_AVAILABLE_FUNDS);

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
}
