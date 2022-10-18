/**
 * Boson Protocol Domain Enum: DisputeResolverUpdateFields
 */
class DisputeResolverUpdateFields { }

DisputeResolverUpdateFields.Admin = 0;
DisputeResolverUpdateFields.Operator = 1;
DisputeResolverUpdateFields.Clerk = 2;
DisputeResolverUpdateFields.AuthToken = 3;

DisputeResolverUpdateFields.Types = [
  DisputeResolverUpdateFields.Admin,
  DisputeResolverUpdateFields.Operator,
  DisputeResolverUpdateFields.Clerk,
  DisputeResolverUpdateFields.AuthToken,
];

// Export
module.exports = DisputeResolverUpdateFields;
