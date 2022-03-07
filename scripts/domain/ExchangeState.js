/**
 * Boson Protocol Domain Enum: ExchangeState
 */
const NODE = (typeof module !== 'undefined' && typeof module.exports !== 'undefined');
class ExchangeState {}

ExchangeState.Committed = 0;
ExchangeState.Revoked = 1;
ExchangeState.Canceled = 2;
ExchangeState.Redeemed = 3;
ExchangeState.Completed = 4;

ExchangeState.Modes = [
    ExchangeState.Committed,
    ExchangeState.Revoked,
    ExchangeState.Canceled,
    ExchangeState.Redeemed,
    ExchangeState.Completed
];

// Export
if (NODE) {
    module.exports = ExchangeState;
} else {
    // Namespace the export in browsers
    if (window) {
        if (!window.Boson) window.Boson = {};
        window.Boson.ExchangeState = ExchangeState;
    }
}