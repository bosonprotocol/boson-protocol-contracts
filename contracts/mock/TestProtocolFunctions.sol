// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import { IBosonExchangeHandler } from "../interfaces/handlers/IBosonExchangeHandler.sol";

/**
 * @title TestProtocolFunctions
 *
 * @dev A contract to test others contracts calling protocol functions.
 *
 */
contract TestProtocolFunctions {
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
