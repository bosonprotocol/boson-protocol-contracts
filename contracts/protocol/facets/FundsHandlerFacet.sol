// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import {IBosonFundsHandler} from "../../interfaces/handlers/IBosonFundsHandler.sol";
import {DiamondLib} from "../../diamond/DiamondLib.sol";
import {ProtocolBase} from "../bases/ProtocolBase.sol";
import {ProtocolLib} from "../libs/ProtocolLib.sol";

/**
 * @title FundsHandlerFacet
 *
 * @notice Handles custody and withdrawal of buyer and seller funds
 */
contract FundsHandlerFacet is IBosonFundsHandler, ProtocolBase {

    /**
     * @notice Facet Initializer
     */
    function initialize()
    public
    onlyUnInitialized(type(IBosonFundsHandler).interfaceId)
    {
        DiamondLib.addSupportedInterface(type(IBosonFundsHandler).interfaceId);
    }


    
}