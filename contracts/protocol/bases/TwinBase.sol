// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { IBosonTwinEvents } from "../../interfaces/events/IBosonTwinEvents.sol";
import { ITwinToken } from "../../interfaces/ITwinToken.sol";
import { ProtocolBase } from "./../bases/ProtocolBase.sol";
import { ProtocolLib } from "./../libs/ProtocolLib.sol";

/**
 * @title TwinBase
 *
 * @dev Provides methods for twin creation that can be shared accross facets
 */
contract TwinBase is ProtocolBase, IBosonTwinEvents {
    /**
     * @notice Creates a Twin.
     *
     * Emits a TwinCreated event if successful.
     *
     * Reverts if:
     * - seller does not exist
     * - Not approved to transfer the seller's token
     * - supplyAvailable is zero
     * - Twin is NonFungibleToken and amount was set
     * - Twin is NonFungibleToken and range is already being used in another twin of the seller
     * - Twin is FungibleToken or MultiToken and amount was not set
     *
     * @param _twin - the fully populated struct with twin id set to 0x0
     */
    function createTwinInternal(Twin memory _twin) internal {
        // get seller id, make sure it exists and store it to incoming struct
        (bool exists, uint256 sellerId) = getSellerIdByOperator(msgSender());
        require(exists, NOT_OPERATOR);

        // Protocol must be approved to transfer seller’s tokens
        require(isProtocolApproved(_twin.tokenAddress, msgSender(), address(this)), NO_TRANSFER_APPROVED);

        // Twin supply must exist and can't be zero
        require(_twin.supplyAvailable > 0, INVALID_SUPPLY_AVAILABLE);

        if (_twin.tokenType == TokenType.NonFungibleToken) {
            // If token is NonFungible amount should be zero
            require(_twin.amount == 0, INVALID_TWIN_PROPERTY);

            // Calculate new twin range [tokenId...lastTokenId]
            uint256 tokenId = _twin.tokenId;
            uint256 lastTokenId = tokenId + _twin.supplyAvailable - 1;

            require(lastTokenId > tokenId, INVALID_TWIN_TOKEN_RANGE);

            // Get all twin ids that belong to seller
            uint256[] memory twinIds = protocolLookups().twinIdsBySeller[sellerId];

            // Checks if token range isn't being used in any other twin of seller
            for (uint256 i = 0; i < twinIds.length; i++) {
                uint256 currentTwinId = twinIds[i];
                (, Twin memory currentTwin) = fetchTwin(currentTwinId);

                // Get looped twin initial supply
                uint256 initialSupply = protocolLookups().initialTwinSupply[currentTwinId];

                // Should ignore if token is not TokenType.NonFungible or if is an different token address
                if (
                    currentTwin.tokenType != TokenType.NonFungibleToken ||
                    currentTwin.tokenAddress != _twin.tokenAddress
                ) {
                    continue;
                }

                // A valid range has:
                // - the first id of range greater than the last token id (tokenId + initialSupply - 1) of the looped twin or
                // - the last id of range lower than the looped twin tokenId (beginning of range)
                require(
                    tokenId > currentTwin.tokenId + initialSupply - 1 || lastTokenId < currentTwin.tokenId,
                    INVALID_TWIN_TOKEN_RANGE
                );
            }
        } else {
            // If token is Fungible or MultiToken amount should not be zero
            require(_twin.amount > 0, INVALID_AMOUNT);
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

        // Add to twinIdsBySeller mapping
        protocolLookups().twinIdsBySeller[sellerId].push(twinId);

        protocolLookups().initialTwinSupply[twinId] = _twin.supplyAvailable;

        // Notify watchers of state change
        emit TwinCreated(twinId, sellerId, _twin, msgSender());
    }

    /**
     * @notice Check if protocol is approved to transfer the tokens.
     *
     * @param _tokenAddress - the address of the seller's twin token contract.
     * @param _operator - the seller's operator address.
     * @param _protocol - the protocol address.
     * @return _approved - the approve status.
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
