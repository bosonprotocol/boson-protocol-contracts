// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import "../../domain/BosonConstants.sol";
import { IBosonAccountHandler } from "../../interfaces/handlers/IBosonAccountHandler.sol";
import { IBosonAgentHandler } from "../../interfaces/handlers/IBosonAgentHandler.sol";
import { IBosonBuyerHandler } from "../../interfaces/handlers/IBosonBuyerHandler.sol";
import { IBosonDisputeResolverHandler } from "../../interfaces/handlers/IBosonDisputeResolverHandler.sol";
import { IBosonSellerHandler } from "../../interfaces/handlers/IBosonSellerHandler.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { ProtocolBase } from "../bases/ProtocolBase.sol";

/**
 * @title AccountHandlerFacet
 *
 * @notice Registers the IBosonAccountHandler interface and exposes the next account id.
 */
contract AccountHandlerFacet is ProtocolBase {
    /**
     * @notice Initializes facet.
     * This function is callable only once.
     */
    function initialize() public onlyUninitialized(type(IBosonAccountHandler).interfaceId) {
        // The IBosonAccountHandler interface is contributed to by multiple facets which don't have their own interfaces.
        // This facet doesn't extend the interface since it doesn't implement all the methods.
        // However, it is logically responsible for registering the interface.
        bytes4 commonAccountHandlerInterfaceId = type(IBosonAccountHandler).interfaceId ^
            type(IBosonAgentHandler).interfaceId ^
            type(IBosonBuyerHandler).interfaceId ^
            type(IBosonDisputeResolverHandler).interfaceId ^
            type(IBosonSellerHandler).interfaceId;
        DiamondLib.addSupportedInterface(commonAccountHandlerInterfaceId);
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
