// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import { BosonTypes } from "../../domain/BosonTypes.sol";
import { BosonErrors } from "../../domain/BosonErrors.sol";
import { IBosonExchangeEvents } from "../events/IBosonExchangeEvents.sol";
import { IBosonFundsBaseEvents } from "../events/IBosonFundsEvents.sol";

/**
 * @title IBosonExchangeCommitHandler
 *
 * @notice Handles exchange commitment and creation within the protocol.
 * This interface contains functions for committing to offers and creating new exchanges.
 *
 * The ERC-165 identifier for this interface is: 0x20807062
 */
interface IBosonExchangeCommitHandler is BosonErrors, IBosonExchangeEvents, IBosonFundsBaseEvents {
    /**
     * @notice Commits to a static offer (first step of an exchange).
     *
     * Emits a BuyerCommitted event if successful.
     * Issues a voucher to the buyer address.
     *
     * Reverts if:
     * - The exchanges region of protocol is paused
     * - The buyers region of protocol is paused
     * - The sellers region of protocol is paused
     * - OfferId is invalid
     * - Offer has been voided
     * - Offer has expired
     * - Offer is not yet available for commits
     * - Offer's quantity available is zero
     * - Buyer address is zero
     * - Buyer account is inactive
     * - Buyer is token-gated (conditional commit requirements not met or already used)
     * - Offer exchange token is in native token and caller does not send enough
     * - Offer exchange token is in some ERC20 token and caller also sends native currency
     * - Contract at token address does not support ERC20 function transferFrom
     * - Calling transferFrom on token fails for some reason (e.g. protocol is not approved to transfer)
     * - Received ERC20 token amount differs from the expected value
     * - Seller has less funds available than sellerDeposit if offer was created by the seller
     * - Buyer has less funds available than price if offer was created by the buyer
     *
     * @param _buyer - the buyer's address.
     * @param _offerId - the id of the offer to commit to
     */
    function commitToOffer(address payable _buyer, uint256 _offerId) external payable;

    /**
     * @notice Commits to buyer-created offer with seller-specific parameters.
     *
     * Emits a BuyerInitiatedOfferSetSellerParams event if successful.
     * Emits a SellerCommitted event if successful.
     * Issues a voucher to the buyer address.
     *
     * Reverts if:
     * - The exchanges region of protocol is paused
     * - The buyers region of protocol is paused
     * - The sellers region of protocol is paused
     * - OfferId is invalid
     * - Offer has been voided
     * - Offer has expired
     * - Offer is not yet available for commits
     * - Offer's quantity available is zero
     * - Msg.sender is not a seller assistant or not valid seller
     * - Offer is not buyer-created
     * - Collection index is invalid for the seller
     * - Royalty recipients are not on seller's whitelist
     * - Royalty percentages are below minimum requirements
     * - Total royalty percentage exceeds maximum allowed
     * - Offer exchange token is in native token and caller does not send enough
     * - Offer exchange token is in some ERC20 token and caller also sends native currency
     * - Contract at token address does not support ERC20 function transferFrom
     * - Calling transferFrom on token fails for some reason (e.g. protocol is not approved to transfer)
     * - Received ERC20 token amount differs from the expected value
     * - Seller has less funds available than sellerDeposit
     * - Buyer has less funds available than item price
     * - The mutualizer contract does not implement the IDRFeeMutualizer interface
     *
     * @param _offerId - the id of the offer to commit to
     * @param _sellerParams - the seller-specific parameters (collection index, royalty info, mutualizer address)
     */
    function commitToBuyerOffer(uint256 _offerId, BosonTypes.SellerOfferParams calldata _sellerParams) external payable;

    /**
     * @notice Commits to an conditional offer (first step of an exchange).
     *
     * Emits a BuyerCommitted event if successful.
     * Issues a voucher to the buyer address.
     *
     * Reverts if:
     * - The exchanges region of protocol is paused
     * - The buyers region of protocol is paused
     * - OfferId is invalid
     * - Offer has been voided
     * - Offer has expired
     * - Offer is not yet available for commits
     * - Offer's quantity available is zero
     * - Buyer address is zero
     * - Buyer account is inactive
     * - Conditional commit requirements not met or already used
     * - Offer price is in native token and caller does not send enough
     * - Offer price is in some ERC20 token and caller also sends native currency
     * - Contract at token address does not support ERC20 function transferFrom
     * - Calling transferFrom on token fails for some reason (e.g. protocol is not approved to transfer)
     * - Received ERC20 token amount differs from the expected value
     * - Seller has less funds available than sellerDeposit
     * - Condition has a range and the token id is not within the range
     *
     * @param _buyer - the buyer's address (caller can commit on behalf of a buyer)
     * @param _offerId - the id of the offer to commit to
     * @param _tokenId - the id of the token to use for the conditional commit
     */
    function commitToConditionalOffer(address payable _buyer, uint256 _offerId, uint256 _tokenId) external payable;

    /**
     * @notice Creates an offer and commits to it immediately.
     * The caller is the committer and must provide the offer creator's signature.
     *
     * Emits an OfferCreated, FundsEncumbered, BuyerCommitted and SellerCommitted event if successful.
     *
     * Reverts if:
     * - The offers region of protocol is paused
     * - Valid from date is greater than valid until date
     * - Valid until date is not in the future
     * - Both voucher expiration date and voucher expiration period are defined
     * - Neither of voucher expiration date and voucher expiration period are defined
     * - Voucher redeemable period is fixed, but it ends before it starts
     * - Voucher redeemable period is fixed, but it ends before offer expires
     * - Dispute period is less than minimum dispute period
     * - Resolution period is not between the minimum and the maximum resolution period
     * - Voided is set to true
     * - Available quantity is 0
     * - Dispute resolver wallet is not registered, except for absolute zero offers with unspecified dispute resolver
     * - Dispute resolver is not active, except for absolute zero offers with unspecified dispute resolver
     * - Seller is not on dispute resolver's seller allow list
     * - Dispute resolver does not accept fees in the exchange token
     * - Buyer cancel penalty is greater than price
     * - Collection does not exist
     * - When agent id is non zero and the agent does not exist
     * - If the sum of agent fee amount and protocol fee amount is greater than the offer fee limit determined by the protocol
     * - If the sum of agent fee amount and protocol fee amount is greater than fee limit set by seller
     * - Royalty recipient is not on seller's allow list
     * - Royalty percentage is less than the value decided by the admin
     * - Total royalty percentage is more than max royalty percentage
     * - Not enough funds can be encumbered
     * - The mutualizer contract does not implement the IDRFeeMutualizer interface
     * - Signature is invalid. Refer to EIP712Lib.verify for details
     *
     * @param _fullOffer - the fully populated struct containing offer, offer dates, offer durations, dispute resolution parameters, condition, agent id and fee limit
     * @param _offerCreator - the address of the other party
     * @param _committer - the address of the committer (buyer for seller-created offers, seller for buyer-created offers)
     * @param _signature - signature of the offer creator 
                           If the offer creator is ordinary EOA, it must be ECDSA signature in the format of concatenated r,s,v values. 
                           If the offer creator is a contract, it must be a valid ERC1271 signature.
                           If the offer creator is a EIP-7702 smart account, it can be either a valid ERC1271 signature or a valid ECDSA signature.
     * @param _conditionalTokenId - the token id to use for the conditional commit, if applicable
     * @param _sellerParams - the seller-specific parameters (collection index, royalty info, mutualizer address), if applicable
     */
    function createOfferAndCommit(
        BosonTypes.FullOffer calldata _fullOffer,
        address _offerCreator,
        address payable _committer,
        bytes calldata _signature,
        uint256 _conditionalTokenId,
        BosonTypes.SellerOfferParams calldata _sellerParams
    ) external payable;

    /**
     * @notice Handle pre-minted voucher transfer
     *
     * Reverts if:
     * - The exchanges region of protocol is paused
     * - The buyers region of protocol is paused
     * - Caller is not a clone address associated with the seller
     * - Incoming voucher clone address is not the caller
     * - Offer price is discovery, transaction is not starting from protocol nor seller is _from address
     * - Any reason that ExchangeHandler commitToOfferInternal reverts. See ExchangeHandler.commitToOfferInternal
     *
     * @param _tokenId - the voucher id
     * @param _to - the receiver address
     * @param _from - the address of current owner
     * @param _rangeOwner - the address of the preminted range owner
     * @return committed - true if the voucher was committed
     */
    function onPremintedVoucherTransferred(
        uint256 _tokenId,
        address payable _to,
        address _from,
        address _rangeOwner
    ) external returns (bool committed);

    /**
     * @notice Tells if buyer is elligible to commit to conditional
     * Returns the eligibility status, the number of used commits and the maximal number of commits to the conditional offer.
     *
     * Unconditional offers do not have maximal number of commits, so the returned value will always be 0.
     *
     * This method does not check if the timestamp is within the offer's validity period or if the quantity available is greater than 0.
     *
     * N.B. Unmined transaction might affect the eligibility status.
     *
     * Reverts if:
     * - The offer does not exist
     * - The offer is voided
     * - The external call to condition contract reverts
     *
     * @param _buyer buyer address
     * @param _offerId - the id of the offer
     * @param _tokenId - the id of conditional token
     * @return isEligible - true if buyer is eligible to commit
     * @return commitCount - the current number of commits to the conditional offer
     * @return maxCommits - the maximal number of commits to the conditional offer
     */
    function isEligibleToCommit(
        address _buyer,
        uint256 _offerId,
        uint256 _tokenId
    ) external view returns (bool isEligible, uint256 commitCount, uint256 maxCommits);
}
