// SPDX-License-Identifier: MIT
pragma solidity ^0.8;
// THIS CONTRACT IS IMPLEMENTED FOR INOFRMATION PURPOSES AND SHOULD NOT BE USED IN PRODUCTION

import { IArbitrator } from "./IArbitrator.sol";
import { IArbitrable } from "./IArbitrable.sol";
import { IMetaEvidence } from "./IMetaEvidence.sol";
import { IEscalatable } from "../interfaces/escalation/IEscalatable.sol";
import { IEscalationResolver } from "../interfaces/escalation/IEscalationResolver.sol";

contract BosonKlerosConnector is IEscalatable, IArbitrable, IMetaEvidence {
    error InvalidExchangeError();

    struct BosonCase {
        uint256 exchangeId;
        uint256 buyerPercent;
        uint256 sellerPercent;
        // TODO: evidence data
    }

    IArbitrator arbitrator;
    IEscalationResolver escalationResolver;

    mapping(uint256 => BosonCase) klerosDisputeCases;

    constructor(IArbitrator _arbitrator, IEscalationResolver _escalationResolver) {
        arbitrator = _arbitrator;
        escalationResolver = _escalationResolver;
    }

    function escalateDispute(uint256 _exchangeId, uint256 _buyerPercent, uint256 _sellerPercent) external {
        // 3 is a number of ruling options. For example: 1 - buyer proposal, 2 - seller proposal, 3 - refuse to decide
        uint256 disputeId = arbitrator.createDispute(3, "");
        klerosDisputeCases[disputeId] = BosonCase(_exchangeId, _buyerPercent, _sellerPercent);
    }

    function escalationCost() external view returns (uint256 _cost) {
        return arbitrator.arbitrationCost("");
    }

    /**
     * @dev Give a ruling for a dispute. Must be called by the arbitrator.
     * The purpose of this function is to ensure that the address calling it has the right to rule on the contract.
     * @param _disputeID ID of the dispute in the Arbitrator contract.
     * @param _ruling Ruling given by the arbitrator. Note that 0 is reserved for "Not able/wanting to make a decision".
     */
    function rule(uint256 _disputeID, uint256 _ruling) external {
        BosonCase memory bosonCase = klerosDisputeCases[_disputeID];
        if (bosonCase.exchangeId == 0) revert InvalidExchangeError();

        // Assume 3 is refusal to decide, 1 - buyer proposal is accepted, 2 - seller proposal is accepted
        if (_ruling == 1) {
            escalationResolver.decideDispute(bosonCase.exchangeId, bosonCase.buyerPercent);
        } else if (_ruling == 2) {
            escalationResolver.decideDispute(bosonCase.exchangeId, 10000 - bosonCase.sellerPercent);
        } else {
            escalationResolver.refuseEscalatedDispute(bosonCase.exchangeId);
        }

        emit Ruling(arbitrator, _disputeID, _ruling);
    }
}
