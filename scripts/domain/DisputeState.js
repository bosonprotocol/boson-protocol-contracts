/**
 * Boson Protocol Domain Enum: DisputeState
 */
class DisputeState {}

DisputeState.Disputed = 0;
DisputeState.Retracted = 1;
DisputeState.Resolved = 2;
DisputeState.Escalated = 3;
DisputeState.Decided = 4;

DisputeState.Modes = [
  DisputeState.Disputed,
  DisputeState.Retracted,
  DisputeState.Resolved,
  DisputeState.Escalated,
  DisputeState.Decided,
];

// Export
module.exports = DisputeState;
