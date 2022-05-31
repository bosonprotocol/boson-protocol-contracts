// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import {IBosonDisputeHandler} from "../../interfaces/handlers/IBosonDisputeHandler.sol";
import {DiamondLib} from "../../diamond/DiamondLib.sol";
import {ProtocolBase} from "../bases/ProtocolBase.sol";
import {ProtocolLib} from "../libs/ProtocolLib.sol";
import {FundsLib} from "../libs/FundsLib.sol";

/**
 * @title DisputeHandlerFacet
 *
 * @notice Handles disputes associated with exchanges within the protocol
 */
contract DisputeHandlerFacet is IBosonDisputeHandler, ProtocolBase {

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

        // Fetch the disputeDate
        mapping (DisputeDate => uint256) storage disputeDates = fetchDisputeDates(_exchangeId);
        disputeDates[DisputeDate.Disputed] = block.timestamp;
        // disputeDates[DisputeDate.Timeout] = block.timestamp + voucherValidDuration[exchange.offerId]; // TODO add calculation once disputeValidDuration is added
        
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

        // Make sure the dispute is in the resolving state
        require(dispute.state == DisputeState.Resolving || dispute.state == DisputeState.Escalated, INVALID_STATE);

        // update dispute and exchange
        fetchDisputeDates(_exchangeId)[DisputeDate.Finalized] = block.timestamp;
        dispute.state = DisputeState.Retracted;
        exchange.finalizedDate = block.timestamp;

        // Release the funds
        FundsLib.releaseFunds(_exchangeId);

        // Notify watchers of state change
        emit DisputeRetracted(_exchangeId, msg.sender);
    }

    /**
     * @notice Gets the details about a given dispute.
     *
     * @param _exchangeId - the id of the exchange to check
     * @return exists - true if the dispute exists
     * @return dispute - the dispute details. See {BosonTypes.Dispute}
     * @return disputeDatesList - list of dispute dates, ordered as {BosonTypes.DisputeDate}
     */
    function getDispute(uint256 _exchangeId)
    external
    view
    override
    returns(bool exists, Dispute memory dispute, uint256[] memory disputeDatesList) {
        (exists, dispute) = fetchDispute(_exchangeId);
        if (exists) {
            disputeDatesList = new uint256[](uint(type(DisputeDate).max)+1);
            mapping(DisputeDate => uint256) storage disputeDates = fetchDisputeDates(_exchangeId);
            for (uint i = 0; i <= uint(type(DisputeDate).max); i++) {
                disputeDatesList[i] = disputeDates[DisputeDate(i)];
            }
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