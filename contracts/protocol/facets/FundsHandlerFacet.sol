// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import "../../interfaces/IBosonFundsHandler.sol";
import "../../diamond/DiamondLib.sol";
import "../ProtocolBase.sol";
import "../ProtocolLib.sol";

/**
 * @title FundsHandlerFacet
 *
 * @notice Handles custody and withdrawal of buyer and seller funds
 */
contract FundsHandlerFacet is IBosonFundsHandler, ProtocolBase {

    /**
     * @dev Modifier to protect initializer function from being invoked twice.
     */
    modifier onlyUnInitialized()
    {
        ProtocolLib.ProtocolInitializers storage pi = ProtocolLib.protocolInitializers();
        require(!pi.offerFacet, ALREADY_INITIALIZED);
        pi.cashierFacet = true;
        _;
    }

    /**
     * @notice Facet Initializer
     */
    function initialize()
    public
    onlyUnInitialized
    {
        DiamondLib.addSupportedInterface(type(IBosonFundsHandler).interfaceId);
    }


    
}