/**
 * Boson Protocol Domain Enum: DisputeState
 */
class DisputeState {}

DisputeState.Resolving = 0;
DisputeState.Retracted = 1;
DisputeState.Resolved = 2;
DisputeState.Escalated = 3;
DisputeState.Decided = 4;
DisputeState.Refused = 5;

DisputeState.Modes = [
  DisputeState.Resolving,
  DisputeState.Retracted,
  DisputeState.Resolved,
  DisputeState.Escalated,
  DisputeState.Decided,
  DisputeState.Refused,
];

// Export
module.exports = DisputeState;
