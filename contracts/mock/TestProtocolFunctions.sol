// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import { BosonTypes } from "../domain/BosonTypes.sol";
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
        protocol.commitToOffer{ value: msg.value }(
            payable(address(this)),
            offerId,
            BosonTypes.PriceDiscovery(0, address(0), new bytes(0), BosonTypes.Side.Ask)
        );
    }

    function redeem(uint256 exchangeId) external {
        protocol.redeemVoucher(exchangeId);
    }
}
