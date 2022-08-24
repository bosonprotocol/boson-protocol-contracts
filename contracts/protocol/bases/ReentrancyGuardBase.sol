// SPDX-License-Identifier: MIT

import "../../domain/BosonConstants.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";

pragma solidity ^0.8.0;

/**
 * @dev Contract module that helps prevent reentrant calls to a function.
 *
 * The majority of code, comments and general idea is taken from OpenZeppelin implementation.
 * Code was adjusted to work with the storage layout used in the protocol.
 * Reference implementation: OpenZeppelin Contracts v4.4.1 (security/ReentrancyGuard.sol)
 *
 * Inheriting from `ReentrancyGuard` will make the {nonReentrant} modifier
 * available, which can be applied to functions to make sure there are no nested
 * (reentrant) calls to them.
 *
 * Note that because there is a single `nonReentrant` guard, functions marked as
 * `nonReentrant` may not call one another. This can be worked around by making
 * those functions `private`, and then adding `external` `nonReentrant` entry
 * points to them.
 *
 * TIP: If you would like to learn more about reentrancy and alternative ways
 * to protect against it, check out our blog post
 * https://blog.openzeppelin.com/reentrancy-after-istanbul/[Reentrancy After Istanbul].
 */
abstract contract ReentrancyGuardBase {
    /**
     * @dev Prevents a contract from calling itself, directly or indirectly.
     * Calling a `nonReentrant` function from another `nonReentrant`
     * function is not supported. It is possible to prevent this from happening
     * by making the `nonReentrant` function external, and making it call a
     * `private` function that does the actual work.
     */
    modifier nonReentrant() {
        ProtocolLib.ProtocolStatus storage ps = ProtocolLib.protocolStatus();
        // On the first call to nonReentrant, _notEntered will be true
        require(ps.reentrancyStatus != ENTERED, REENTRANCY_GUARD);

        // Any calls to nonReentrant after this point will fail
        ps.reentrancyStatus = ENTERED;

        _;

        // By storing the original value once again, a refund is triggered (see
        // https://eips.ethereum.org/EIPS/eip-2200)
        ps.reentrancyStatus = NOT_ENTERED;
    }
}
