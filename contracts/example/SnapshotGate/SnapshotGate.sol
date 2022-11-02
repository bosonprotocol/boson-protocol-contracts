// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../../interfaces/handlers/IBosonExchangeHandler.sol";
import "./support/ERC721.sol";

/**
 * @title SnapshotGate
 * @notice Gate Boson Protocol offers with a snapshot of ERC1155 holders
 *
 * Features:
 * - Maintains one snapshot, allowing batch append until frozen
 * - Self-mints a ERC721 token for every unique ERC1155 token id found in the snapshot
 * - Commits on behalf of buyers represented in the snapshot, tracking their commits
 * - Upon a successful commit, the holder's snapshot token is considered 'used'
 * - Once a snapshot holder's balance for a token has been used, they cannot commit again
 *
 * Out-of-band setup:
 * - Interrogate an ERC-1155, possibly on another chain, noting each token, its holders, and their balances
 * - Call the appendToSnapshot function, uploading an array of Holder structs.
 * - NOTE: You may not be able to upload the entire snapshot in a single transaction.
 * - Once a snapshot has been uploaded via one or more calls to appendToSnapshot,
 *   this contract will hold tokens it self-minted, which will be used to gate the offer.
 * - Create Offers to be gated on the protocol
 *   - the qty available for an offer should match the supply of its corresponding snapshot token
 * - Create Groups on the protocol which
 *   - wrap their corresponding offers
 *   - have a condition that
 *     - expects a specific token (ERC721)
 *     - uses this contract address as the token address
 *     - uses the appropriate snapshot token id for the gated offer
 *     - has maxCommits setting that matches the supply of its corresponding snapshot token
 */
contract SnapshotGate is Ownable, ERC721 {
    // Event emitted when the snapshot is appended to
    event SnapshotAppended(Holder[] holders);

    // Event emitted when the snapshot is frozen
    event SnapshotFrozen();

    // Event emitted when a buyer commits via this gate
    event SnapshotTokenCommitted(address indexed buyer, uint256 indexed offerId, uint256 indexed tokenId);

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

    // Address of the Boson Protocol, cast to the exchange handler interface
    IBosonExchangeHandler protocol;

    // Is the snapshot frozen
    bool snapshotFrozen;

    // Track holders in snapshot
    // token id => owner => total owned
    mapping(uint256 => mapping(address => uint256)) snapshot;

    // Track committed tokens
    // token id => owner => total committed
    mapping(uint256 => mapping(address => uint256)) committed;

    // Modifier to check whether a gate transaction is in progress
    modifier statusCheck() {
        txStatus = TransactionStatus.InTransaction;
        _;
        txStatus = TransactionStatus.NotInTransaction;
    }

    // Constructor
    constructor(
        string memory _name,
        string memory _symbol,
        address _protocol
    ) ERC721(_name, _symbol) {
        protocol = IBosonExchangeHandler(_protocol);
        txStatus = TransactionStatus.NotInTransaction;
    }

    /**
     * Append a batch of holders to the snapshot
     *
     * Reverts if:
     * - Caller is not contract owner
     * - Snapshot is frozen
     *
     * @param _holders an array of Holder structs
     */
    function appendToSnapshot(Holder[] memory _holders) public onlyOwner {
        require(!snapshotFrozen, "Cannot append to frozen snapshot");
        uint256 entriesLength = _holders.length;

        // Map all the holders, creating the conditional tokens along the way
        for (uint256 i = 0; i < entriesLength; i++) {
            uint256 tokenId = _holders[i].tokenId;
            uint256 amount = _holders[i].amount;
            address owner = _holders[i].owner;

            // Store holder's amount of the current snapshot token in mapping
            snapshot[tokenId][owner] = amount;

            // If corresponding conditional token doesn't yet exist, mint it to custody of this contract
            if (!_exists(tokenId)) {
                _mint(address(this), tokenId);
            }
        }

        // Notify watchers of state change
        emit SnapshotAppended(_holders);
    }

    /**
     * @notice Freezes the snapshot so that no more holders can be appended
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
        emit SnapshotFrozen();
    }

    /**
     * @notice Commit to a gated offer on the Boson Protocol
     *
     * Commit to the specified offer on behalf of the buyer,
     * first checking that the buyer is in the snapshot and
     * hasn't already used all their available commits.
     *
     * Payment must be arranged it the token specified by the
     * given offer.
     *
     * If price is set in the native token, e.g., MATIC on
     * Polygon, it should be sent to this method in msg.value.
     *
     * For all other tokens, advance approval should be done
     * to allow the protocol to transfer the buyer's tokens to
     * accept payment.
     *
     * Reverts if:
     * - Snapshot is not frozen
     * - Buyer doesn't have a balance of the given token in the snapshot
     * - Buyer's balance of the given token in the snapshot has been used
     * - The protocol reverts for any reason, including but not limited to:
     *   - invalid offerId
     *   - insufficient payment or transfer not approved
     *   - offer condition does not specify this contract as conditional token
     *   - token id supplied to this method is not the id in the offer condition
     *   - sold out - offer qty available did not match total supply of snapshot token
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

        // Commit to the offer on behalf of the buyer
        protocol.commitToOffer{ value: msg.value }(_buyer, _offerId);

        // Remove the transaction details
        delete txDetails;

        // Notify watchers of state change
        emit SnapshotTokenCommitted(_buyer, _offerId, _tokenId);
    }

    /**
     * @notice Check the owned and used amounts for a given holder and snapshot token id
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
     * @dev Token owner is conditional
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
     * - tokenId does not exist
     * - a commitToGatedOffer transaction is in-flight and the tokenId does not match txDetails.tokenId
     *
     * @param tokenId - the id of the token to check
     * @return the address of the owner
     */
    function ownerOf(uint256 tokenId) public view virtual override returns (address) {
        // Make sure token exists
        require(_exists(tokenId), "ERC721: invalid token ID");

        // Determine who to report as the owner
        address owner = super.ownerOf(tokenId);
        if (txStatus == TransactionStatus.InTransaction) {
            // Make sure the token id being queried is correct
            require(tokenId == txDetails.tokenId);
            // Report owner as stored buyer if in transaction,
            owner = txDetails.buyer;
        } else {
            // When not in transaction, return actual owner
            // (which will always be this contract)
            owner = super.ownerOf(tokenId);
        }

        return owner;
    }
}
