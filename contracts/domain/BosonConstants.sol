// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

/**
 * @title BosonConstants
 *
 * @notice Constants used by the Boson Protocol contract ecosystem.
 */
contract BosonConstants {

    // Access Control Roles
    bytes32 internal constant ADMIN    = keccak256("ADMIN");      // Role Admin
    bytes32 internal constant PROTOCOL = keccak256("PROTOCOL");   // Role for facets of the ProtocolDiamond
    bytes32 internal constant CLIENT   = keccak256("CLIENT");     // Role for clients of the ProtocolDiamond
    bytes32 internal constant UPGRADER = keccak256("UPGRADER");   // Role for performing contract and config upgrades

    // Revert Reasons: Facet initializer related
    string internal constant ALREADY_INITIALIZED = "Already initialized";

    // Revert Reasons: Offer / Seller related
    string internal constant NOT_SELLER = "Not seller";
    string internal constant NO_SUCH_OFFER = "No such offer";
    string internal constant OFFER_ALREADY_VOIDED = "Offer already voided";
    string internal constant OFFER_PERIOD_INVALID = "Offer period invalid";

}