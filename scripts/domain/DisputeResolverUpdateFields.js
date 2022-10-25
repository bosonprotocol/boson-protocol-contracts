/**
 * Boson Protocol Domain Enum: DisputeResolverUpdateFields
 */
class DisputeResolverUpdateFields {}

DisputeResolverUpdateFields.Admin = 0;
DisputeResolverUpdateFields.Operator = 1;
DisputeResolverUpdateFields.Clerk = 2;

DisputeResolverUpdateFields.Types = [
  DisputeResolverUpdateFields.Admin,
  DisputeResolverUpdateFields.Operator,
  DisputeResolverUpdateFields.Clerk,
];

// Export
module.exports = DisputeResolverUpdateFields;
