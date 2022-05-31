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

        // Finalize the dispute
        finalizeDispute(_exchangeId, exchange, DisputeState.Retracted);

        // Notify watchers of state change
        emit DisputeRetracted(_exchangeId, msg.sender);
    }

    /**
     * @notice Resolve a dispute by providing the information about the split. Callable by the buyer or seller, but they must provide the resolution signed by the other party
     *
     * Reverts if:
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
        // make sure the dispute not expired already
        require(block.timestamp <= fetchDisputeDates(_exchangeId)[DisputeDate.Timeout], DISPUTE_HAS_EXPIRED);

        // Get the exchange, should be in dispute state
        Exchange storage exchange = getValidExchange(_exchangeId, ExchangeState.Disputed);

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
        require(verify(expectedSigner, hashResolution(_exchangeId, _resolution), _sigR, _sigS, _sigV), INVALID_SIGNATURE);

        // finalize the dispute
        finalizeDispute(_exchangeId, exchange, DisputeState.Resolved);

        // Notify watchers of state change
        emit DisputeResolved(_exchangeId, _resolution, msg.sender);
    }

    function finalizeDispute(uint256 _exchangeId, Exchange storage _exchange, DisputeState _targetState) internal {
         // Fetch the dispute
        (, Dispute storage dispute) = fetchDispute(_exchangeId);

        // Make sure the dispute is in the resolving or escalated state
        require(dispute.state == DisputeState.Resolving || dispute.state == DisputeState.Escalated, INVALID_STATE);

        // update dispute and exchange
        fetchDisputeDates(_exchangeId)[DisputeDate.Finalized] = block.timestamp;
        dispute.state = _targetState;
        _exchange.finalizedDate = block.timestamp;

        // Release the funds
        FundsLib.releaseFunds(_exchangeId);
    }

    bytes32 private constant RESOLUTION_TYPEHASH = keccak256(bytes("Resolution(uint256 exchangeId,uint256 buyerPercent)"));

    /**
     * @notice Returns hashed resolution information
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

    // TODO refactor this out and make shared library with metatransactions
    /**
     * @notice Recovers the Signer from the Signature components.
     *
     * Reverts if:
     * - signer is a zero address
     *
     * @param _user  - the sender of the transaction.
     * @param _hashedMetaTx - hashed meta transaction.
     * @param _sigR - r part of the signer's signature.
     * @param _sigS - s part of the signer's signature.
     * @param _sigV - v part of the signer's signature.
     */
    function verify(
        address _user,
        bytes32 _hashedMetaTx,
        bytes32 _sigR,
        bytes32 _sigS,
        uint8 _sigV
    ) internal view returns (bool) {
        address signer = ecrecover(toTypedMessageHash(_hashedMetaTx), _sigV, _sigR, _sigS);
        require(signer != address(0), INVALID_SIGNATURE);
        return signer == _user;
    }

    // TODO refactor this out and make shared library with metatransactions
    /**
     * @notice Get the domain separator.
     */
    function getDomainSeparator() private view returns (bytes32) {
        return protocolMetaTxInfo().domainSeparator;
    }

    // TODO refactor this out and make shared library with metatransactions
    /**
     * @dev Accept message hash and returns hash message in EIP712 compatible form
     * So that it can be used to recover signer from signature signed using EIP712 formatted data
     * https://eips.ethereum.org/EIPS/eip-712
     * "\\x19" makes the encoding deterministic
     * "\\x01" is the version byte to make it compatible to EIP-191
     *
     * @param _messageHash  - the message hash.
     */
    function toTypedMessageHash(bytes32 _messageHash) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", getDomainSeparator(), _messageHash));
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