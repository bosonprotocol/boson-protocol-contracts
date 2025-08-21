// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import { BosonTypes } from "../../domain/BosonTypes.sol";

/**
 * @title IUMADisputeResolverAdapter
 * @notice Interface for the UMA Dispute Resolver Adapter that integrates UMA's OptimisticOracleV3 as a dispute resolver for Boson Protocol
 *
 * The ERC-165 identifier for this interface is: 0x5940e0d2
 */
interface IUMADisputeResolverAdapter {
    // Events
    event DisputeEscalatedToUMA(uint256 indexed exchangeId, bytes32 indexed assertionId, address indexed asserter);
    event UMAAssertionResolved(bytes32 indexed assertionId, uint256 indexed exchangeId, bool assertedTruthfully);
    event DisputeResolverRegistered(uint256 indexed disputeResolverId);
    event DisputeContested(uint256 indexed exchangeId, bytes32 indexed assertionId, uint256 timestamp);

    /**
     * @notice Register this contract as a dispute resolver in Boson Protocol (owner only)
     * @param _assistant Assistant address for the dispute resolver (should be msg.sender)
     * @param _treasury Treasury address for the dispute resolver
     * @param _metadataUri Metadata URI for the dispute resolver
     * @param _disputeResolverFees Array of fee structures
     * @param _sellerAllowList Array of seller IDs allowed to use this DR (empty = no restrictions)
     */
    function registerAsDisputeResolver(
        address _assistant,
        address payable _treasury,
        string memory _metadataUri,
        BosonTypes.DisputeResolverFee[] memory _disputeResolverFees,
        uint256[] memory _sellerAllowList
    ) external;

    /**
     * @notice Check if the contract is registered as a dispute resolver
     * @return registered True if registered, false otherwise
     */
    function isRegistered() external view returns (bool registered);

    /**
     * @notice Creates a UMA assertion for an escalated dispute
     * @param _exchangeId The exchange ID of the escalated dispute
     * @param _buyerPercent The buyer's proposed percentage split (0-10000)
     * @param _additionalInfo Additional information to include in the claim
     */
    function assertTruthForDispute(uint256 _exchangeId, uint256 _buyerPercent, string memory _additionalInfo) external;

    /**
     * @notice Add fees to the dispute resolver (owner only)
     * @param _disputeResolverFees Array of fee structures to add
     */
    function addFeesToDisputeResolver(BosonTypes.DisputeResolverFee[] calldata _disputeResolverFees) external;

    /**
     * @notice Remove fees from the dispute resolver (owner only)
     * @param _feeTokenAddresses Array of token addresses to remove
     */
    function removeFeesFromDisputeResolver(address[] calldata _feeTokenAddresses) external;

    /**
     * @notice Update the challenge period for UMA assertions (owner only)
     * @param _newChallengePeriod New challenge period in seconds
     */
    function setChallengePeriod(uint64 _newChallengePeriod) external;

    /**
     * @notice Get dispute resolver information
     */
    function getDisputeResolver()
        external
        view
        returns (
            bool exists,
            BosonTypes.DisputeResolver memory disputeResolver,
            BosonTypes.DisputeResolverFee[] memory disputeResolverFees,
            uint256[] memory sellerAllowList
        );
}
