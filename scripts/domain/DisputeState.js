/**
 * Boson Protocol Domain Enum: DisputeState
 */
const NODE = (typeof module !== 'undefined' && typeof module.exports !== 'undefined');
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
if (NODE) {
    module.exports = DisputeState;
} else {
    // Namespace the export in browsers
    if (window) {
        if (!window.Boson) window.Boson = {};
        window.Boson.DisputeState = DisputeState;
    }
}
