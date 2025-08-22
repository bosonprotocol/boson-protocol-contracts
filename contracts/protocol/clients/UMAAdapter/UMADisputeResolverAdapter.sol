// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import { OptimisticOracleV3Interface } from "../../../interfaces/clients/OptimisticOracleV3Interface.sol";
import {
    OptimisticOracleV3CallbackRecipientInterface
} from "../../../interfaces/clients/OptimisticOracleV3CallbackRecipientInterface.sol";
import { IBosonDisputeResolverHandler } from "../../../interfaces/handlers/IBosonDisputeResolverHandler.sol";
import { IBosonDisputeHandler } from "../../../interfaces/handlers/IBosonDisputeHandler.sol";
import { IBosonExchangeHandler } from "../../../interfaces/handlers/IBosonExchangeHandler.sol";
import { IBosonOfferHandler } from "../../../interfaces/handlers/IBosonOfferHandler.sol";
import { BosonTypes } from "../../../domain/BosonTypes.sol";
import { BosonErrors } from "../../../domain/BosonErrors.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title UMADisputeResolverAdapter
 * @notice Adapter contract that integrates UMA's OptimisticOracleV3 as a dispute resolver for Boson Protocol
 * @dev This contract acts as a bridge between Boson Protocol's dispute resolution system and UMA's optimistic oracle.
 *      When disputes are escalated, they are submitted to UMA for decentralized resolution.
 */
contract UMADisputeResolverAdapter is
    OptimisticOracleV3CallbackRecipientInterface,
    Ownable,
    ReentrancyGuard,
    BosonErrors
{
    // State variables
    address public immutable BOSON_PROTOCOL;
    OptimisticOracleV3Interface public immutable UMA_ORACLE;
    // UMA's standard identifier for boolean assertions
    bytes32 public constant UMA_ASSERTION_IDENTIFIER = bytes32("ASSERT_TRUTH");

    uint256 public disputeResolverId;
    uint64 public challengePeriod;

    // Mapping from UMA assertion ID to Boson exchange ID
    mapping(bytes32 => uint256) public assertionToExchange;

    // Mapping from exchange ID to UMA assertion ID
    mapping(uint256 => bytes32) public exchangeToAssertion;

    // Mapping from assertion ID to proposed buyer percentage
    mapping(bytes32 => uint256) private assertionToBuyerPercent;

    // Events
    event DisputeEscalatedToUMA(uint256 indexed exchangeId, bytes32 indexed assertionId, address indexed asserter);
    event UMAAssertionResolved(bytes32 indexed assertionId, uint256 indexed exchangeId, bool assertedTruthfully);
    event DisputeResolverRegistered(uint256 indexed disputeResolverId);
    event DisputeContested(uint256 indexed exchangeId, bytes32 indexed assertionId, uint256 timestamp);

    // Custom errors
    error OnlyUMAOracle();
    error InvalidProtocolAddress();
    error InvalidUMAOracleAddress();
    error ExchangeNotEscalated();
    error AssertionNotFound();
    error DisputeNotEscalated();
    error InvalidExchangeId();
    error AssertionAlreadyExists();
    error NotRegistered();
    error AlreadyRegistered();
    error NotAssignedDisputeResolver();
    error InvalidDisputeResolverId();

    /**
     * @notice Constructor for UMADisputeResolverAdapter
     * @param _bosonProtocol Address of the Boson Protocol diamond
     * @param _umaOracle Address of UMA's OptimisticOracleV3
     * @param _challengePeriod Challenge period for UMA assertions in seconds
     * @dev Sets immutable contract references and initial configuration
     *
     * Reverts if:
     * - _bosonProtocol is zero address
     * - _umaOracle is zero address
     */
    constructor(address _bosonProtocol, address _umaOracle, uint64 _challengePeriod) {
        if (_bosonProtocol == address(0)) revert InvalidProtocolAddress();
        if (_umaOracle == address(0)) revert InvalidUMAOracleAddress();

        BOSON_PROTOCOL = _bosonProtocol;
        UMA_ORACLE = OptimisticOracleV3Interface(_umaOracle);
        challengePeriod = _challengePeriod;
    }

    /**
     * @notice Register the caller as a dispute resolver and configure this adapter to serve them
     * @param _treasury Treasury address for the dispute resolver
     * @param _metadataUri Metadata URI for the dispute resolver
     * @param _disputeResolverFees Array of fee structures
     * @param _sellerAllowList Array of seller IDs allowed to use this DR (empty = no restrictions)
     * @dev The caller becomes both admin and assistant for the dispute resolver to satisfy Boson's requirements.
     *      This adapter will then proxy dispute resolution calls for them.
     *
     * Emits:
     * - DisputeResolverRegistered event with the assigned dispute resolver ID
     *
     * Reverts if:
     * - Caller is not owner
     * - Contract is already registered
     * - Boson Protocol registration fails
     */
    function registerDisputeResolver(
        address payable _treasury,
        string memory _metadataUri,
        BosonTypes.DisputeResolverFee[] memory _disputeResolverFees,
        uint256[] memory _sellerAllowList
    ) external onlyOwner {
        if (disputeResolverId != 0) revert AlreadyRegistered();

        BosonTypes.DisputeResolver memory disputeResolver = BosonTypes.DisputeResolver({
            id: 0, // Will be set by the protocol
            escalationResponsePeriod: challengePeriod,
            assistant: address(this),
            admin: address(this),
            clerk: address(0), // Deprecated field
            treasury: _treasury,
            metadataUri: _metadataUri,
            active: true
        });

        IBosonDisputeResolverHandler(BOSON_PROTOCOL).createDisputeResolver(
            disputeResolver,
            _disputeResolverFees,
            _sellerAllowList
        );

        (, BosonTypes.DisputeResolver memory registeredDR, , ) = IBosonDisputeResolverHandler(BOSON_PROTOCOL)
            .getDisputeResolverByAddress(address(this));

        disputeResolverId = registeredDR.id;
        emit DisputeResolverRegistered(disputeResolverId);
    }

    /**
     * @notice Creates a UMA assertion for an escalated dispute (MVP: manual call by buyer)
     * @param _exchangeId The exchange ID of the escalated dispute
     * @param _buyerPercent The buyer's proposed percentage split (0-10000, where 10000 = 100%)
     * @param _additionalInfo Additional information to include in the claim
     * @dev Creates UMA assertion with structured claim data and stores state mappings for callback handling.
     *      Caller must approve this contract to spend the minimum bond amount for the exchange token.
     *
     * Emits:
     * - DisputeEscalatedToUMA event with exchange ID, assertion ID, and asserter address
     *
     * Reverts if:
     * - _buyerPercent > 10000
     * - Exchange does not exist
     * - Dispute is not in Escalated state
     * - This contract is not the assigned dispute resolver for the offer
     * - Assertion already exists for this exchange
     * - UMA bond transfer fails
     * - UMA assertion creation fails
     */
    function assertTruthForDispute(
        uint256 _exchangeId,
        uint256 _buyerPercent,
        string memory _additionalInfo
    ) external nonReentrant {
        if (_buyerPercent > 10000) revert InvalidBuyerPercent();

        // Verify the dispute is escalated in Boson Protocol
        (bool exists, BosonTypes.DisputeState state) = IBosonDisputeHandler(BOSON_PROTOCOL).getDisputeState(
            _exchangeId
        );
        if (!exists) revert InvalidExchangeId();
        if (state != BosonTypes.DisputeState.Escalated) revert DisputeNotEscalated();

        _validateAssignedDisputeResolver(_exchangeId);

        if (exchangeToAssertion[_exchangeId] != bytes32(0)) revert AssertionAlreadyExists();

        bytes32 assertionId = _createUMAAssertion(_exchangeId, _buyerPercent, _additionalInfo);

        assertionToExchange[assertionId] = _exchangeId;
        exchangeToAssertion[_exchangeId] = assertionId;
        assertionToBuyerPercent[assertionId] = _buyerPercent;

        emit DisputeEscalatedToUMA(_exchangeId, assertionId, msg.sender);
    }

    /**
     * @notice Callback from UMA when an assertion is resolved
     * @param assertionId The ID of the resolved assertion
     * @param assertedTruthfully Whether the assertion was deemed truthful
     * @dev Only callable by UMA Oracle. Automatically resolves Boson dispute based on UMA's decision.
     *      If assertedTruthfully=true, uses original buyer percentage. If false, buyer gets 0%.
     *      This contract must be registered as the dispute resolver assistant for this to work.
     *
     * Emits:
     * - UMAAssertionResolved event with assertion ID, exchange ID, and resolution result
     *
     * Reverts if:
     * - Caller is not UMA Oracle
     * - Assertion ID not found in mappings
     * - Boson dispute resolution fails
     */
    function assertionResolvedCallback(bytes32 assertionId, bool assertedTruthfully) external override {
        if (msg.sender != address(UMA_ORACLE)) revert OnlyUMAOracle();

        uint256 exchangeId = assertionToExchange[assertionId];
        if (exchangeId == 0) revert AssertionNotFound();

        // Get the proposed buyer percentage before cleanup
        uint256 proposedBuyerPercent = assertionToBuyerPercent[assertionId];

        // Clean up mappings
        delete assertionToExchange[assertionId];
        delete exchangeToAssertion[exchangeId];
        delete assertionToBuyerPercent[assertionId];

        uint256 buyerPercent;
        if (assertedTruthfully) {
            buyerPercent = proposedBuyerPercent;
        }

        IBosonDisputeHandler(BOSON_PROTOCOL).decideDispute(exchangeId, buyerPercent);

        emit UMAAssertionResolved(assertionId, exchangeId, assertedTruthfully);
    }

    /**
     * @notice Callback from UMA when someone disputes our assertion during the challenge period
     * @param assertionId The ID of the disputed assertion
     * @dev Only callable by UMA Oracle. Emits event for frontend integration to notify users of extended timeline.
     *      When disputed, resolution extends from 2h (challenge period) to 48-96h (UMA DVM voting period).
     *
     * Emits:
     * - DisputeContested event with exchange ID, assertion ID, and timestamp (if assertion exists)
     *
     * Reverts if:
     * - Caller is not UMA Oracle
     */
    function assertionDisputedCallback(bytes32 assertionId) external override {
        if (msg.sender != address(UMA_ORACLE)) revert OnlyUMAOracle();

        uint256 exchangeId = assertionToExchange[assertionId];
        if (exchangeId != 0) {
            emit DisputeContested(exchangeId, assertionId, block.timestamp);
        }
    }

    /**
     * @notice Check if the contract is registered as a dispute resolver
     * @return registered True if registered, false otherwise
     */
    function isRegistered() external view returns (bool registered) {
        return disputeResolverId != 0;
    }

    /**
     * @notice Add fees to the dispute resolver (owner only)
     * @param _disputeResolverFees Array of fee structures to add
     * @dev Only callable by owner after registration is complete
     *
     * Reverts if:
     * - Caller is not owner
     * - Contract is not registered as dispute resolver
     * - Boson Protocol fee addition fails
     */
    function addFeesToDisputeResolver(
        BosonTypes.DisputeResolverFee[] calldata _disputeResolverFees
    ) external onlyOwner {
        if (disputeResolverId == 0) revert NotRegistered();

        IBosonDisputeResolverHandler(BOSON_PROTOCOL).addFeesToDisputeResolver(disputeResolverId, _disputeResolverFees);
    }

    /**
     * @notice Remove fees from the dispute resolver (owner only)
     * @param _feeTokenAddresses Array of token addresses to remove
     * @dev Only callable by owner after registration is complete
     *
     * Reverts if:
     * - Caller is not owner
     * - Contract is not registered as dispute resolver
     * - Boson Protocol fee removal fails
     */
    function removeFeesFromDisputeResolver(address[] calldata _feeTokenAddresses) external onlyOwner {
        if (disputeResolverId == 0) revert NotRegistered();

        IBosonDisputeResolverHandler(BOSON_PROTOCOL).removeFeesFromDisputeResolver(
            disputeResolverId,
            _feeTokenAddresses
        );
    }

    /**
     * @notice Update the challenge period for UMA assertions (owner only)
     * @param _newChallengePeriod New challenge period in seconds
     * @dev Updates the challenge period used for future UMA assertions
     *
     * Reverts if:
     * - Caller is not owner
     */
    function setChallengePeriod(uint64 _newChallengePeriod) external onlyOwner {
        challengePeriod = _newChallengePeriod;
    }

    /**
     * @notice Get dispute resolver information
     * @return exists Whether the dispute resolver exists
     * @return disputeResolver The dispute resolver details
     * @return disputeResolverFees Array of fee structures
     * @return sellerAllowList Array of allowed seller IDs
     */
    function getDisputeResolver()
        external
        view
        returns (
            bool exists,
            BosonTypes.DisputeResolver memory disputeResolver,
            BosonTypes.DisputeResolverFee[] memory disputeResolverFees,
            uint256[] memory sellerAllowList
        )
    {
        return IBosonDisputeResolverHandler(BOSON_PROTOCOL).getDisputeResolver(disputeResolverId);
    }

    /**
     * @notice Validates that this contract is the assigned dispute resolver for the exchange
     * @param _exchangeId The exchange ID to validate
     * Reverts if:
     * - Exchange does not exist
     * - Offer does not exist
     * - This contract is not registered as a dispute resolver
     * - This contract is not the assigned dispute resolver for this exchange
     */
    function _validateAssignedDisputeResolver(uint256 _exchangeId) internal view {
        // it is already validated that there is a valid dispute for this exchange, so we assume exchange and offer exist
        (, BosonTypes.Exchange memory exchange, ) = IBosonExchangeHandler(BOSON_PROTOCOL).getExchange(_exchangeId);
        (, BosonTypes.Offer memory offer, , , , ) = IBosonOfferHandler(BOSON_PROTOCOL).getOffer(exchange.offerId);
        (, , , , BosonTypes.DisputeResolutionTerms memory disputeResolutionTerms, ) = IBosonOfferHandler(BOSON_PROTOCOL)
            .getOffer(offer.id);

        if (disputeResolutionTerms.disputeResolverId != disputeResolverId) {
            revert NotAssignedDisputeResolver();
        }
    }

    /**
     * @notice Internal function to create UMA assertion
     * @param _exchangeId The exchange ID
     * @param _buyerPercent The buyer's proposed percentage
     * @param _additionalInfo Additional information
     * @return assertionId The created assertion ID
     * @dev Creates human-readable claim following UMA's documented approach and submits to UMA Oracle.
     *      Uses exchange token for bond currency and exchange ID as domain ID.
     *
     * Reverts if:
     * - Exchange does not exist
     * - Offer does not exist
     * - UMA bond calculation fails
     * - UMA assertion creation fails
     */
    function _createUMAAssertion(
        uint256 _exchangeId,
        uint256 _buyerPercent,
        string memory _additionalInfo
    ) internal returns (bytes32 assertionId) {
        // Get exchange and offer details
        (, BosonTypes.Exchange memory exchange, ) = IBosonExchangeHandler(BOSON_PROTOCOL).getExchange(_exchangeId);
        (, BosonTypes.Offer memory offer, , , , ) = IBosonOfferHandler(BOSON_PROTOCOL).getOffer(exchange.offerId);

        // Create human-readable claim following UMA's example
        bytes memory claim = abi.encodePacked(
            "Boson Protocol dispute for exchange ",
            Strings.toString(_exchangeId),
            ": Buyer claims ",
            Strings.toString(_buyerPercent),
            "% of funds. ",
            _additionalInfo,
            " at timestamp ",
            Strings.toString(block.timestamp)
        );

        uint256 bond = UMA_ORACLE.getMinimumBond(offer.exchangeToken);
        IERC20 exchangeToken = IERC20(offer.exchangeToken);

        exchangeToken.transferFrom(msg.sender, address(this), bond);
        exchangeToken.approve(address(UMA_ORACLE), bond);

        bytes32 domainId = bytes32(_exchangeId);
        assertionId = UMA_ORACLE.assertTruth(
            claim,
            msg.sender,
            address(this),
            address(0), // we don't use specific escalation manager, but use the default one (DVN).
            challengePeriod,
            exchangeToken,
            bond,
            UMA_ASSERTION_IDENTIFIER,
            domainId
        );
    }
}
