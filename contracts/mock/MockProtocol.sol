// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import { BosonTypes } from "../domain/BosonTypes.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { FundsLib } from "../protocol/libs/FundsLib.sol";
import { IDRFeeMutualizer } from "../interfaces/IDRFeeMutualizer.sol";

/**
 * @title MockProtocol
 * @notice Mock protocol contract for testing DRFeeMutualizer
 * @dev This contract provides mock implementations of the Boson protocol interfaces
 */
contract MockProtocol {
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
     * @param sellerId The seller ID
     * @param admin The admin address
     */
    function setSeller(uint256 sellerId, address admin) external {
        sellerAdmins[sellerId] = admin;
        sellers[sellerId] = BosonTypes.Seller({
            id: sellerId,
            assistant: admin,
            admin: admin,
            clerk: admin,
            treasury: payable(admin),
            active: true,
            metadataUri: ""
        });
    }

    /**
     * @notice Mock implementation of getSeller
     * @param sellerId The seller ID
     * @return exists Whether the seller exists
     * @return seller The seller data
     * @return authToken The auth token data
     */
    function getSeller(
        uint256 sellerId
    ) external view returns (bool exists, BosonTypes.Seller memory seller, BosonTypes.AuthToken memory authToken) {
        exists = sellerAdmins[sellerId] != address(0);
        if (exists) {
            seller = sellers[sellerId];
            authToken = BosonTypes.AuthToken({ tokenId: 0, tokenType: BosonTypes.AuthTokenType.None });
        }
    }

    /**
     * @notice Mock implementation of depositFunds
     * @param sellerId The seller ID
     * @param tokenAddress The token address
     * @param amount The amount to deposit
     */
    function depositFunds(uint256 sellerId, address tokenAddress, uint256 amount) external payable {
        // Get the seller's treasury address
        BosonTypes.Seller memory seller = sellers[sellerId];
        require(seller.treasury != address(0), "Seller not found");

        if (tokenAddress == address(0)) {
            // Native currency
            if (msg.value != amount) revert("Incorrect native amount");
            // Funds are now in the protocol contract
        } else {
            // ERC20 token
            if (msg.value != 0) revert("Native not allowed for ERC20");
            // Pull tokens from the caller (mutualizer)
            IERC20(tokenAddress).safeTransferFrom(msg.sender, address(this), amount);
        }

        // In a real protocol, this would increase available funds for the seller
        // For the mock, we just accept the funds
    }

    /**
     * @notice Proxy to call requestDRFee on DRFeeMutualizer as protocol
     */
    function callRequestDRFee(
        address mutualizer,
        uint256 sellerId,
        uint256 offerId,
        uint256 feeAmount,
        address tokenAddress,
        uint256 exchangeId,
        uint256 disputeResolverId
    ) external {
        IDRFeeMutualizer(mutualizer).requestDRFee(
            sellerId,
            offerId,
            feeAmount,
            tokenAddress,
            exchangeId,
            disputeResolverId
        );
    }

    /**
     * @notice Proxy to call returnDRFee on DRFeeMutualizer as protocol
     */
    function callReturnDRFee(address mutualizer, uint256 exchangeId, uint256 feeAmount) external payable {
        IDRFeeMutualizer(mutualizer).returnDRFee{ value: msg.value }(exchangeId, feeAmount);
    }

    /**
     * @notice Helper function to approve ERC20 tokens for the mutualizer
     * @dev This is needed because the mutualizer uses transferFrom to receive ERC20 tokens
     * @param token The token address to approve
     * @param spender The address to approve (mutualizer)
     * @param amount The amount to approve
     */
    function approveToken(address token, address spender, uint256 amount) external {
        IERC20(token).approve(spender, amount);
    }
}
