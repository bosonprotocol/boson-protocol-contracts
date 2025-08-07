// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import "../../domain/BosonConstants.sol";
import { IBosonTwinEvents } from "../../interfaces/events/IBosonTwinEvents.sol";
import { ITwinToken } from "../../interfaces/ITwinToken.sol";
import { ProtocolBase } from "./../bases/ProtocolBase.sol";
import { ProtocolLib } from "./../libs/ProtocolLib.sol";
import { IERC721 } from "../../interfaces/IERC721.sol";
import { IERC1155 } from "../../interfaces/IERC1155.sol";

/**
 * @title TwinBase
 *
 * @notice Provides functions for twin creation that can be shared across facets
 */
contract TwinBase is ProtocolBase, IBosonTwinEvents {
    /**
     * @notice Creates a Twin.
     *
     * Emits a TwinCreated event if successful.
     *
     * Reverts if:
     * - Seller does not exist
     * - Protocol is not approved to transfer the seller's token
     * - Twin supplyAvailable is zero
     * - Twin is NonFungibleToken and amount was set
     * - Twin is NonFungibleToken and end of range would overflow
     * - Twin is NonFungibleToken with unlimited supply and starting token id is too high
     * - Twin is NonFungibleToken and range is already being used in another twin of the seller
     * - Twin is FungibleToken or MultiToken and amount was not set
     * - Twin is FungibleToken or MultiToken and amount is greater than supply available
     *
     * @param _twin - the fully populated struct with twin id set to 0x0
     */
    function createTwinInternal(Twin memory _twin) internal {
        // Cache protocol lookups for reference
        ProtocolLib.ProtocolLookups storage lookups = protocolLookups();

        // get message sender
        address sender = _msgSender();

        // get seller id, make sure it exists and store it to incoming struct
        (bool exists, uint256 sellerId) = getSellerIdByAssistant(sender);
        if (!exists) revert NotAssistant();

        // Protocol must be approved to transfer seller’s tokens
        if (!isProtocolApproved(_twin.tokenAddress, sender, address(this))) revert NoTransferApproved();

        // Twin supply must exist and can't be zero
        if (_twin.supplyAvailable == 0) revert InvalidSupplyAvailable();

        // Get the next twinId and increment the counter
        uint256 twinId = protocolCounters().nextTwinId++;
        _twin.id = twinId;

        if (_twin.tokenType == TokenType.NonFungibleToken) {
            // Check if the token supports IERC721 interface
            if (!contractSupportsInterface(_twin.tokenAddress, type(IERC721).interfaceId)) revert InvalidTokenAddress();

            // If token is NonFungible amount should be zero
            if (_twin.amount != 0) revert InvalidTwinProperty();

            // Calculate new twin range [tokenId...lastTokenId]
            uint256 lastTokenId;
            uint256 tokenId = _twin.tokenId;
            if (_twin.supplyAvailable == type(uint256).max) {
                if (tokenId > (1 << 255)) revert InvalidTwinTokenRange(); // if supply is "unlimited", starting index can be at most 2*255
                lastTokenId = type(uint256).max;
            } else {
                if (type(uint256).max - _twin.supplyAvailable < tokenId) revert InvalidTwinTokenRange();
                lastTokenId = tokenId + _twin.supplyAvailable - 1;
            }

            // Get all ranges of twins that belong to the seller and to the same token address of the new twin to validate if range is available
            TokenRange[] storage twinRanges = lookups.twinRangesBySeller[sellerId][_twin.tokenAddress];

            uint256 twinRangesLength = twinRanges.length;
            // Checks if token range isn't being used in any other twin of seller
            for (uint256 i = 0; i < twinRangesLength; ) {
                // A valid range has:
                // - the first id of range greater than the last token id (tokenId + initialSupply - 1) of the looped twin or
                // - the last id of range lower than the looped twin tokenId (beginning of range)
                if (lastTokenId >= twinRanges[i].start && tokenId <= twinRanges[i].end) revert InvalidTwinTokenRange();

                unchecked {
                    i++;
                }
            }

            // Add range to twinRangesBySeller mapping
            TokenRange storage tokenRange = twinRanges.push();
            tokenRange.start = tokenId;
            tokenRange.end = lastTokenId;
            tokenRange.twinId = twinId;

            lookups.rangeIdByTwin[twinId] = ++twinRangesLength;
        } else if (_twin.tokenType == TokenType.MultiToken) {
            // If token is Fungible or MultiToken amount should not be zero
            // Also, the amount of tokens should not be more than the available token supply.
            if (_twin.amount == 0 || _twin.amount > _twin.supplyAvailable) revert InvalidAmount();

            // Not every ERC20 has supportsInterface method so we can't check interface support if token type is NonFungible
            // Check if the token supports IERC1155 interface
            if (!contractSupportsInterface(_twin.tokenAddress, type(IERC1155).interfaceId))
                revert InvalidTokenAddress();
        } else {
            // If token is Fungible or MultiToken amount should not be zero
            // Also, the amount of tokens should not be more than the available token supply.
            if (_twin.amount == 0 || _twin.amount > _twin.supplyAvailable) revert InvalidAmount();
        }

        // Get storage location for twin
        (, Twin storage twin) = fetchTwin(twinId);

        // Set twin props individually since memory structs can't be copied to storage
        twin.id = twinId;
        twin.sellerId = _twin.sellerId = sellerId;
        twin.supplyAvailable = _twin.supplyAvailable;
        twin.amount = _twin.amount;
        twin.tokenId = _twin.tokenId;
        twin.tokenAddress = _twin.tokenAddress;
        twin.tokenType = _twin.tokenType;

        // Notify watchers of state change
        emit TwinCreated(twinId, sellerId, _twin, sender);
    }

    /**
     * @notice Checks if the contract supports the correct interface for the selected token type.
     *
     * @param _tokenAddress - the address of the token to check
     * @param _interfaceId - the interface to check for
     * @return true if the contract supports the interface, false otherwise
     */
    function contractSupportsInterface(address _tokenAddress, bytes4 _interfaceId) internal view returns (bool) {
        try ITwinToken(_tokenAddress).supportsInterface(_interfaceId) returns (bool supported) {
            return supported;
        } catch {
            return false;
        }
    }

    /**
     * @notice Checks if protocol is approved to transfer the tokens.
     *
     * @param _tokenAddress - the address of the seller's twin token contract
     * @param _assistant - the seller's assistant address
     * @param _protocol - the protocol address
     * @return _approved - the approve status
     */
    function isProtocolApproved(
        address _tokenAddress,
        address _assistant,
        address _protocol
    ) internal view returns (bool _approved) {
        if (_tokenAddress == address(0)) revert UnsupportedToken();

        try ITwinToken(_tokenAddress).allowance(_assistant, _protocol) returns (uint256 _allowance) {
            if (_allowance > 0) {
                _approved = true;
            }
        } catch {
            try ITwinToken(_tokenAddress).isApprovedForAll(_assistant, _protocol) returns (bool _isApproved) {
                _approved = _isApproved;
            } catch {
                revert UnsupportedToken();
            }
        }
    }
}
