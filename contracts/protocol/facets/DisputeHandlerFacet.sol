// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import {IBosonDisputeHandler} from "../../interfaces/handlers/IBosonDisputeHandler.sol";
import {DiamondLib} from "../../diamond/DiamondLib.sol";
import {ProtocolBase} from "../bases/ProtocolBase.sol";
import {FundsLib} from "../libs/FundsLib.sol";
import {EIP712Lib} from "../libs/EIP712Lib.sol";

/**
 * @title DisputeHandlerFacet
 *
 * @notice Handles disputes associated with exchanges within the protocol
 */
contract DisputeHandlerFacet is IBosonDisputeHandler, ProtocolBase {
    bytes32 private constant RESOLUTION_TYPEHASH = keccak256(bytes("Resolution(uint256 exchangeId,uint256 buyerPercent)")); // needed for verification during the resolveDispute

    /**
     * @notice Facet Initializer
     */
    function initialize()
    public
    onlyUnInitialized(type(IBosonDisputeHandler).interfaceId)
    {
        DiamondLib.addSupportedInterface(type(IBosonDisputeHandler).interfaceId);
    }

    /**
     * @notice Raise a dispute
     *
     * Emits an DisputeRaised event if successful.
     *
     * Reverts if:
     * - caller does not hold a voucher for the given exchange id
     * - exchange does not exist
     * - exchange is not in a redeemed state
     * - the complaint is blank
     *
     * @param _exchangeId - the id of the associated exchange
     * @param _complaint - the buyer's complaint description
     */
    function raiseDispute(
        uint256 _exchangeId,
        string calldata _complaint
    )
    external
    override
    {
        // Buyer must provide a reason to dispute
        require(bytes(_complaint).length > 0, COMPLAINT_MISSING);

        // Get the exchange, should be in redeemed state
        Exchange storage exchange = getValidExchange(_exchangeId, ExchangeState.Redeemed);

        // Make sure the caller is buyer associated with the exchange
        checkBuyer(exchange.buyerId);

        // Set the exhange state to disputed
        exchange.state = ExchangeState.Disputed;

        // Fetch the dispute
        (, Dispute storage dispute) = fetchDispute(_exchangeId);

        // Set the initial values
        dispute.exchangeId = _exchangeId;
        dispute.complaint = _complaint;
        dispute.state = DisputeState.Resolving;

        // Fetch the disputeDates
        (, DisputeDates storage disputeDates) = fetchDisputeDates(_exchangeId);
        disputeDates.disputed = block.timestamp;
        disputeDates.timeout = block.timestamp + fetchOfferDurations(exchange.offerId).disputeValid;
        
        // Get the offer, which will exist if the exchange does
        (, Offer storage offer) = fetchOffer(exchange.offerId);

        // Notify watchers of state change
        emit DisputeRaised(_exchangeId, exchange.buyerId, offer.sellerId, _complaint);
    }

    /**
     * @notice Retract the dispute and release the funds
     *
     * Emits an DisputeRetracted event if successful.
     *
     * Reverts if:
     * - exchange does not exist
     * - exchange is not in a disputed state
     * - caller is not the buyer for the given exchange id
     * - dispute is in some state other than resolving
     *
     * @param _exchangeId - the id of the associated exchange
     */
    function retractDispute(uint256 _exchangeId) external override {
        // Get the exchange, should be in dispute state
        Exchange storage exchange = getValidExchange(_exchangeId, ExchangeState.Disputed);

        // Make sure the caller is buyer associated with the exchange  // {MR: only by game}
        checkBuyer(exchange.buyerId);

        // Fetch the dispute
        (, Dispute storage dispute) = fetchDispute(_exchangeId);

        // Make sure the dispute is in the resolving or escalated state
        require(dispute.state == DisputeState.Resolving || dispute.state == DisputeState.Escalated, INVALID_STATE);

        // Finalize the dispute
        finalizeDispute(_exchangeId, exchange, dispute, DisputeState.Retracted, Resolution(0));

        // Notify watchers of state change
        emit DisputeRetracted(_exchangeId, msg.sender);
    }

    /**
     * @notice Expire the dispute and release the funds
     *
     * Emits an DisputeExpired event if successful.
     *
     * Reverts if:
     * - exchange does not exist
     * - exchange is not in a disputed state
     * - dispute is still valid
     * - dispute is in some state other than resolving
     *
     * @param _exchangeId - the id of the associated exchange
     */
    function expireDispute(uint256 _exchangeId) external override {
        // Get the exchange, should be in dispute state
        Exchange storage exchange = getValidExchange(_exchangeId, ExchangeState.Disputed);

        // make sure the dispute not expired already
        (, DisputeDates storage disputeDates) = fetchDisputeDates(_exchangeId);
        require(block.timestamp >= disputeDates.timeout, DISPUTE_STILL_VALID);

        // Fetch the dispute
        (, Dispute storage dispute) = fetchDispute(_exchangeId);

        // Make sure the dispute is in the resolving or escalated state
        require(dispute.state == DisputeState.Resolving, INVALID_STATE);

        // Finalize the dispute
        finalizeDispute(_exchangeId, exchange, dispute, DisputeState.Retracted, Resolution(0));

        // Notify watchers of state change
        emit DisputeExpired(_exchangeId, msg.sender);
    }

    /**
     * @notice Resolve a dispute by providing the information about the split. Callable by the buyer or seller, but they must provide the resolution signed by the other party
     *
     * Reverts if:
     * - specified buyer percent exceeds 100%
     * - dispute has expired
     * - exchange does not exist
     * - exchange is not in the disputed state
     * - callers is neither the seller or the buyer
     * - signature does not belong to the address of the other party
     * - dispute state is neither resolving or escalated
     *
     * @param _exchangeId  - exchange id to resolve dispute
     * @param _resolution - resolution struct with the information about the split.
     * @param _sigR - r part of the signer's signature.
     * @param _sigS - s part of the signer's signature.
     * @param _sigV - v part of the signer's signature.
     */
    function resolveDispute(uint256 _exchangeId, Resolution calldata _resolution, bytes32 _sigR,
        bytes32 _sigS,
        uint8 _sigV) external override {
        // buyer should get at most 100%
        require(_resolution.buyerPercent <= 10000, INVALID_BUYER_PERCENT);

        // Get the exchange, should be in dispute state
        Exchange storage exchange = getValidExchange(_exchangeId, ExchangeState.Disputed);

        // make sure the dispute not expired already
        (, DisputeDates storage disputeDates) = fetchDisputeDates(_exchangeId);
        require(block.timestamp <= disputeDates.timeout, DISPUTE_HAS_EXPIRED);

        // Fetch the offer to get the info who the seller is
        (, Offer storage offer) = fetchOffer(exchange.offerId);

        // get seller id to check if caller is the seller
        (bool exists, uint256 sellerId) = getSellerIdByOperator(msg.sender);     

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
            (exists, buyerId) = getBuyerIdByWallet(msg.sender);
            require(exists && buyerId == exchange.buyerId, NOT_BUYER_OR_SELLER);
            
            // caller is the buyer
            // get the seller's address, which should be the signer of the resolution         
            (, Seller storage seller) = fetchSeller(offer.sellerId);
            expectedSigner = seller.operator;
        }

        // verify that the signature belongs to the expectedSigner
        require(EIP712Lib.verify(expectedSigner, hashResolution(_exchangeId, _resolution), _sigR, _sigS, _sigV), SIGNER_AND_SIGNATURE_DO_NOT_MATCH);

        // Fetch the dispute
        (, Dispute storage dispute) = fetchDispute(_exchangeId);

        // Make sure the dispute is in the resolving or escalated state
        require(dispute.state == DisputeState.Resolving || dispute.state == DisputeState.Escalated, INVALID_STATE);

        // finalize the dispute
        finalizeDispute(_exchangeId, exchange, dispute, DisputeState.Resolved, _resolution);

        // Notify watchers of state change
        emit DisputeResolved(_exchangeId, _resolution, msg.sender);
    }

    /**
     * @notice Transition dispute to a "finalized" state
     *
     * Target state must be Retracted, Resolved, or Decided.
     * Sets finalized date for exchange and dispute, store the resolution if exists and releases the funds
     *
     * Reverts if the current dispute state is not resolving or escalated.
     *
     * @param _exchangeId  - exchange id to resolve dispute
     * @param _exchange - pointer to exchange storage slot
     * @param _targetState - target final state
     * @param _resolution - resolution struct with the information about the split.
     */
    function finalizeDispute(uint256 _exchangeId, Exchange storage _exchange, Dispute storage _dispute, DisputeState _targetState, Resolution memory _resolution) internal {
        // update dispute and exchange
        (, DisputeDates storage disputeDates) = fetchDisputeDates(_exchangeId);
        disputeDates.finalized = block.timestamp;
        _dispute.state = _targetState;
        _exchange.finalizedDate = block.timestamp;

        // store the resolution if it exists
        if (_targetState == DisputeState.Resolved) {
            _dispute.resolution = _resolution;
        }

        // Release the funds
        FundsLib.releaseFunds(_exchangeId);
    }

    /**
     * @notice Returns hashed resolution information. Needed for the verfication in resolveDispute.
     *
     * @param _exchangeId - if of the exchange for which dispute was resolved
     * @param _resolution - resolution struct with the information about the split
     */
    function hashResolution(uint256 _exchangeId, Resolution calldata _resolution) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    RESOLUTION_TYPEHASH,
                    _exchangeId,
                    _resolution.buyerPercent
                )
            );
    }

    /**
     * @notice Gets the details about a given dispute.
     *
     * @param _exchangeId - the id of the exchange to check
     * @return exists - true if the dispute exists
     * @return dispute - the dispute details. See {BosonTypes.Dispute}
     * @return disputeDates - the dispute dates details {BosonTypes.DisputeDates}
     */
    function getDispute(uint256 _exchangeId)
    external
    view
    override
    returns(bool exists, Dispute memory dispute, DisputeDates memory disputeDates) {
        (exists, dispute) = fetchDispute(_exchangeId);
        if (exists) {
            (, disputeDates) = fetchDisputeDates(_exchangeId);
        }
    }

    /**
     * @notice Gets the state of a given dispute.
     *
     * @param _exchangeId - the id of the exchange to check
     * @return exists - true if the dispute exists
     * @return state - the dispute state. See {BosonTypes.DisputeState}
     */
    function getDisputeState(uint256 _exchangeId)
    external
    view
    override
    returns(bool exists, DisputeState state) {
        Dispute storage dispute;
        (exists, dispute) = fetchDispute(_exchangeId);
        if (exists) state = dispute.state;
    }

    /**
     * @notice Is the given dispute in a finalized state?
     *
     * Returns true if
     * - Dispute state is Retracted, Resolved, or Decided
     *
     * @param _exchangeId - the id of the exchange to check
     * @return exists - true if the dispute exists
     * @return isFinalized - true if the dispute is finalized
     */
    function isDisputeFinalized(uint256 _exchangeId)
    external
    view
    override
    returns(bool exists, bool isFinalized) {
        Dispute storage dispute;

        // Get the dispute
        (exists, dispute) = fetchDispute(_exchangeId);

        // if exists, set isFinalized to true if state is a valid finalized state
        if (exists) {
            // Check for finalized dispute state
            isFinalized = (
                dispute.state == DisputeState.Retracted ||
                dispute.state == DisputeState.Resolved ||
                dispute.state == DisputeState.Decided
            );
        }
    }
}