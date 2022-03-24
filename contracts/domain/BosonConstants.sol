// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

/**
 * @title BosonConstants
 *
 * @notice Constants used by the Boson Protocol contract ecosystem.
 */
contract BosonConstants {
    // Access Control Roles
    bytes32 internal constant ADMIN     = keccak256("ADMIN");      // Role Admin
    bytes32 internal constant PROTOCOL  = keccak256("PROTOCOL");   // Role for facets of the ProtocolDiamond
    bytes32 internal constant CLIENT    = keccak256("CLIENT");     // Role for clients of the ProtocolDiamond
    bytes32 internal constant UPGRADER  = keccak256("UPGRADER");   // Role for performing contract and config upgrades
    bytes32 internal constant RESOLVER  = keccak256("RESOLVER");   // Role for resolving the outcome of an escalated dispute
    bytes32 internal constant FEE_COLLECTOR  = keccak256("FEE_COLLECTOR");   // Role for collecting fees from the protocol

    //Revert Reasons: General
    string internal constant INVALID_ADDRESS = "Invalid address";
   
    // Revert Reasons: Facet initializer related
    string internal constant ALREADY_INITIALIZED = "Already initialized";

    // Revert Reasons: Access related
    string internal constant ACCESS_DENIED = "Access denied, caller doesn't have role";
    string internal constant NOT_OPERATOR = "Not seller's operator";
    string internal constant SELLER_MUBT_BE_ACTIVE = "Seller must be active";

    // Revert Reasons: Offer related
    string internal constant NO_SUCH_OFFER = "No such offer";
    string internal constant OFFER_ALREADY_VOIDED = "Offer already voided";
    string internal constant OFFER_PERIOD_INVALID = "Offer period invalid";
    string internal constant OFFER_PENALTY_INVALID = "Offer penalty invalid";
    string internal constant OFFER_MUST_BE_ACTIVE = "Offer must be active";
    string internal constant OFFER_NOT_UPDATEABLE = "Offer not updateable";

    // Revert Reasons: Exchange related
    string internal constant NO_SUCH_EXCHANGE = "No such exchange";

}