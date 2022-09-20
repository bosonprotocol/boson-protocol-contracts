// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

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
 * @notice Provides functions for twin creation that can be shared accross facets
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
        address sender = msgSender();

        // get seller id, make sure it exists and store it to incoming struct
        (bool exists, uint256 sellerId) = getSellerIdByOperator(sender);
        require(exists, NOT_OPERATOR);

        // Protocol must be approved to transfer seller’s tokens
        require(isProtocolApproved(_twin.tokenAddress, sender, address(this)), NO_TRANSFER_APPROVED);

        // Twin supply must exist and can't be zero
        require(_twin.supplyAvailable > 0, INVALID_SUPPLY_AVAILABLE);

        if (_twin.tokenType == TokenType.NonFungibleToken) {
            // Check if the token supports IERC721 interface
            require(contractSupportsInterface(_twin.tokenAddress, type(IERC721).interfaceId), INVALID_TOKEN_ADDRESS);

            // If token is NonFungible amount should be zero
            require(_twin.amount == 0, INVALID_TWIN_PROPERTY);

            // Calculate new twin range [tokenId...lastTokenId]
            uint256 lastTokenId;
            uint256 tokenId = _twin.tokenId;
            if (_twin.supplyAvailable == type(uint256).max) {
                require(tokenId <= (1 << 255), INVALID_TWIN_TOKEN_RANGE); // if supply is "unlimited", starting index can be at most 2*255
                lastTokenId = type(uint256).max;
            } else {
                require(type(uint256).max - _twin.supplyAvailable >= tokenId, INVALID_TWIN_TOKEN_RANGE);
                lastTokenId = tokenId + _twin.supplyAvailable - 1;
            }

            // Get all seller twin ids that belong to the same token address of the new twin to validate if they have not unlimited supply since ranges can overlaps each other
            uint256[] storage twinIds = lookups.twinIdsByTokenAddressAndBySeller[sellerId][_twin.tokenAddress];

            for (uint256 i = 0; i < twinIds.length; i++) {
                // Get storage location for looped twin
                (, Twin storage currentTwin) = fetchTwin(twinIds[i]);

                // The protocol cannot allow two twins with unlimited supply and with the same token address because range overlaps with each other
                if (currentTwin.supplyAvailable == type(uint256).max || _twin.supplyAvailable == type(uint256).max) {
                    require(currentTwin.tokenAddress != _twin.tokenAddress, INVALID_TWIN_TOKEN_RANGE);
                }
            }

            // Get all ranges of twins that belong to the seller and to the same token address of the new twin to validate if range is available
            TokenRange[] storage twinRanges = lookups.twinRangesBySeller[sellerId][_twin.tokenAddress];

            // Checks if token range isn't being used in any other twin of seller
            for (uint256 i = 0; i < twinRanges.length; i++) {
                // A valid range has:
                // - the first id of range greater than the last token id (tokenId + initialSupply - 1) of the looped twin or
                // - the last id of range lower than the looped twin tokenId (beginning of range)
                require(tokenId > twinRanges[i].end || lastTokenId < twinRanges[i].start, INVALID_TWIN_TOKEN_RANGE);
            }

            // Add range to twinRangesBySeller mapping
            TokenRange storage tokenRange = lookups.twinRangesBySeller[sellerId][_twin.tokenAddress].push();
            tokenRange.start = tokenId;
            tokenRange.end = lastTokenId;

            // Add twin id to twinIdsByTokenAddressAndBySeller mapping
            lookups.twinIdsByTokenAddressAndBySeller[sellerId][_twin.tokenAddress].push(_twin.id);
        } else if (_twin.tokenType == TokenType.MultiToken) {
            // If token is Fungible or MultiToken amount should not be zero
            // Also, tthe amount of tokens should not be more than the available token supply.
            require(_twin.amount > 0 && _twin.amount <= _twin.supplyAvailable, INVALID_AMOUNT);

            // Not every ERC20 has supportsInterface method so we can't check interface support if token type is NonFungible
            // Check if the token supports IERC1155 interface
            require(contractSupportsInterface(_twin.tokenAddress, type(IERC1155).interfaceId), INVALID_TOKEN_ADDRESS);
        } else {
            // If token is Fungible or MultiToken amount should not be zero
            // Also, tthe amount of tokens should not be more than the available token supply.
            require(_twin.amount > 0 && _twin.amount <= _twin.supplyAvailable, INVALID_AMOUNT);
        }

        // Get the next twinId and increment the counter
        uint256 twinId = protocolCounters().nextTwinId++;

        // Get storage location for twin
        (, Twin storage twin) = fetchTwin(twinId);

        // Set twin props individually since memory structs can't be copied to storage
        twin.id = _twin.id = twinId;
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
     * @param _operator - the seller's operator address
     * @param _protocol - the protocol address
     * @return _approved - the approve status
     */
    function isProtocolApproved(
        address _tokenAddress,
        address _operator,
        address _protocol
    ) internal view returns (bool _approved) {
        require(_tokenAddress != address(0), UNSUPPORTED_TOKEN);

        try ITwinToken(_tokenAddress).allowance(_operator, _protocol) returns (uint256 _allowance) {
            if (_allowance > 0) {
                _approved = true;
            }
        } catch {
            try ITwinToken(_tokenAddress).isApprovedForAll(_operator, _protocol) returns (bool _isApproved) {
                _approved = _isApproved;
            } catch {
                revert(UNSUPPORTED_TOKEN);
            }
        }
    }
}
