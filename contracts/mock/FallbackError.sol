// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import { IBosonFundsHandler } from "../interfaces/handlers/IBosonFundsHandler.sol";
import { IDRFeeMutualizerClient } from "../interfaces/clients/IDRFeeMutualizerClient.sol";

/**
 * @title WithoutFallbackError
 *
 * @notice Mock contract lacking a fallback function for Unit Testing
 */
contract WithoutFallbackError {
    /**
     * @notice Function to call withdrawFunds on funds handler, contract being the buyer
     *
     * @param _fundsHandlerAddress - address of the funds handler facet
     * @param _buyerId - id of entity for which funds should be withdrawn
     * @param _tokenList - list of contract addresses of tokens that are being withdrawn
     * @param _tokenAmounts - list of amounts to be withdrawn, corresponding to tokens in tokenList
     */
    function withdrawFunds(
        address _fundsHandlerAddress,
        uint256 _buyerId,
        address[] calldata _tokenList,
        uint256[] calldata _tokenAmounts
    ) external {
        IBosonFundsHandler(_fundsHandlerAddress).withdrawFunds(_buyerId, _tokenList, _tokenAmounts);
    }

    /**
     * @notice Function to call withdraw on mutualizer, contract being the owner
     *
     * @param _mutualizerAddress - mutualizer address
     * @param _tokenAddress - the token address (use 0x0 for native token)
     * @param _amount - amount to transfer
     */
    function withdrawMutualizerFunds(address _mutualizerAddress, address _tokenAddress, uint256 _amount) external {
        IDRFeeMutualizerClient(_mutualizerAddress).withdraw(_tokenAddress, _amount);
    }
}

/**
 * @title FallbackError
 *
 * @notice Mock contract having a fallback function for Unit Testing
 */
contract FallbackError is WithoutFallbackError {
    /**
     * @notice Fallback function
     */
    receive() external payable {
        revert("Error from fallback function");
    }
}
