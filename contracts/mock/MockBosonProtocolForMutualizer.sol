// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import { BosonTypes } from "../domain/BosonTypes.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IDRFeeMutualizer } from "../interfaces/IDRFeeMutualizer.sol";

/**
 * @title MockBosonProtocolForMutualizer
 * @notice Mock Boson protocol contract specifically for testing DRFeeMutualizer interactions
 */
contract MockBosonProtocolForMutualizer {
    using SafeERC20 for IERC20;

    // Storage for mock data
    mapping(uint256 => address) public sellerAdmins;
    mapping(uint256 => BosonTypes.Seller) public sellers;

    /**
     * @notice Receive function to accept native currency
     */
    receive() external payable {
        // Accept native currency
    }

    /**
     * @notice Sets a seller admin address for testing
     * @param _sellerId The seller ID
     * @param _admin The admin address
     */
    function setSeller(uint256 _sellerId, address _admin) external {
        sellerAdmins[_sellerId] = _admin;
        sellers[_sellerId] = BosonTypes.Seller({
            id: _sellerId,
            assistant: _admin,
            admin: _admin,
            clerk: _admin,
            treasury: payable(_admin),
            active: true,
            metadataUri: ""
        });
    }

    /**
     * @notice Mock implementation of getSeller
     * @param _sellerId The seller ID
     * @return exists Whether the seller exists
     * @return seller The seller data
     * @return authToken The auth token data
     */
    function getSeller(
        uint256 _sellerId
    ) external view returns (bool exists, BosonTypes.Seller memory seller, BosonTypes.AuthToken memory authToken) {
        exists = sellerAdmins[_sellerId] != address(0);
        if (exists) {
            seller = sellers[_sellerId];
            authToken = BosonTypes.AuthToken({ tokenId: 0, tokenType: BosonTypes.AuthTokenType.None });
        }
    }

    /**
     * @notice Mock implementation of depositFunds
     * @param _sellerId The seller ID
     * @param _tokenAddress The token address
     * @param _amount The amount to deposit
     */
    function depositFunds(uint256 _sellerId, address _tokenAddress, uint256 _amount) external payable {
        // Get the seller's treasury address
        BosonTypes.Seller memory seller = sellers[_sellerId];
        require(seller.treasury != address(0), "Seller not found");

        if (_tokenAddress == address(0)) {
            // Native currency
            if (msg.value != _amount) revert("Incorrect native amount");
            // Funds are now in the protocol contract
        } else {
            // ERC20 token
            if (msg.value != 0) revert("Native not allowed for ERC20");
            // Pull tokens from the caller (mutualizer)
            IERC20(_tokenAddress).safeTransferFrom(msg.sender, address(this), _amount);
        }

        // In a real protocol, this would increase available funds for the seller
        // For the mock, we just accept the funds
    }

    /**
     * @notice Proxy to call requestDRFee on DRFeeMutualizer as protocol
     */
    function callRequestDRFee(
        address _mutualizer,
        uint256 _feeAmount,
        uint256 _sellerId,
        address _tokenAddress,
        uint256 _exchangeId,
        uint256 _disputeResolverId
    ) external {
        IDRFeeMutualizer(_mutualizer).requestDRFee(
            _sellerId,
            _feeAmount,
            _tokenAddress,
            _exchangeId,
            _disputeResolverId
        );
    }

    /**
     * @notice Proxy to call returnDRFee on DRFeeMutualizer as protocol
     */
    function callReturnDRFee(address _mutualizer, uint256 _exchangeId, uint256 _feeAmount) external payable {
        IDRFeeMutualizer(_mutualizer).returnDRFee{ value: msg.value }(_exchangeId, _feeAmount);
    }

    /**
     * @notice Helper function to approve ERC20 tokens for the mutualizer
     * @dev This is needed because the mutualizer uses transferFrom to receive ERC20 tokens
     * @param _token The token address to approve
     * @param _spender The address to approve (mutualizer)
     * @param _amount The amount to approve
     */
    function approveToken(address _token, address _spender, uint256 _amount) external {
        IERC20(_token).approve(_spender, _amount);
    }
}
