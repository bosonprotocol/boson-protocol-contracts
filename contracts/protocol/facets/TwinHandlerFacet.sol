// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import "../../interfaces/IBosonTwinHandler.sol";
import "../../diamond/DiamondLib.sol";
import "../ProtocolBase.sol";
import "../ProtocolLib.sol";
import "../../utils/TokenApprovalChecker.sol";

/**
 * @title TwinHandlerFacet
 *
 * @notice Manages digital twinning associated with exchanges within the protocol
 */
contract TwinHandlerFacet is IBosonTwinHandler, ProtocolBase {
    TokenApprovalChecker public tokenApprovalChecker;

    /**
     * @notice Facet Initializer
     */
    function initialize()
    public
    onlyUnInitialized(type(IBosonTwinHandler).interfaceId)
    {
        DiamondLib.addSupportedInterface(type(IBosonTwinHandler).interfaceId);
    }

    /**
     * @notice Creates a Twin.
     *
     * Emits a TwinCreated event if successful.
     *
     * Reverts if:
     * - Not approved to transfer the seller's token
     *
     * @param _twin - the fully populated struct with twin id set to 0x0
     * @param _sellerOperator - placeholder for seller's operator address. TODO: Remove when Create seller is implemented.
     */
    function createTwin(
        Twin memory _twin,
        address _sellerOperator
    )
    external
    override
    {
        // Protocol must be approved to transfer seller’s tokens
        // Seller storage seller = ProtocolLib.getSeller(_twin.sellerId);
        // require(isTokenTransferApproved(_twin.tokenAddress, seller.operator, address(this)), NO_TRANSFER_APPROVED); // TODO add back when AccountHandler is working
        require(isTokenTransferApproved(_twin.tokenAddress, _sellerOperator, address(this)), NO_TRANSFER_APPROVED);

        // Get the next twinId and increment the counter
        uint256 twinId = protocolCounters().nextTwinId++;

        // modify incoming struct so event value represents true state
        _twin.id = twinId;

        // Get storage location for twin
        Twin storage twin = ProtocolLib.getTwin(twinId);

        // Set twin props individually since memory structs can't be copied to storage
        twin.id = twinId;
        twin.sellerId = _twin.sellerId;
        twin.supplyAvailable = _twin.supplyAvailable;
        twin.supplyIds = _twin.supplyIds;
        twin.tokenId = _twin.tokenId;
        twin.tokenAddress = _twin.tokenAddress;

        // Notify watchers of state change
        emit TwinCreated(twinId, _twin.sellerId, _twin);
    }

    /**
     * @notice Check if Protocol's treasuryAddress is approved to transfer seller’s tokens.
     *
     * @param _tokenAddress - the address of the seller's twin token contract.
     * @param _operator - the seller's operator address.
     * @param _spender - the treasuryAddress of protocol.
     * @return _isApproved - the approve status.
     */
    function isTokenTransferApproved(
        address _tokenAddress,
        address _operator,
        address _spender
    )
    internal
    returns(bool _isApproved) {
        tokenApprovalChecker = new TokenApprovalChecker();

        try tokenApprovalChecker.isSpenderApproved(_tokenAddress, _operator, _spender) returns (bool _approved) {
            _isApproved = _approved;
        }
        catch {
            revert(UNSUPPORTED_TOKEN);
        }
    }

    /**
     * @notice Gets the details about a given twin.
     *
     * @param _twinId - the id of the twin to check
     * @return success - the twin was found
     * @return twin - the twin details. See {BosonTypes.Twin}
     */
    function getTwin(uint256 _twinId)
    external
    view
    returns(bool success, Twin memory twin) {
        if (_twinId != 0) {
            twin = ProtocolLib.getTwin(_twinId);
            success = (twin.id == _twinId);
        }
    }
}
