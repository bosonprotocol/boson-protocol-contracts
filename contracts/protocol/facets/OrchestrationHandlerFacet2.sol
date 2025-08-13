// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import "../../domain/BosonConstants.sol";
import { DisputeBase } from "../bases/DisputeBase.sol";

/**
 * @title OrchestrationHandlerFacet2
 *
 * @notice Combines invocation of two actions (raiseDispute and escalateDispute) in one transaction.
 */
contract OrchestrationHandlerFacet2 is DisputeBase {
    /**
     * @notice Initializes facet.
     */
    function initialize() public {
        // No-op initializer.
        // - kept for consistency with other facets
        // - exception here because OrchestrationFacet is split into two facets just because of the size limit. Both facets contrubute to 1 interface - IBosonOrchestrationHandler
    }

    /**
     * @notice Raises a dispute and immediately escalates it.
     *
     * Caller must send (or for ERC20, approve the transfer of) the
     * buyer escalation deposit percentage of the offer price, which
     * will be added to the pot for resolution.
     *
     * Emits a DisputeRaised and a DisputeEscalated event if successful.
     *
     * Reverts if:
     * - The disputes region of protocol is paused
     * - The orchestration region of protocol is paused
     * - Caller is not the buyer for the given exchange id
     * - Exchange does not exist
     * - Exchange is not in a Redeemed state
     * - Dispute period has elapsed already
     * - Dispute resolver is not specified (absolute zero offer)
     * - Offer price is in native token and caller does not send enough
     * - Offer price is in some ERC20 token and caller also sends native currency
     * - If contract at token address does not support ERC20 function transferFrom
     * - If calling transferFrom on token fails for some reason (e.g. protocol is not approved to transfer)
     * - Received ERC20 token amount differs from the expected value
     *
     * @param _exchangeId - the id of the associated exchange
     */
    function raiseAndEscalateDispute(uint256 _exchangeId) external payable orchestrationNotPaused nonReentrant {
        // Get the exchange, should be in redeemed state
        (Exchange storage exchange, Voucher storage voucher) = getValidExchange(_exchangeId, ExchangeState.Redeemed);

        // Get the offer, which will exist if the exchange does
        (, Offer storage offer) = fetchOffer(exchange.offerId);

        // Raise the dispute
        raiseDisputeInternal(exchange, voucher, getSellerId(offer));

        // Escalate the dispute
        escalateDisputeInternal(_exchangeId);
    }
}
