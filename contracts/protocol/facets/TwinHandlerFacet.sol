// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import "../../interfaces/IBosonTwinHandler.sol";
import "../../diamond/DiamondLib.sol";
import "../ProtocolBase.sol";
import "../ProtocolLib.sol";

/**
 * @title TwinHandlerFacet
 *
 * @notice Manages digital twinning associated with exchanges within the protocol
 */
contract TwinHandlerFacet is IBosonTwinHandler, ProtocolBase {

    /**
     * @notice Facet Initializer
     */
    function initialize()
    public
    onlyUnInitialized(type(IBosonTwinHandler).interfaceId)
    {
        DiamondLib.addSupportedInterface(type(IBosonTwinHandler).interfaceId);
    }

    
}