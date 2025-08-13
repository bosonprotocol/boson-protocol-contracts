// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import { IBosonExchangeHandler } from "../../interfaces/handlers/IBosonExchangeHandler.sol";
import { IBosonExchangeCommitHandler } from "../../interfaces/handlers/IBosonExchangeCommitHandler.sol";
import { IBosonOfferHandler } from "../../interfaces/handlers/IBosonOfferHandler.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { BosonTypes } from "../../domain/BosonTypes.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ERC721 } from "./../support/ERC721.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title SnapshotGate
 * @notice Gates Boson Protocol offers with a snapshot of ERC1155 holders.
 *
 * Features:
 * - Maintains a single snapshot, allowing batch append by contract owner until snapshot is frozen.
 * - Self-mints a custodial ERC-721 token for every unique ERC-1155 token id found in the snapshot.
 * - Once a snapshot is frozen, proxies buyer "commit to offer" protocol requests, tracking their commits.
 * - Upon a successful commit, the holder's snapshot token is considered "used".
 * - Once a snapshot holder's balance for a token has been used, they cannot commit to offers gated by that token id again.
 *
 * Out-of-band setup:
 * - Interrogate an ERC-1155, possibly on another chain, noting each token, its holders, and their balances
 * - Call the appendToSnapshot function, uploading an array of Holder structs.
 * - NOTE: You may not be able to upload the entire snapshot in a single transaction.
 * - Once a snapshot has been uploaded via one or more calls to appendToSnapshot,
 *   this contract will hold tokens it self-minted, which will be used to gate the offer.
 * - Create Offers to be gated on the protocol
 *   - The qty available for an offer should match the supply of its corresponding snapshot token
 * - Create Groups on the protocol which
 *   - wrap their corresponding offers
 *   - have a condition that
 *     - expects a specific token (ERC721)
 *     - uses this contract address as the token address
 *     - uses the appropriate snapshot token id for the gated offer
 *     - has maxCommits setting that matches the supply of its corresponding snapshot token
 */
contract SnapshotGate is BosonTypes, Ownable, ERC721 {
    // Event emitted when the snapshot is appended to
    event SnapshotAppended(Holder[] holders, address executedBy);

    // Event emitted when the snapshot is frozen
    event SnapshotFrozen(address executedBy);

    // Event emitted when a buyer commits via this gate
    event SnapshotTokenCommitted(
        address indexed buyer,
        uint256 indexed offerId,
        uint256 indexed tokenId,
        address executedBy
    );

    // Token holders and their amounts
    struct Holder {
        uint256 tokenId;
        uint256 amount;
        address owner;
    }

    // Transactional state
    enum TransactionStatus {
        NotInTransaction,
        InTransaction
    }

    // Details of in-flight transaction
    struct TransactionDetails {
        address buyer;
        uint256 tokenId;
    }

    // Transaction status
    TransactionStatus private txStatus;

    // When txStatus is InTransaction,
    // This is the transaction details
    TransactionDetails private txDetails;

    // Address of the Boson Protocol
    address public immutable protocol;

    // Id of the seller operating the snapshot
    uint256 public immutable sellerId;

    // Is the snapshot frozen
    bool public snapshotFrozen;

    // Track holders in snapshot
    // token id => owner => total owned
    mapping(uint256 => mapping(address => uint256)) private snapshot;

    // Track committed tokens
    // token id => owner => total committed
    mapping(uint256 => mapping(address => uint256)) private committed;

    // Modifier to check whether a gate transaction is in progress
    modifier statusCheck() {
        txStatus = TransactionStatus.InTransaction;
        _;
        txStatus = TransactionStatus.NotInTransaction;
    }

    // Add safeTransferFrom to IERC20
    using SafeERC20 for IERC20;

    /**
     * @notice Constructor
     *
     * @param _name The name of the ERC721 contract.
     * @param _symbol The symbol of the ERC721 contract.
     * @param _protocol The address of the protocol contract.
     * @param _sellerId The sellerId associated with the ERC721 contract.
     */
    constructor(
        string memory _name,
        string memory _symbol,
        address _protocol,
        uint256 _sellerId
    ) ERC721(_name, _symbol) {
        require(_protocol != address(0), "Protocol can't be zero address");
        protocol = _protocol;
        sellerId = _sellerId;
        txStatus = TransactionStatus.NotInTransaction;
    }

    /**
     * @notice Appends a batch of holders to the snapshot.
     *
     * Emits a SnapshotAppended event
     *
     * Reverts if:
     * - Caller is not contract owner
     * - Snapshot is frozen
     *
     * @param _holders an array of Holder structs
     */
    function appendToSnapshot(Holder[] calldata _holders) public onlyOwner {
        require(!snapshotFrozen, "Cannot append to frozen snapshot");
        uint256 entriesLength = _holders.length;

        // Map all the holders, creating the conditional tokens along the way
        for (uint256 i = 0; i < entriesLength; ) {
            uint256 tokenId = _holders[i].tokenId;
            uint256 amount = _holders[i].amount;
            address owner = _holders[i].owner;

            // Store holder's amount of the current snapshot token in mapping
            snapshot[tokenId][owner] = amount;

            // If corresponding conditional token doesn't yet exist, mint it to custody of this contract
            if (!_exists(tokenId)) {
                _mint(address(this), tokenId);
            }

            unchecked {
                i++;
            }
        }

        // Notify watchers of state change
        emit SnapshotAppended(_holders, msg.sender);
    }

    /**
     * @notice Freezes the snapshot so that no more holders can be appended.
     *
     * Reverts if:
     * - Caller is not contract owner
     * - Snapshot is already frozen
     */
    function freezeSnapshot() external onlyOwner {
        // Make sure snapshot isn't frozen
        require(!snapshotFrozen, "Snapshot already frozen");

        // Freeze
        snapshotFrozen = true;

        // Notify watchers of state change
        emit SnapshotFrozen(msg.sender);
    }

    /**
     * @notice Commits to a gated offer on the Boson Protocol.
     *
     * Commit to the specified offer on behalf of the buyer,
     * first checking that the buyer is in the snapshot and
     * hasn't already used all their available commits.
     *
     * Payment must be arranged in the token specified by the
     * given offer.
     *
     * If price is set in the native token, e.g., MATIC on
     * Polygon, it should be sent to this method in msg.value.
     *
     * For all other tokens, advance approval should be done
     * to allow this contract to transfer the caller's tokens
     * up to the payment amount.
     *
     * Reverts if:
     * - Snapshot is not frozen
     * - Buyer doesn't have a balance of the given token in the snapshot
     * - Buyer's balance of the given token in the snapshot has been used
     * - Incorrect payment amount or transfer not approved
     * - Offer is from another seller
     * - The protocol reverts for any reason, including but not limited to:
     *   - Invalid offerId
     *   - Offer condition does not specify this contract as conditional token
     *   - Token id supplied to this method is not the id in the offer condition
     *   - Sold out - offer qty available did not match total supply of snapshot token
     *
     * @param _buyer the buyer address
     * @param _offerId the id of the offer to commit to
     * @param _tokenId the snapshot token the buyer is using for the commit
     */
    function commitToGatedOffer(
        address payable _buyer,
        uint256 _offerId,
        uint256 _tokenId
    ) external payable statusCheck {
        // Make sure snapshot is frozen
        require(snapshotFrozen, "Snapshot is not frozen");

        // Find out how many tokens the buyer had at time of snapshot
        uint256 owned = snapshot[_tokenId][_buyer];
        require(owned > 0, "Buyer held no balance of the given token id at time of snapshot");

        // Find out how many commits the buyer has done already
        uint256 used = committed[_tokenId][_buyer];
        require(owned > used, "Buyer's balance of the snapshot token id has been used");

        // Store the details of the transaction
        txDetails = TransactionDetails(_buyer, _tokenId);

        // Track the usage
        committed[_tokenId][_buyer] = ++used;

        // Get the offer
        bool exists;
        Offer memory offer;
        (exists, offer, , , , ) = IBosonOfferHandler(protocol).getOffer(_offerId);

        // Make sure the offer exists
        require(exists, "Invalid offer id");

        // Make sure the seller id matches
        require(offer.creatorId == sellerId, "Offer is from another seller"); // high risk!

        // Determine if offer is priced in native token or ERC20
        if (offer.exchangeToken == address(0)) {
            // Make sure the payment amount is correct
            require(msg.value == offer.price, "Incorrect payment amount");

            // Commit to the offer, passing the message value (native)
            IBosonExchangeCommitHandler(protocol).commitToConditionalOffer{ value: msg.value }(
                _buyer,
                _offerId,
                _tokenId
            );
        } else {
            // Transfer the price into custody of this contract and approve protocol to transfer
            transferFundsToGateAndApproveProtocol(offer.exchangeToken, offer.price);

            // Commit to the offer on behalf of the buyer
            IBosonExchangeCommitHandler(protocol).commitToConditionalOffer(_buyer, _offerId, _tokenId);
        }

        // Remove the transaction details
        delete txDetails;

        // Notify watchers of state change
        emit SnapshotTokenCommitted(_buyer, _offerId, _tokenId, msg.sender);
    }

    /**
     * @dev Prepares for payment in ERC20 before commit.
     *
     * N.B. Caller must have previously approved this contract to transfer the payment amount.
     *
     * Step 1 - Transfers funds into custody of this gate contract, verifying that transfer occurred
     * Step 2 - Approves protocol to transfer those tokens from this contract's custody
     *
     * Reverts if
     * - Full amount is not transferred to the gate
     * - Approval of protocol to transfer amount from gate fails
     */
    function transferFundsToGateAndApproveProtocol(address _tokenAddress, uint256 _amount) internal {
        if (_amount > 0) {
            // Check the allowance
            uint256 allowance = IERC20(_tokenAddress).allowance(msg.sender, address(this));
            require(allowance >= _amount, "Insufficient approval for payment transfer");

            // Balance before the transfer
            uint256 tokenBalanceBefore = IERC20(_tokenAddress).balanceOf(address(this));

            // Transfer ERC20 tokens from the caller
            IERC20(_tokenAddress).safeTransferFrom(msg.sender, address(this), _amount);

            // Balance after the transfer
            uint256 tokenBalanceAfter = IERC20(_tokenAddress).balanceOf(address(this));

            // Make sure that expected amount of tokens was transferred
            require(tokenBalanceAfter - tokenBalanceBefore == _amount, "Incorrect value received on transfer to gate");

            // Approve the protocol to transfer this _amount
            bool success = IERC20(_tokenAddress).approve(protocol, _amount);
            require(success, "Unable to approve protocol to transfer");
        }
    }

    /**
     * @notice Checks the owned and used amounts for a given holder and snapshot token id.
     *
     * @param _tokenId - the token id to inspect
     * @param _holder - the holder address to check the balance of
     * @return owned - the amount owned
     * @return used - the amount used so far
     */
    function checkSnapshot(uint256 _tokenId, address _holder) external view returns (uint256 owned, uint256 used) {
        owned = snapshot[_tokenId][_holder];
        used = committed[_tokenId][_holder];
    }

    /**
     * @dev Returns the owner of the specified token.
     *
     * Ultimately, this contract will always remain the owner of any tokens minted.
     *
     * However, in the one narrow use-case that the protocol is calling midway through
     * an in-flight commitToGated offer transaction, we want to report the buyer as
     * the token owner.
     *
     * This is similar to a "flash loan" that is paid back at the end of the transaction.
     * We have verified that the buyer has the right to commit to the offer, so we 'loan'
     * them the token for the duration of the transaction, so that they are able to commit.
     * Ownership reverts to this contract at the end of the transaction.
     *
     * Reverts if:
     * - TokenId does not exist
     * - A commitToGatedOffer transaction is in-flight and the tokenId does not match txDetails.tokenId
     *
     * @param tokenId - the id of the token to check
     * @return owner - the address of the owner
     */
    function ownerOf(uint256 tokenId) public view virtual override returns (address owner) {
        // Report actual token owner (always this contract) unless transaction is in-flight
        owner = super.ownerOf(tokenId);
        if (txStatus == TransactionStatus.InTransaction) {
            // Make sure the token id being queried is correct
            require(tokenId == txDetails.tokenId, "Condition specifies a different tokenId from the one given");
            // Report owner as stored buyer if in transaction
            owner = txDetails.buyer;
        }
    }
}
