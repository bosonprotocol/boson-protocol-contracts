// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;


import { IBosonAccountHandler } from "../../interfaces/IBosonAccountHandler.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { ProtocolBase } from "../ProtocolBase.sol";
import { ProtocolLib } from "../ProtocolLib.sol";

contract AccountHandlerFacet is IBosonAccountHandler, ProtocolBase {

    /**
     * @notice Facet Initializer
     */
    function initialize()
    public
    onlyUnInitialized(type(IBosonAccountHandler).interfaceId)
    {
        DiamondLib.addSupportedInterface(type(IBosonAccountHandler).interfaceId);
    }

    /**
     * @notice Gets the next account Id that can be assigned to an account.
     *
     * @return nextAccountId - the account Id
     */
    function getNextAccountId()
    external
    override
    view 
    returns(uint256 nextAccountId) {
        nextAccountId = protocolCounters().nextAccountId;
    }

}