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
 * The ERC-165 identifier for this interface is: 0xcdafde08
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
