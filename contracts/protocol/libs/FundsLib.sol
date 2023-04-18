// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "../../domain/BosonConstants.sol";
import { BosonTypes } from "../../domain/BosonTypes.sol";
import { EIP712Lib } from "../libs/EIP712Lib.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";
import { IERC20 } from "../../interfaces/IERC20.sol";
import { SafeERC20 } from "../../ext_libs/SafeERC20.sol";
import { IDRFeeMutualizer } from "../../interfaces/clients/IDRFeeMutualizer.sol";

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
     * @param _exchangeId - id of the exchange
     * @param _buyerId - id of the buyer
     * @param _isPreminted - flag indicating if the offer is preminted
     */
    function encumberFunds(
        uint256 _offerId,
        uint256 _exchangeId,
        uint256 _buyerId,
        bool _isPreminted
    ) internal {
        // Load protocol entities storage
        ProtocolLib.ProtocolEntities storage pe = ProtocolLib.protocolEntities();

        // get message sender
        address sender = EIP712Lib.msgSender();

        // fetch offer to get the exchange token, price and seller
        // this will be called only from commitToOffer so we expect that exchange actually exist
        BosonTypes.Offer storage offer = pe.offers[_offerId];
        address exchangeToken = offer.exchangeToken;
        uint256 price = offer.price;
        uint256 sellerFundsEncumbered = offer.sellerDeposit; // minimal that is encumbered for seller

        if (_isPreminted) {
            // for preminted offer, encumber also price from seller's available funds
            sellerFundsEncumbered += price;
        } else {
            // if offer is non-preminted, validate incoming payment
            validateIncomingPayment(exchangeToken, price);
            emit FundsEncumbered(_buyerId, exchangeToken, price, sender);
        }

        // encumber DR fee
        uint256 sellerId = offer.sellerId;
        uint256 drFee = pe.disputeResolutionTerms[_offerId].feeAmount;
        address mutualizer = offer.feeMutualizer;
        if (drFee > 0) {
            if (mutualizer == address(0)) {
                // if mutualizer is not set, encumber DR fee from seller's funds
                sellerFundsEncumbered += drFee;
            } else {
                requestDRFee(_exchangeId, mutualizer, pe.sellers[sellerId].assistant, exchangeToken, drFee);
            }
        }

        // decrease seller's available funds
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
            // if transfer is in the native currency, msg.value must match offer price
            require(msg.value == _value, INSUFFICIENT_VALUE_RECEIVED);
        } else {
            // when price is in an erc20 token, transferring the native currency is not allowed
            require(msg.value == 0, NATIVE_NOT_ALLOWED);

            // if transfer is in ERC20 token, try to transfer the amount from buyer to the protocol
            transferFundsToProtocol(_exchangeToken, _value);
        }
    }

    struct PayOff {
        uint256 seller;
        uint256 buyer;
        uint256 protocol;
        uint256 agent;
        uint256 disputeResolver;
        uint256 feeMutualizer;
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
        uint256 offerId = exchange.offerId;

        // Get offer from storage to get the details about sellerDeposit, price, sellerId, exchangeToken and buyerCancelPenalty
        BosonTypes.Offer storage offer = pe.offers[offerId];

        // Get the dispute resolution terms for the offer
        BosonTypes.DisputeResolutionTerms storage disputeResolutionTerms = pe.disputeResolutionTerms[offerId];

        // calculate the payoffs depending on state exchange is in
        PayOff memory payOff;
        uint256 disputeResolverFee = disputeResolutionTerms.feeAmount;
        {
            // scope to avoid stack too deep errors
            BosonTypes.ExchangeState exchangeState = exchange.state;
            uint256 sellerDeposit = offer.sellerDeposit;
            uint256 price = offer.price;

            if (exchangeState == BosonTypes.ExchangeState.Completed) {
                // COMPLETED
                BosonTypes.OfferFees storage offerFee = pe.offerFees[offerId];
                payOff.protocol = offerFee.protocolFee;
                // buyerPayoff is 0
                payOff.agent = offerFee.agentFee;
                payOff.seller = price + sellerDeposit - payOff.protocol - payOff.agent;
            } else if (exchangeState == BosonTypes.ExchangeState.Revoked) {
                // REVOKED
                // sellerPayoff is 0
                payOff.buyer = price + sellerDeposit;
            } else if (exchangeState == BosonTypes.ExchangeState.Canceled) {
                // CANCELED
                uint256 buyerCancelPenalty = offer.buyerCancelPenalty;
                payOff.seller = sellerDeposit + buyerCancelPenalty;
                payOff.buyer = price - buyerCancelPenalty;
            } else if (exchangeState == BosonTypes.ExchangeState.Disputed) {
                // DISPUTED
                // determine if buyerEscalationDeposit was encumbered or not
                // if dispute was escalated, disputeDates.escalated is populated
                uint256 buyerEscalationDeposit;
                if (pe.disputeDates[_exchangeId].escalated > 0) {
                    buyerEscalationDeposit = disputeResolutionTerms.buyerEscalationDeposit;
                    payOff.disputeResolver = disputeResolverFee; // If REFUSED, this is later set to 0
                }

                // get the information about the dispute, which must exist
                BosonTypes.Dispute storage dispute = pe.disputes[_exchangeId];
                BosonTypes.DisputeState disputeState = dispute.state;

                if (disputeState == BosonTypes.DisputeState.Retracted) {
                    // RETRACTED - same as "COMPLETED"
                    BosonTypes.OfferFees storage offerFee = pe.offerFees[offerId];
                    payOff.protocol = offerFee.protocolFee;
                    payOff.agent = offerFee.agentFee;
                    // buyerPayoff is 0
                    payOff.seller = price + sellerDeposit - payOff.protocol - payOff.agent + buyerEscalationDeposit;
                } else if (disputeState == BosonTypes.DisputeState.Refused) {
                    // REFUSED
                    payOff.seller = sellerDeposit;
                    payOff.buyer = price + buyerEscalationDeposit;
                    payOff.disputeResolver = 0;
                } else {
                    // RESOLVED or DECIDED
                    uint256 pot = price + sellerDeposit + buyerEscalationDeposit;
                    payOff.buyer = (pot * dispute.buyerPercent) / 10000;
                    payOff.seller = pot - payOff.buyer;
                }
            }
            // Mutualizer payoff is always the difference between the DR fee and what is paid to the dispute resolver
            payOff.feeMutualizer = disputeResolverFee - payOff.disputeResolver;
        }

        // Store payoffs to availablefunds and notify the external observers
        address exchangeToken = offer.exchangeToken;
        address sender = EIP712Lib.msgSender();
        // ToDo: use `increaseAvailableFundsAndEmitEvent` from  https://github.com/bosonprotocol/boson-protocol-contracts/pull/569
        if (payOff.seller > 0) {
            uint256 sellerId = offer.sellerId;
            increaseAvailableFunds(sellerId, exchangeToken, payOff.seller);
            emit FundsReleased(_exchangeId, sellerId, exchangeToken, payOff.seller, sender);
        }
        if (payOff.buyer > 0) {
            uint256 buyerId = exchange.buyerId;
            increaseAvailableFunds(buyerId, exchangeToken, payOff.buyer);
            emit FundsReleased(_exchangeId, buyerId, exchangeToken, payOff.buyer, sender);
        }
        if (payOff.protocol > 0) {
            increaseAvailableFunds(0, exchangeToken, payOff.protocol);
            emit ProtocolFeeCollected(_exchangeId, exchangeToken, payOff.protocol, sender);
        }
        if (payOff.agent > 0) {
            // Get the agent for offer
            uint256 agentId = ProtocolLib.protocolLookups().agentIdByOffer[offerId];
            increaseAvailableFunds(agentId, exchangeToken, payOff.agent);
            emit FundsReleased(_exchangeId, agentId, exchangeToken, payOff.agent, sender);
        }
        if (payOff.disputeResolver > 0) {
            // Get the dispute resolver for offer
            uint256 disputeResolveId = disputeResolutionTerms.disputeResolverId;
            increaseAvailableFunds(disputeResolveId, exchangeToken, payOff.disputeResolver);
            emit FundsReleased(_exchangeId, disputeResolveId, exchangeToken, payOff.disputeResolver, sender);
        }

        // always make call to mutualizer, even if payoff is 0
        returnFeeToMutualizer(offer.feeMutualizer, _exchangeId, exchangeToken, payOff.feeMutualizer);

        IDRFeeMutualizer(offer.feeMutualizer).returnDRFee(
            ProtocolLib.protocolLookups().mutualizerUUIDByExchange[_exchangeId],
            exchangeToken,
            payOff.feeMutualizer,
            ""
        );
    }

    function returnFeeToMutualizer(
        address _feeMutualizer,
        uint256 _exchangeId,
        address _token,
        uint256 _feeAmount
    ) internal {
        uint256 nativePayoff;
        if (_feeAmount > 0 && _token != address(0)) {
            // Approve the mutualizer to withdraw the tokens
            IERC20(_token).approve(_feeMutualizer, _feeAmount);
        } else {
            // Even if _feeAmount == 0, this is still true
            nativePayoff = _feeAmount;
        }

        IDRFeeMutualizer(_feeMutualizer).returnDRFee(
            ProtocolLib.protocolLookups().mutualizerUUIDByExchange[_exchangeId],
            _token,
            _feeAmount,
            ""
        );
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
     * @param _amount - amount to be transferred
     */
    function transferFundsToProtocol(address _tokenAddress, uint256 _amount) internal {
        if (_amount > 0) {
            // protocol balance before the transfer
            uint256 protocolTokenBalanceBefore = IERC20(_tokenAddress).balanceOf(address(this));

            // transfer ERC20 tokens from the caller
            IERC20(_tokenAddress).safeTransferFrom(EIP712Lib.msgSender(), address(this), _amount);

            // protocol balance after the transfer
            uint256 protocolTokenBalanceAfter = IERC20(_tokenAddress).balanceOf(address(this));

            // make sure that expected amount of tokens was transferred
            require(protocolTokenBalanceAfter - protocolTokenBalanceBefore == _amount, INSUFFICIENT_VALUE_RECEIVED);
        }
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
        if (_tokenAddress == address(0)) {
            // transfer native currency
            (bool success, ) = _to.call{ value: _amount }("");
            require(success, TOKEN_TRANSFER_FAILED);
        } else {
            // transfer ERC20 tokens
            IERC20(_tokenAddress).safeTransfer(_to, _amount);
        }

        // notify the external observers
        emit FundsWithdrawn(_entityId, _to, _tokenAddress, _amount, EIP712Lib.msgSender());
    }

    /**
     * @notice Requests the DR fee from the mutualizer, validates it was really sent and store UUID
     *
     * Reverts if:
     * - Mutualizer does not cover the seller
     * - Mutualizer does not send the fee to the protocol
     * - Call to mutualizer fails
     *
     * @param _exchangeId - the exchange id
     * @param _mutualizer - address of the mutualizer
     * @param _sellerAddress - the seller address
     * @param _exchangeToken - the token address (use 0x0 for ETH)
     * @param _drFee - the DR fee
     */
    function requestDRFee(
        uint256 _exchangeId,
        address _mutualizer,
        address _sellerAddress,
        address _exchangeToken,
        uint256 _drFee
    ) internal {
        // protocol balance before the request // maybe reuse `getBalance` function from https://github.com/bosonprotocol/boson-protocol-contracts/pull/578
        uint256 protocolTokenBalanceBefore = _exchangeToken == address(0)
            ? address(this).balance
            : IERC20(_exchangeToken).balanceOf(address(this));

        // reqest DR fee from mutualizer
        (bool isCovered, uint256 mutualizerUUID) = IDRFeeMutualizer(_mutualizer).requestDRFee(
            _sellerAddress,
            _exchangeToken,
            _drFee,
            ""
        );
        require(isCovered, SELLER_NOT_COVERED);
        ProtocolLib.protocolLookups().mutualizerUUIDByExchange[_exchangeId] = mutualizerUUID;

        // protocol balance after the request
        uint256 protocolTokenBalanceAfter = _exchangeToken == address(0)
            ? address(this).balance
            : IERC20(_exchangeToken).balanceOf(address(this));

        // check if mutualizer sent the fee to the protocol
        require(protocolTokenBalanceAfter - protocolTokenBalanceBefore == _drFee, DR_FEE_NOT_RECEIVED);
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
