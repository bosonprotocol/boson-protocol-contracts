// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { IBosonFundsHandler } from "../interfaces/handlers/IBosonFundsHandler.sol";

/**
 * @title WithoutFallbackError
 *
 * @notice Mock contract lacking a fallback function for Unit Testing
 */
contract WithoutFallbackError {
    /**
     * @notice Function to call withdrawFunds on funds handler, contract being the buyer
     */
    function withdrawFunds(
        address _fundsHandlerAddress,
        uint256 _buyerId,
        address[] calldata _tokenList,
        uint256[] calldata _tokenAmounts
    ) external {
        IBosonFundsHandler(_fundsHandlerAddress).withdrawFunds(_buyerId, _tokenList, _tokenAmounts);
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
