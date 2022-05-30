/**
 * Boson Protocol Domain Enum: DisputeDate
 */
class DisputeDate {}

DisputeDate.Disputed = 0;
DisputeDate.Escalated = 1;
DisputeDate.Finalized = 2;
DisputeDate.Timeout = 3;

DisputeDate.Modes = [DisputeDate.Disputed, DisputeDate.Escalated, DisputeDate.Finalized, DisputeDate.Timeout];

// Export
module.exports = DisputeDate;
