// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import { DisputeHandlerFacet } from "../protocol/facets/DisputeHandlerFacet.sol";

/**
 * @title TestDisputeHandlerFacet
 *
 * @notice Extended DisputeHandlerFacet with additional external functions for testing
 */
contract TestDisputeHandlerFacet is DisputeHandlerFacet {
    constructor(address _wNative) DisputeHandlerFacet(_wNative) {}

    /**
     * @notice Test function to test invalid final dispute state
     *
     * @param _exchangeId  - the id of the associated exchange
     * @param _targetState - target final state
     */
    function finalizeDispute(uint256 _exchangeId, DisputeState _targetState) external {
        (, Exchange storage exchange) = fetchExchange(_exchangeId);
        (, Dispute storage dispute, DisputeDates storage disputeDates) = fetchDispute(_exchangeId);
        finalizeDispute(_exchangeId, exchange, dispute, disputeDates, _targetState, 1000);
    }
}
