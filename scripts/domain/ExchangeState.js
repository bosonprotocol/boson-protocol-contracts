/**
 * Boson Protocol Domain Enum: ExchangeState
 */
class ExchangeState {}

ExchangeState.Committed = 0;
ExchangeState.Revoked = 1;
ExchangeState.Canceled = 2;
ExchangeState.Redeemed = 3;
ExchangeState.Completed = 4;
ExchangeState.Disputed = 5;

ExchangeState.Modes = [
  ExchangeState.Committed,
  ExchangeState.Revoked,
  ExchangeState.Canceled,
  ExchangeState.Redeemed,
  ExchangeState.Completed,
  ExchangeState.Disputed,
];

// Export
module.exports = ExchangeState;
