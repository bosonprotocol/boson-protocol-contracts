// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import "../../domain/BosonConstants.sol";
import { IBosonAccountHandler } from "../../interfaces/handlers/IBosonAccountHandler.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { ProtocolBase } from "../bases/ProtocolBase.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";

/**
 * @title AccountHandlerFacet
 *
 * @notice Registers the IBosonAccountHandler interface and exposes the next account id
 */
contract AccountHandlerFacet is ProtocolBase {
    /**
     * @notice Facet Initializer
     * This function is callable only once.
     */
    function initialize() public onlyUnInitialized(type(IBosonAccountHandler).interfaceId) {
        // The IBosonAccountHandler interface is contributed to by multiple facets which don't have their own interfaces.
        // This facet doesn't extend the interface since it doesn't implement all the methods.
        // However it is logically responsible for registering the interface.
        DiamondLib.addSupportedInterface(type(IBosonAccountHandler).interfaceId);
    }

    /**
     * @notice Gets the next account id that can be assigned to an account.
     *
     * @dev Does not increment the counter.
     *
     * @return nextAccountId - the account id
     */
    function getNextAccountId() external view returns (uint256 nextAccountId) {
        nextAccountId = protocolCounters().nextAccountId;
    }
}
