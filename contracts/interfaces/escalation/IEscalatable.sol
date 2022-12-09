// SPDX-License-Identifier: MIT
pragma solidity ^0.8;

interface IEscalatable {
    function escalateDispute(
        uint256 _exchangeId,
        uint256 _buyerPercent,
        uint256 _sellerPercent
    ) external;

    function escalationCost() external returns (uint256 _cost);
}
