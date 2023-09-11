/**
 * Boson Protocol Domain Enum: SellerUpdateFields
 */
class SellerUpdateFields {}

SellerUpdateFields.Admin = 0;
SellerUpdateFields.Assistant = 1;
SellerUpdateFields.Clerk = 2; // Deprecated
SellerUpdateFields.AuthToken = 3;

SellerUpdateFields.Types = [
  SellerUpdateFields.Admin,
  SellerUpdateFields.Assistant,
  SellerUpdateFields.Clerk,
  SellerUpdateFields.AuthToken,
];

// Export
module.exports = SellerUpdateFields;
