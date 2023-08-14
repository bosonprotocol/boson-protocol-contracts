/**
 * Boson Protocol Domain Enum: DisputeResolverUpdateFields
 */
class DisputeResolverUpdateFields {}

DisputeResolverUpdateFields.Admin = 0;
DisputeResolverUpdateFields.Assistant = 1;
DisputeResolverUpdateFields.Clerk = 2; // NB: deprecated

DisputeResolverUpdateFields.Types = [
  DisputeResolverUpdateFields.Admin,
  DisputeResolverUpdateFields.Assistant,
  DisputeResolverUpdateFields.Clerk, // NB: deprecated
];

// Export
module.exports = DisputeResolverUpdateFields;
