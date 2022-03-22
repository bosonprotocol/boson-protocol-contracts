// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import "../../interfaces/IBosonTwinHandler.sol";
import "../../diamond/DiamondLib.sol";
import "../ProtocolBase.sol";
import "../ProtocolLib.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

/**
 * @title TwinHandlerFacet
 *
 * @notice Manages digital twinning associated with exchanges within the protocol
 */
contract TwinHandlerFacet is IBosonTwinHandler, ProtocolBase, ReentrancyGuard {
    /**
     * @notice Facet Initializer
     */
    function initialize()
    public
    onlyUnInitialized(type(IBosonTwinHandler).interfaceId)
    {
        // theowner = msg.sender;
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
     */
    function createTwin(
        Twin memory _twin
    )
    external
    override
    {
        // Protocol must be approved to transfer seller’s tokens
        // Seller storage seller = ProtocolLib.getSeller(_twin.sellerId);
        // require(isTokenTransferApproved(_twin.tokenAddress, seller.operator, protocolStorage().treasuryAddress), NO_TRANSFER_APPROVED); // TODO add back when AccountHandler is working

        // Get the next twinId and increment the counter
        uint256 twinId = protocolStorage().nextTwinId++;

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
        emit TwinCreated(twinId, _twin.sellerId);
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
    ) external view returns(bool _isApproved) {
        _isApproved = false;

        try IERC20(_tokenAddress).allowance(
            _operator,
            _spender
        ) returns(uint256 _allowance) {
            if (_allowance > 0) {_isApproved = true; }
        } catch {
            bool _isERC721 = IERC721(_tokenAddress).supportsInterface(0x80ac58cd) || IERC721(_tokenAddress).supportsInterface(0x5b5e139f);
            bool _isERC1155 = IERC1155(_tokenAddress).supportsInterface(0xd9b67a26) || IERC1155(_tokenAddress).supportsInterface(0x0e89341c);
            if (_isERC721) {
                _isApproved = IERC721(_tokenAddress).isApprovedForAll(
                    _operator,
                    _spender
                );
            } else if (_isERC1155) {
                _isApproved = IERC1155(_tokenAddress).isApprovedForAll(
                    _operator,
                    _spender
                );
            }
        }
    }
}
