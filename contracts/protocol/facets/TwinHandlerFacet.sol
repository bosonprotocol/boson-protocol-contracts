// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import { IBosonTwinHandler } from "../../interfaces/IBosonTwinHandler.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { ProtocolBase } from "../ProtocolBase.sol";
import { ProtocolLib } from "../ProtocolLib.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../interfaces/ITwinToken.sol";

/**
 * @title TwinHandlerFacet
 *
 * @notice Manages digital twinning associated with exchanges within the protocol
 */
contract TwinHandlerFacet is IBosonTwinHandler, ProtocolBase {

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
        require(isProtocolApproved(_twin.tokenAddress, _sellerOperator, address(this)), NO_TRANSFER_APPROVED); // TODO replace _sellerOperator with seller.operator

        // Get the next twinId and increment the counter
        uint256 twinId = protocolCounters().nextTwinId++;

        // modify incoming struct so event value represents true state
        _twin.id = twinId;

        // Get storage location for twin
        (,Twin storage twin) = fetchTwin(_twin.id);

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
    ) internal view returns (bool _approved){
        require(_tokenAddress != address(0), UNSUPPORTED_TOKEN);

        try IERC20(_tokenAddress).allowance(
            _operator,
            _protocol
        ) returns(uint256 _allowance) {
            if (_allowance > 0) {_approved = true; }
        } catch {
            try ITwinToken(_tokenAddress).isApprovedForAll(_operator, _protocol) returns (bool _isApproved) {
                _approved = _isApproved;
            } catch {
                revert(UNSUPPORTED_TOKEN);
            }
        }
    }

    /**
     * @notice Gets the details about a given twin.
     *
     * @param _twinId - the id of the twin to check
     * @return exists - the twin was found
     * @return twin - the twin details. See {BosonTypes.Twin}
     */
    function getTwin(uint256 _twinId)
    external
    view
    returns(bool exists, Twin memory twin) {
        return fetchTwin(_twinId);
    }

    /**
     * @notice Gets the next twin id.
     *
     * Does not increment the counter.
     *
     * @return nextTwinId - the next twin id
     */
    function getNextTwinId()
    public
    view
    returns(uint256 nextTwinId) {

        nextTwinId = protocolCounters().nextTwinId;

    }
}
