// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import "../../domain/BosonConstants.sol";
import { IBosonDisputeHandler } from "../../interfaces/handlers/IBosonDisputeHandler.sol";
import { IWrappedNative } from "../../interfaces/IWrappedNative.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { DisputeBase } from "../bases/DisputeBase.sol";
import { EIP712Lib } from "../libs/EIP712Lib.sol";

/**
 * @title DisputeHandlerFacet
 *
 * @notice Handles disputes associated with exchanges within the protocol.
 */
contract DisputeHandlerFacet is DisputeBase, IBosonDisputeHandler {
    bytes32 private constant RESOLUTION_TYPEHASH =
        keccak256(bytes("Resolution(uint256 exchangeId,uint256 buyerPercentBasisPoints)")); // needed for verification during the resolveDispute

    /**
     * @notice
     * For offers with native exchange token, the DRFee is returned to the mutualizer in wrapped native token.
     * Set the address of the wrapped native token in the constructor.
     *
     * @param _wNative - the address of the wrapped native token
     */
    //solhint-disable-next-line
    constructor(address _wNative) {
        if (_wNative == address(0)) revert InvalidAddress();
        wNative = IWrappedNative(_wNative);
    }

    /**
     * @notice Initializes Facet.
     * This function is callable only once.
     */
    function initialize() public onlyUninitialized(type(IBosonDisputeHandler).interfaceId) {
        DiamondLib.addSupportedInterface(type(IBosonDisputeHandler).interfaceId);
    }

    /**
     * @notice Raises a dispute.
     *
     * Reverts if:
     * - The disputes region of protocol is paused
     * - Caller does not hold a voucher for the given exchange id
     * - Exchange does not exist
     * - Exchange is not in a Redeemed state
     * - Dispute period has elapsed already
     *
     * @param _exchangeId - the id of the associated exchange
     */
    function raiseDispute(uint256 _exchangeId) external override disputesNotPaused nonReentrant {
        // Get the exchange, should be in redeemed state
        (Exchange storage exchange, Voucher storage voucher) = getValidExchange(_exchangeId, ExchangeState.Redeemed);

        // Get the offer, which will exist if the exchange does
        (, Offer storage offer) = fetchOffer(exchange.offerId);

        // Raise the dispute
        raiseDisputeInternal(exchange, voucher, offer.sellerId);
    }

    /**
     * @notice Retracts the dispute and release the funds.
     *
     * Emits a DisputeRetracted event if successful.
     *
     * Reverts if:
     * - The disputes region of protocol is paused
     * - Exchange does not exist
     * - Exchange is not in a Disputed state
     * - Caller is not the buyer for the given exchange id
     * - Dispute is in some state other than Resolving or Escalated
     * - Dispute was escalated and escalation period has elapsed
     *
     * @param _exchangeId - the id of the associated exchange
     */
    function retractDispute(uint256 _exchangeId) external override nonReentrant {
        // Get the exchange, should be in disputed state
        (Exchange storage exchange, ) = getValidExchange(_exchangeId, ExchangeState.Disputed);

        // Make sure the caller is buyer associated with the exchange  // {MR: only by game}
        checkBuyer(exchange.buyerId);

        // Fetch the dispute
        (, Dispute storage dispute, DisputeDates storage disputeDates) = fetchDispute(_exchangeId);

        // If dispute was escalated, make sure that escalation period is not over yet
        if (dispute.state == DisputeState.Escalated) {
            // make sure the dispute escalation period not expired already
            if (block.timestamp > disputeDates.timeout) revert DisputeHasExpired();
        } else {
            // If dispute is not escalated, make sure the it is in the resolving state
            if (dispute.state != DisputeState.Resolving) revert InvalidState();
        }

        // Finalize the dispute
        finalizeDispute(_exchangeId, exchange, dispute, disputeDates, DisputeState.Retracted, 0);

        // Notify watchers of state change
        emit DisputeRetracted(_exchangeId, _msgSender());
    }

    /**
     * @notice Extends the dispute timeout, allowing more time for mutual resolution.
     * As a consequence, buyer also gets more time to escalate the dispute.
     *
     * Emits a DisputeTimeoutExtened event if successful.
     *
     * Reverts if:
     * - The disputes region of protocol is paused
     * - Exchange does not exist
     * - Exchange is not in a Disputed state
     * - Caller is not the seller
     * - Dispute has expired already
     * - New dispute timeout is before the current dispute timeout
     * - Dispute is in some state other than Resolving
     *
     * @param _exchangeId - the id of the associated exchange
     * @param _newDisputeTimeout - new date when resolution period ends
     */
    function extendDisputeTimeout(
        uint256 _exchangeId,
        uint256 _newDisputeTimeout
    ) external override disputesNotPaused nonReentrant {
        // Verify that the caller is the seller. Get exchange -> get offer id -> get seller id -> get assistant address and compare to msg.sender
        // Get the exchange, should be in disputed state
        (Exchange storage exchange, ) = getValidExchange(_exchangeId, ExchangeState.Disputed);

        // Get the offer, assume it exist if exchange exist
        (, Offer storage offer) = fetchOffer(exchange.offerId);

        // Get seller, we assume seller exists if offer exists
        (, Seller storage seller, ) = fetchSeller(offer.sellerId);

        // get message sender
        address sender = _msgSender();

        // Caller must be seller's assistant address
        if (seller.assistant != sender) revert NotAssistant();

        // Fetch the dispute, it exists if exchange is in Disputed state
        (, Dispute storage dispute, DisputeDates storage disputeDates) = fetchDispute(_exchangeId);

        // Dispute must be in a resolving state
        if (dispute.state != DisputeState.Resolving) revert InvalidState();

        // If expired already, it cannot be extended
        if (block.timestamp > disputeDates.timeout) revert DisputeHasExpired();

        // New dispute timeout should be after the current dispute timeout
        if (_newDisputeTimeout <= disputeDates.timeout) revert InvalidDisputeTimeout();

        // Update the timeout
        disputeDates.timeout = _newDisputeTimeout;

        // Notify watchers of state change
        emit DisputeTimeoutExtended(_exchangeId, _newDisputeTimeout, sender);
    }

    /**
     * @notice Expires the dispute and releases the funds.
     *
     * Emits a DisputeExpired event if successful.
     *
     * Reverts if:
     * - The disputes region of protocol is paused
     * - Exchange does not exist
     * - Exchange is not in a Disputed state
     * - Dispute is still valid
     * - Dispute is in some state other than Resolving
     *
     * @param _exchangeId - the id of the associated exchange
     */
    function expireDispute(uint256 _exchangeId) public override nonReentrant {
        // Get the exchange, should be in disputed state
        (Exchange storage exchange, ) = getValidExchange(_exchangeId, ExchangeState.Disputed);

        // Fetch the dispute and dispute dates
        (, Dispute storage dispute, DisputeDates storage disputeDates) = fetchDispute(_exchangeId);

        // Make sure the dispute is in the resolving state
        if (dispute.state != DisputeState.Resolving) revert InvalidState();

        // make sure the dispute not expired already
        if (block.timestamp <= disputeDates.timeout) revert DisputeStillValid();

        // Finalize the dispute
        finalizeDispute(_exchangeId, exchange, dispute, disputeDates, DisputeState.Retracted, 0);

        // Notify watchers of state change
        emit DisputeExpired(_exchangeId, _msgSender());
    }

    /**
     * @notice Expires a batch of disputes and releases the funds.
     *
     * Emits a DisputeExpired event for every dispute if successful.
     *
     * Reverts if:
     * - The disputes region of protocol is paused
     * - For any dispute:
     *   - Exchange does not exist
     *   - Exchange is not in a Disputed state
     *   - Dispute is still valid
     *   - Dispute is in some state other than Resolving
     *
     * @param _exchangeIds - the array of ids of the associated exchanges
     */
    function expireDisputeBatch(uint256[] calldata _exchangeIds) external override {
        for (uint256 i = 0; i < _exchangeIds.length; ) {
            // create offer and update structs values to represent true state
            expireDispute(_exchangeIds[i]);

            unchecked {
                i++;
            }
        }
    }

    /**
     * @notice Resolves a dispute by providing the information about the funds split.
     * Callable by the buyer or seller, but the caller must provide the resolution signed by the other party.
     *
     * Emits a DisputeResolved event if successful.
     *
     * Reverts if:
     * - The disputes region of protocol is paused
     * - Specified buyer percent exceeds 100%
     * - Dispute has expired (resolution period has ended and dispute was not escalated)
     * - Exchange does not exist
     * - Exchange is not in the Disputed state
     * - Caller is neither the seller nor the buyer
     * - Signature does not belong to the address of the other party. Refer to EIP712Lib.verify for details
     * - Dispute state is neither Resolving nor escalated
     * - Dispute was escalated and escalation period has elapsed
     *
     * @param _exchangeId  - the id of the associated exchange
     * @param _buyerPercent - percentage of the pot that goes to the buyer
     * @param _signature - signature of the other party 
                           If the other party is ordinary EOA, it must be ECDSA signature in the format of concatenated r,s,v values. 
                           If the other party is a contract, it must be a valid ERC1271 signature.
                           If the other party is a EIP-7702 smart account, it can be either a valid ERC1271 signature or a valid ECDSA signature.
     */
    function resolveDispute(
        uint256 _exchangeId,
        uint256 _buyerPercent,
        bytes calldata _signature
    ) external override nonReentrant {
        // buyer should get at most 100%
        if (_buyerPercent > HUNDRED_PERCENT) revert InvalidBuyerPercent();

        // Get the exchange, should be in disputed state
        (Exchange storage exchange, ) = getValidExchange(_exchangeId, ExchangeState.Disputed);

        // Fetch the dispute and dispute dates
        (, Dispute storage dispute, DisputeDates storage disputeDates) = fetchDispute(_exchangeId);

        // Make sure the dispute is in the resolving or escalated state
        if (dispute.state != DisputeState.Resolving && dispute.state != DisputeState.Escalated) revert InvalidState();

        // Make sure the dispute not expired already
        if (block.timestamp > disputeDates.timeout) revert DisputeHasExpired();

        // wrap the code in a separate block to avoid stack too deep error
        {
            // Fetch the offer to get the info who the seller is
            (, Offer storage offer) = fetchOffer(exchange.offerId);

            // get seller id to check if caller is the seller
            (bool exists, uint256 sellerId) = getSellerIdByAssistant(_msgSender());

            // variable to store who the expected signer is
            address expectedSigner;

            // find out if the caller is the seller or the buyer, and which address should be the signer
            if (exists && offer.sellerId == sellerId) {
                // caller is the seller
                // get the buyer's address, which should be the signer of the resolution
                (, Buyer storage buyer) = fetchBuyer(exchange.buyerId);
                expectedSigner = buyer.wallet;
            } else {
                uint256 buyerId;
                (exists, buyerId) = getBuyerIdByWallet(_msgSender());
                if (!exists || buyerId != exchange.buyerId) revert NotBuyerOrSeller();

                // caller is the buyer
                // get the seller's address, which should be the signer of the resolution
                (, Seller storage seller, ) = fetchSeller(offer.sellerId);
                expectedSigner = seller.assistant;
            }

            // verify that the signature belongs to the expectedSigner
            EIP712Lib.verify(expectedSigner, hashResolution(_exchangeId, _buyerPercent), _signature);
        }

        // finalize the dispute
        finalizeDispute(_exchangeId, exchange, dispute, disputeDates, DisputeState.Resolved, _buyerPercent);

        // Notify watchers of state change
        emit DisputeResolved(_exchangeId, _buyerPercent, _msgSender());
    }

    /**
     * @notice Puts the dispute into the Escalated state.
     *
     * Caller must send (or for ERC20, approve the transfer of) the
     * buyer escalation deposit percentage of the offer price, which
     * will be added to the pot for resolution.
     *
     * Emits a DisputeEscalated event if successful.
     *
     * Reverts if:
     * - The disputes region of protocol is paused
     * - Exchange does not exist
     * - Exchange is not in a Disputed state
     * - Caller is not the buyer
     * - Dispute is already expired
     * - Dispute is not in a Resolving state
     * - Dispute resolver is not specified (absolute zero offer)
     * - Offer price is in native token and caller does not send enough
     * - Offer price is in some ERC20 token and caller also sends native currency
     * - If contract at token address does not support ERC20 function transferFrom
     * - If calling transferFrom on token fails for some reason (e.g. protocol is not approved to transfer)
     * - Received ERC20 token amount differs from the expected value
     *
     * @param _exchangeId - the id of the associated exchange
     */
    function escalateDispute(uint256 _exchangeId) external payable override nonReentrant {
        escalateDisputeInternal(_exchangeId);
    }

    /**
     * @notice Decides a dispute by providing the information about the funds split. Callable by the dispute resolver specified in the offer.
     *
     * Emits a DisputeDecided event if successful.
     *
     * Reverts if:
     * - The disputes region of protocol is paused
     * - Specified buyer percent exceeds 100%
     * - Exchange does not exist
     * - Exchange is not in the Disputed state
     * - Caller is not the dispute resolver for this dispute
     * - Dispute state is not Escalated
     * - Dispute escalation response period has elapsed
     *
     * @param _exchangeId  - the id of the associated exchange
     * @param _buyerPercent - percentage of the pot that goes to the buyer
     */
    function decideDispute(uint256 _exchangeId, uint256 _buyerPercent) external override nonReentrant {
        // Buyer should get at most 100%
        if (_buyerPercent > HUNDRED_PERCENT) revert InvalidBuyerPercent();

        // Make sure the dispute is valid and the caller is the dispute resolver
        (Exchange storage exchange, Dispute storage dispute, DisputeDates storage disputeDates) = disputeResolverChecks(
            _exchangeId
        );

        // Finalize the dispute
        finalizeDispute(_exchangeId, exchange, dispute, disputeDates, DisputeState.Decided, _buyerPercent);

        // Notify watchers of state change
        emit DisputeDecided(_exchangeId, _buyerPercent, _msgSender());
    }

    /**
     * @notice Enables dispute resolver to explicitly refuse to resolve a dispute in Escalated state and releases the funds.
     *
     * Emits an EscalatedDisputeRefused event if successful.
     *
     * Reverts if:
     * - The disputes region of protocol is paused
     * - Exchange does not exist
     * - Exchange is not in a Disputed state
     * - Dispute is in some state other than Escalated
     * - Dispute escalation response period has elapsed
     * - Caller is not the dispute resolver for this dispute
     *
     * @param _exchangeId - the id of the associated exchange
     */
    function refuseEscalatedDispute(uint256 _exchangeId) external override nonReentrant {
        // Make sure the dispute is valid and the caller is the dispute resolver
        (Exchange storage exchange, Dispute storage dispute, DisputeDates storage disputeDates) = disputeResolverChecks(
            _exchangeId
        );

        // Finalize the dispute
        finalizeDispute(_exchangeId, exchange, dispute, disputeDates, DisputeState.Refused, 0);

        // Notify watchers of state change
        emit EscalatedDisputeRefused(_exchangeId, _msgSender());
    }

    /**
     * @notice Expires the dispute in escalated state and release the funds.
     *
     * Emits an EscalatedDisputeExpired event if successful.
     *
     * Reverts if:
     * - The disputes region of protocol is paused
     * - Exchange does not exist
     * - Exchange is not in a Disputed state
     * - Dispute is in some state other than Escalated
     * - Dispute escalation period has not passed yet
     *
     * @param _exchangeId - the id of the associated exchange
     */
    function expireEscalatedDispute(uint256 _exchangeId) external override nonReentrant {
        // Get the exchange, should be in disputed state
        (Exchange storage exchange, ) = getValidExchange(_exchangeId, ExchangeState.Disputed);

        // Fetch the dispute and dispute dates
        (, Dispute storage dispute, DisputeDates storage disputeDates) = fetchDispute(_exchangeId);

        // Make sure the dispute is in the escalated state
        if (dispute.state != DisputeState.Escalated) revert InvalidState();

        // make sure the dispute escalation has expired already
        if (block.timestamp <= disputeDates.timeout) revert DisputeStillValid();

        // Finalize the dispute
        finalizeDispute(_exchangeId, exchange, dispute, disputeDates, DisputeState.Refused, 0);

        // Notify watchers of state change
        emit EscalatedDisputeExpired(_exchangeId, _msgSender());
    }

    /**
     * @notice Transitions a dispute to a "finalized" state.
     *
     * Target state must be Retracted, Resolved, or Decided.
     * Sets finalized date for exchange and dispute. Stores the resolution, if exists, and releases the funds.
     *
     * Reverts if the current dispute state is not Resolving or Escalated.
     *
     * @param _exchangeId  - the id of the associated exchange
     * @param _exchange - pointer to exchange storage slot
     * @param _dispute - pointer to dispute storage slot
     * @param _disputeDates - pointer to disputeDates storage slot
     * @param _targetState - target final state
     * @param _buyerPercent - percentage of the pot that goes to the buyer
     */
    function finalizeDispute(
        uint256 _exchangeId,
        Exchange storage _exchange,
        Dispute storage _dispute,
        DisputeDates storage _disputeDates,
        DisputeState _targetState,
        uint256 _buyerPercent
    ) internal disputesNotPaused {
        if (_targetState == DisputeState.Escalated || _targetState == DisputeState.Resolving)
            revert InvalidTargeDisputeState();

        // update dispute and exchange
        _disputeDates.finalized = block.timestamp;
        _dispute.state = _targetState;
        _exchange.finalizedDate = block.timestamp;

        // store the resolution if it exists
        if (_targetState == DisputeState.Resolved || _targetState == DisputeState.Decided) {
            _dispute.buyerPercent = _buyerPercent;
        }

        // Release the funds
        releaseFunds(_exchangeId);
    }

    /**
     * @notice Gets the details about a given dispute.
     *
     * @param _exchangeId - the id of the associated exchange
     * @return exists - true if the dispute exists
     * @return dispute - the dispute details. See {BosonTypes.Dispute}
     * @return disputeDates - the dispute dates details {BosonTypes.DisputeDates}
     */
    function getDispute(
        uint256 _exchangeId
    ) external view override returns (bool exists, Dispute memory dispute, DisputeDates memory disputeDates) {
        return fetchDispute(_exchangeId);
    }

    /**
     * @notice Gets the state of a given dispute.
     *
     * @param _exchangeId - the id of the associated exchange
     * @return exists - true if the dispute exists
     * @return state - the dispute state. See {BosonTypes.DisputeState}
     */
    function getDisputeState(uint256 _exchangeId) external view override returns (bool exists, DisputeState state) {
        Dispute storage dispute;
        (exists, dispute, ) = fetchDispute(_exchangeId);
        if (exists) state = dispute.state;
    }

    /**
     * @notice Gets the timeout of a given dispute.
     *
     * @param _exchangeId - the id of the associated exchange
     * @return exists - true if the dispute exists
     * @return timeout - the end of resolution period
     */
    function getDisputeTimeout(uint256 _exchangeId) external view override returns (bool exists, uint256 timeout) {
        DisputeDates storage disputeDates;
        (exists, , disputeDates) = fetchDispute(_exchangeId);
        if (exists) timeout = disputeDates.timeout;
    }

    /**
     * @notice Checks if the given dispute is in a Finalized state.
     *
     * Returns true if
     * - Dispute state is Retracted, Resolved, Decided or Refused
     *
     * @param _exchangeId - the id of the associated exchange
     * @return exists - true if the dispute exists
     * @return isFinalized - true if the dispute is finalized
     */
    function isDisputeFinalized(uint256 _exchangeId) external view override returns (bool exists, bool isFinalized) {
        Dispute storage dispute;

        // Get the dispute
        (exists, dispute, ) = fetchDispute(_exchangeId);

        // if exists, set isFinalized to true if state is a valid finalized state
        if (exists) {
            // Check for finalized dispute state
            isFinalized = (dispute.state == DisputeState.Retracted ||
                dispute.state == DisputeState.Resolved ||
                dispute.state == DisputeState.Decided ||
                dispute.state == DisputeState.Refused);
        }
    }

    /**
     * @notice Validates that exchange and dispute are in the correct state and that the caller is the dispute resolver for this dispute.
     *
     * Reverts if:
     * - Exchange does not exist
     * - Exchange is not in a Disputed state
     * - Dispute is in some state other than Escalated
     * - Dispute escalation response period has elapsed
     * - Caller is not the dispute resolver for this dispute
     *
     * @param _exchangeId - the id of the associated exchange
     */
    function disputeResolverChecks(
        uint256 _exchangeId
    ) internal view returns (Exchange storage exchange, Dispute storage dispute, DisputeDates storage disputeDates) {
        // Get the exchange, should be in disputed state
        (exchange, ) = getValidExchange(_exchangeId, ExchangeState.Disputed);

        // Fetch the dispute and dispute dates
        (, dispute, disputeDates) = fetchDispute(_exchangeId);

        // Make sure the dispute is in the escalated state
        if (dispute.state != DisputeState.Escalated) revert InvalidState();

        // Make sure the dispute escalation period not expired already
        if (block.timestamp > disputeDates.timeout) revert DisputeHasExpired();

        // Fetch the offer to get the info who the seller is
        (, Offer storage offer) = fetchOffer(exchange.offerId);

        // get dispute resolver id to check if caller is the dispute resolver
        uint256 disputeResolverId = protocolLookups().disputeResolverIdByAssistant[_msgSender()];
        if (disputeResolverId != fetchDisputeResolutionTerms(offer.id).disputeResolverId)
            revert NotDisputeResolverAssistant();
    }

    /**
     * @notice Returns hashed resolution information. Needed for the verfication in resolveDispute.
     *
     * @param _exchangeId - the id of the associated exchange
     * @param _buyerPercent - percentage of the pot that goes to the buyer
     */
    function hashResolution(uint256 _exchangeId, uint256 _buyerPercent) internal pure returns (bytes32) {
        return keccak256(abi.encode(RESOLUTION_TYPEHASH, _exchangeId, _buyerPercent));
    }
}
