// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { ProtocolBase } from "./../ProtocolBase.sol";
import { ProtocolLib } from "./../ProtocolLib.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ITwinToken } from "../../interfaces/ITwinToken.sol";


/**
 * @title TwinBase
 *
 * @dev Provides methods for twin creation that can be shared accross facets
 */
contract TwinBase is ProtocolBase {

    /**
     * @notice Creates a Twin.
     *
     * Reverts if:
     * - seller does not exist
     * - Not approved to transfer the seller's token
     *
     * @param _twin - the fully populated struct with twin id set to 0x0
     * @return twinId id of newly created twin
     * @return sellerId id of the twins's seller
     */
    function createTwinInternal(
        Twin memory _twin
    )
    internal
    returns (uint256 twinId, uint256 sellerId)
    {
        // get seller id, make sure it exists and store it to incoming struct
        bool exists;
        (exists, sellerId) = getSellerIdByOperator(msg.sender);
        require(exists, NOT_OPERATOR);

        // Protocol must be approved to transfer seller’s tokens
        require(isProtocolApproved(_twin.tokenAddress, msg.sender, address(this)), NO_TRANSFER_APPROVED);

        // Get the next twinId and increment the counter
        twinId = protocolCounters().nextTwinId++;

        // Get storage location for twin
        (, Twin storage twin) = fetchTwin(twinId);

        // Set twin props individually since memory structs can't be copied to storage
        twin.id = twinId;
        twin.sellerId = sellerId;
        twin.supplyAvailable = _twin.supplyAvailable;
        twin.supplyIds = _twin.supplyIds;
        twin.tokenId = _twin.tokenId;
        twin.tokenAddress = _twin.tokenAddress;
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

}
