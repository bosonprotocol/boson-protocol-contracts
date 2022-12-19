// SPDX-License-Identifier: MIT
pragma solidity ^0.8;

interface IEscalationResolver {
    function decideDispute(uint256 _exchangeId, uint256 _buyerPercent) external;

    function refuseEscalatedDispute(uint256 _exchangeId) external;
}
