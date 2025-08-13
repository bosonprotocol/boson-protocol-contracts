// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import { BosonTypes } from "../domain/BosonTypes.sol";
import { IBosonExchangeHandler } from "../interfaces/handlers/IBosonExchangeHandler.sol";
import { IBosonExchangeCommitHandler } from "../interfaces/handlers/IBosonExchangeCommitHandler.sol";

/**
 * @title TestProtocolFunctions
 *
 * @dev A contract to test others contracts calling protocol functions.
 *
 */
contract TestProtocolFunctions {
    IBosonExchangeHandler public protocol;
    IBosonExchangeCommitHandler public commitHandler;

    constructor(address _protocolAddress) {
        protocol = IBosonExchangeHandler(_protocolAddress);
        commitHandler = IBosonExchangeCommitHandler(_protocolAddress);
    }

    function commit(uint256 offerId) external payable {
        commitHandler.commitToOffer{ value: msg.value }(payable(address(this)), offerId);
    }

    function redeem(uint256 exchangeId) external {
        protocol.redeemVoucher(exchangeId);
    }
}
