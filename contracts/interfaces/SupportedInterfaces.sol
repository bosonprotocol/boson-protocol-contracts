// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import "./IBosonFundsHandler.sol";
import "./IBosonConfigHandler.sol";
import "./IBosonDisputeHandler.sol";
import "./IBosonExchangeHandler.sol";
import "./IBosonOfferHandler.sol";
import "./IBosonTwinHandler.sol";
import "./IBosonAccountHandler.sol";
import "./IBosonVoucher.sol";
import "./IBosonClient.sol";
import "./IDiamondCut.sol";
import "./IDiamondLoupe.sol";

/**
 * @title SupportedInterfaces
 *
 * @notice Allows us to read/verify the interface ids supported by the Boson Protocol
 * contract suite.
 *
 * When you need to add a new interface and find out what its ERC165 interfaceId is,
 * Add it to this contract, and add a unit test for it, which will fail, telling you
 * the actual interface id. Then update the supported-interfaces.js file with the id
 * of the new interface. This way, should an interface change, say adding a new method,
 * the SupportedInterfaces.js test suite will fail, reminding you to update the interface
 * id in the constants file.
 */
contract SupportedInterfaces {
    function getIBosonConfigHandler() public pure returns (bytes4 id) {
        id = type(IBosonConfigHandler).interfaceId;
    }

    function getIBosonDisputeHandler() public pure returns (bytes4 id) {
        id = type(IBosonDisputeHandler).interfaceId;
    }

    function getIBosonExchangeHandler() public pure returns (bytes4 id) {
        id = type(IBosonExchangeHandler).interfaceId;
    }

    function getIBosonFundsHandler() public pure returns (bytes4 id) {
        id = type(IBosonFundsHandler).interfaceId;
    }

    function getIBosonOfferHandler() public pure returns (bytes4 id) {
        id = type(IBosonOfferHandler).interfaceId;
    }

    function getIBosonTwinHandler() public pure returns (bytes4 id) {
        id = type(IBosonTwinHandler).interfaceId;
    }

    function getIBosonAccountHandler() public pure returns (bytes4 id) {
        id = type(IBosonAccountHandler).interfaceId;
    }

    function getIBosonVoucher() public pure returns (bytes4 id) {
        id = type(IBosonVoucher).interfaceId;
    }

    function getIBosonClient() public pure returns (bytes4 id) {
        id = type(IBosonClient).interfaceId;
    }
}
