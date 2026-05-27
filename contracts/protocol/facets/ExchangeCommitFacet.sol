// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.35;

import "../../domain/BosonConstants.sol";
import { BosonErrors } from "../../domain/BosonErrors.sol";
import { IBosonExchangeCommitHandler } from "../../interfaces/handlers/IBosonExchangeCommitHandler.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { ExchangeCommitBase } from "../bases/ExchangeCommitBase.sol";
import { DisputeBase } from "../bases/DisputeBase.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";
import { Address } from "@openzeppelin/contracts/utils/Address.sol";

/**
 * @title ExchangeCommitFacet
 *
 * @notice Handles exchange commitment and creation within the protocol.
 * This facet contains all functions related to committing to offers and creating new exchanges,
 * including buyer-initiated offers where sellers commit to buyer-created offers.
 */
contract ExchangeCommitFacet is ExchangeCommitBase, DisputeBase, IBosonExchangeCommitHandler {
    using Address for address;
    using Address for address payable;

    /**
     * @notice Initializes facet.
     * This function is callable only once.
     */
    function initialize() public onlyUninitialized(type(IBosonExchangeCommitHandler).interfaceId) {
        DiamondLib.addSupportedInterface(type(IBosonExchangeCommitHandler).interfaceId);
    }

    /**
     * @notice Commits to a seller-created price static offer (first step of an exchange).
     *
     * Emits a BuyerCommitted  event if successful.
     * Issues a voucher to the buyer address.
     *
     * Reverts if:
     * - The exchanges region of protocol is paused
     * - The buyers region of protocol is paused
     * - The sellers region of protocol is paused
     * - OfferId is invalid
     * - Offer price type is not static
     * - Offer has been voided
     * - Offer has expired
     * - Offer is not yet available for commits
     * - Offer's quantity available is zero
     * - Committer address is zero
     * - Committer is not a buyer account when committing to seller-created offer
     * - Committer is not a seller assistant when committing to buyer-created offer
     * - Offer exchange token is in native token and caller does not send enough
     * - Offer exchange token is in some ERC20 token and caller also sends native currency
     * - Contract at token address does not support ERC20 function transferFrom
     * - Calling transferFrom on token fails for some reason (e.g. protocol is not approved to transfer)
     * - Received ERC20 token amount differs from the expected value
     * - For seller-created offers: Buyer has less funds available than offer price
     * - For buyer-created offers: Seller has less funds available than seller deposit
     * - Offer belongs to a group with a condition
     *
     * @param _committer - the seller's or the buyer's address. The caller can commit on behalf of a buyer or a seller.
     * @param _offerId - the id of the offer to commit to
     */
    function commitToOffer(
        address payable _committer,
        uint256 _offerId
    ) external payable override exchangesNotPaused buyersNotPaused sellersNotPaused nonReentrant {
        commitToOfferUnguarded(_committer, _offerId);
    }

    /**
     * @notice Commits to a buyer-created static offer with seller-specific parameters (first step of an exchange).
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
     * - Offer price type is not static
     * - Offer has been voided
     * - Offer has expired
     * - Offer is not yet available for commits
     * - Offer's quantity available is zero
     * - Committer address is zero
     * - Committer is not a seller assistant
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
     * - Seller has less funds available than seller deposit
     * - Buyer has less funds available than offer price
     * - Offer belongs to a group with a condition
     * - The mutualizer contract does not implement the IDRFeeMutualizer interface
     *
     * @param _offerId - the id of the offer to commit to
     * @param _sellerParams - the seller-specific parameters (collection index, royalty info, mutualizer address)
     */
    function commitToBuyerOffer(
        uint256 _offerId,
        SellerOfferParams calldata _sellerParams
    ) external payable override exchangesNotPaused buyersNotPaused sellersNotPaused nonReentrant {
        commitToBuyerOfferUnguarded(_offerId, _sellerParams);
    }

    /**
     * @notice Commits to an conditional offer (first step of an exchange).
     *
     * Emits BuyerCommitted and ConditionalCommitAuthorized events if successful.
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
     * @param _committer - the seller's or the buyer's address. The caller can commit on behalf of a buyer or a seller.
     * @param _offerId - the id of the offer to commit to
     * @param _tokenId - the id of the token to use for the conditional commit
     */
    function commitToConditionalOffer(
        address payable _committer,
        uint256 _offerId,
        uint256 _tokenId
    ) external payable override exchangesNotPaused buyersNotPaused nonReentrant {
        commitToConditionalOfferUnguarded(_committer, _offerId, _tokenId);
    }

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
     * @param _offerCreator - the address of the offer creator
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
    ) external payable override exchangesNotPaused buyersNotPaused sellersNotPaused nonReentrant {
        if (
            _fullOffer.offer.creator == BosonTypes.OfferCreator.Seller &&
            (_sellerParams.collectionIndex != 0 ||
                _sellerParams.royaltyInfo.recipients.length != 0 ||
                _sellerParams.royaltyInfo.bps.length != 0 ||
                _sellerParams.mutualizerAddress != address(0))
        ) revert SellerParametersNotAllowed();

        uint256 offerId = prepareOfferForCommit(_fullOffer, _offerCreator, _signature);

        if (_fullOffer.condition.method != BosonTypes.EvaluationMethod.None) {
            if (_fullOffer.offer.creator == BosonTypes.OfferCreator.Buyer) {
                addSellerParametersToBuyerOffer(_committer, offerId, _sellerParams);
            }

            commitToConditionalOfferUnguarded(_committer, offerId, _conditionalTokenId);
        } else {
            if (_fullOffer.offer.creator == BosonTypes.OfferCreator.Buyer) {
                commitToBuyerOfferUnguarded(offerId, _sellerParams);
            } else {
                commitToOfferUnguarded(_committer, offerId);
            }
        }
    }

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
     * N.B. This method is not protected with reentrancy guard, since it clashes with price discovery flows.
     * Given that it does not rely on _msgSender() for authentication and it does not modify it, it is safe to leave it unprotected.
     * In case of reentrancy the only inconvenience that could happen is that `executedBy` field in `BuyerCommitted` event would not be set correctly.
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
    ) external override buyersNotPaused exchangesNotPaused returns (bool committed) {
        // Cache protocol status for reference
        ProtocolLib.ProtocolStatus storage ps = protocolStatus();

        // Derive the offer id
        uint256 offerId = _tokenId >> 128;

        // Derive the exchange id
        uint256 exchangeId = _tokenId & type(uint128).max;

        // Get the offer
        Offer storage offer = getValidOffer(offerId);

        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();
        address bosonVoucher = getCloneAddress(lookups, offer.sellerId, offer.collectionIndex);

        // Make sure that the voucher was issued on the clone that is making a call
        if (msg.sender != bosonVoucher) revert AccessDenied();

        (bool conditionExists, uint256 groupId) = getGroupIdByOffer(offerId);

        if (conditionExists) {
            // Get the condition
            Condition storage condition = fetchCondition(groupId);
            EvaluationMethod method = condition.method;

            if (method != EvaluationMethod.None) {
                uint256 tokenId = 0;

                // Allow commiting only to unambigous conditions, i.e. conditions with a single token id
                if (method == EvaluationMethod.SpecificToken || condition.tokenType == TokenType.MultiToken) {
                    uint256 minTokenId = condition.minTokenId;
                    uint256 maxTokenId = condition.maxTokenId;

                    if (minTokenId != maxTokenId && maxTokenId != 0) revert CannotCommit(); // legacy conditions have maxTokenId == 0

                    // Uses token id from the condition
                    tokenId = minTokenId;
                }

                authorizeCommit(_to, condition, groupId, tokenId, offerId);

                // Store the condition to be returned afterward on getReceipt function
                lookups.exchangeCondition[exchangeId] = condition;
            }
        }

        if (offer.priceType == PriceType.Discovery) {
            //  transaction start from `commitToPriceDiscoveryOffer`, should commit
            if (ps.incomingVoucherCloneAddress != address(0)) {
                // During price discovery, the voucher is firs transferred to the protocol, which should
                // not result in a commit yet. The commit should happen when the voucher is transferred
                // from the protocol to the buyer.
                if (_to == protocolAddresses().priceDiscovery) {
                    // Avoid reentrancy
                    if (ps.incomingVoucherId != 0) revert IncomingVoucherAlreadySet();

                    // Store the information about incoming voucher
                    ps.incomingVoucherId = _tokenId;
                } else {
                    if (ps.incomingVoucherId == 0) {
                        // Happens in wrapped voucher vase
                        ps.incomingVoucherId = _tokenId;
                    } else {
                        // In other cases voucher was already once transferred to the protocol,
                        // so ps.incomingVoucherId is set already. The incoming _tokenId must match.
                        if (ps.incomingVoucherId != _tokenId) revert TokenIdMismatch();
                    }
                    // No need to setup reentrancy guard, since this line is reached only if `commitToPriceDiscoveryOffer` was called first
                    // and reentrancy guard was setup there already.
                    commitToOfferInternal(_to, offer, exchangeId, true, false);
                    committed = true;
                }

                return committed;
            }

            // If `onPremintedVoucherTransferred` is invoked without `commitToPriceDiscoveryOffer` first,
            // we reach this point. This can happen in the following scenarios:
            // 1. The preminted voucher owner is transferring the voucher to PD contract ["deposit"]
            // 2. The PD is transferring the voucher back to the original owner ["withdraw"]. Happens if voucher was not sold.
            // 3. The PD is transferring the voucher to the buyer ["buy"]. Happens if voucher was sold.
            // 4. The preminted voucher owner is transferring the voucher "directly" to the buyer.

            // 1. and 2. are allowed, while 3. and 4. and must revert. 3. and 4. should be executed via `commitToPriceDiscoveryOffer`
            if (_from == _rangeOwner) {
                // case 1. ["deposit"]
                // Prevent direct transfer to EOA (case 4.)
                if (!_to.isContract()) revert VoucherTransferNotAllowed();
            } else {
                // Case 2. ["withdraw"]
                // Prevent transfer to the buyer (case 3.)
                if (_to != _rangeOwner) revert VoucherTransferNotAllowed();
            }
        } else if (offer.priceType == PriceType.Static) {
            // If price type is static, transaction can start from anywhere
            // Setup reentrancy guard to enable only 1 commit at a time
            if (ps.reentrancyStatus == ENTERED) revert BosonErrors.ReentrancyGuard();
            ps.reentrancyStatus = ENTERED; // avoid reentrancy

            commitToOfferInternal(_to, offer, exchangeId, true, false);

            ps.reentrancyStatus = NOT_ENTERED;
            committed = true;
        }
    }

    /**
     * @notice Tells if buyer is elligible to commit to conditional offer
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
    ) external view override returns (bool isEligible, uint256 commitCount, uint256 maxCommits) {
        Offer storage offer = getValidOffer(_offerId);

        (bool exists, uint256 groupId) = getGroupIdByOffer(offer.id);
        if (exists) {
            // Get the condition
            Condition storage condition = fetchCondition(groupId);
            if (condition.method == EvaluationMethod.None) return (true, 0, 0);

            // Make sure the tokenId is in range
            validateConditionRange(condition, _tokenId);

            // Cache protocol lookups for reference
            ProtocolLib.ProtocolLookups storage lookups = protocolLookups();

            mapping(uint256 => uint256) storage conditionalCommits = condition.gating == GatingType.PerTokenId
                ? lookups.conditionalCommitsByTokenId[_tokenId]
                : lookups.conditionalCommitsByAddress[_buyer];

            // How many times has been committed to offers in the group?
            commitCount = conditionalCommits[groupId];
            maxCommits = condition.maxCommits;

            if (commitCount >= maxCommits) return (false, commitCount, maxCommits);

            isEligible = condition.method == EvaluationMethod.Threshold
                ? holdsThreshold(_buyer, condition, _tokenId)
                : holdsSpecificToken(_buyer, condition, _tokenId);

            return (isEligible, commitCount, maxCommits);
        }

        return (true, 0, 0);
    }

    /**
     * @notice An unguarded version of commitToOffer.
     *
     * @param _committer - the seller's or the buyer's address. The caller can commit on behalf of a buyer or a seller.
     * @param _offerId - the id of the offer to commit to
     */
    function commitToOfferUnguarded(address payable _committer, uint256 _offerId) internal {
        // Make sure committer address is not zero address
        if (_committer == address(0)) revert InvalidAddress();

        commitToStaticOfferShared(_committer, _offerId, false);
    }

    /**
     * @notice An unguarded version of commitToBuyerOffer.
     *
     * @param _offerId - the id of the offer to commit to
     * @param _sellerParams - the seller-specific parameters (collection index, royalty info, mutualizer address)
     */
    function commitToBuyerOfferUnguarded(uint256 _offerId, SellerOfferParams calldata _sellerParams) internal {
        address committer = _msgSender();

        Offer storage offer = addSellerParametersToBuyerOffer(committer, _offerId, _sellerParams);

        commitToOfferInternal(payable(committer), offer, 0, false, false);
    }

    /**
     * @notice An unguarded version of commitToConditionalOffer.
     *
     * @param _committer - the seller's or the buyer's address. The caller can commit on behalf of a buyer or a seller.
     * @param _offerId - the id of the offer to commit to
     * @param _tokenId - the id of the token to use for the conditional commit
     */
    function commitToConditionalOfferUnguarded(
        address payable _committer,
        uint256 _offerId,
        uint256 _tokenId
    ) internal {
        // Make sure committer address is not zero address
        if (_committer == address(0)) revert InvalidAddress();

        commitToConditionalOfferShared(_committer, _offerId, _tokenId, true, false);
    }
}
