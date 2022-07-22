// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { IBosonExchangeHandler } from "../interfaces/handlers/IBosonExchangeHandler.sol";

/**
 * @title TestProtocolFunctions 
 *
 * @dev A contract to test others contracts calling protocol functions.
 *
 */
contract TestProtocolFunctions {
  // Event added here to test if was emitted
  // Ether.js doesn't recognize events emmited by another contract unless the event is declared in both contracts (because it's added to ABI)
  event DisputeRaised(
        uint256 indexed exchangeId,
        uint256 indexed buyerId,
        uint256 indexed sellerId,
        string complaint,
        address executedBy
    );

    IBosonExchangeHandler public protocol;

    constructor(address _protocolAddress) {
        protocol = IBosonExchangeHandler(_protocolAddress);
    }

    function commit(uint256 offerId) external payable {
        protocol.commitToOffer{ value: msg.value }(payable(address(this)), offerId);
    }

    function redeem(uint256 exchangeId) external {
        protocol.redeemVoucher(exchangeId);
    }
}
