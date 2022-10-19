/**
 * Boson Protocol Domain Enum: SellerUpdateFields
 */
class SellerUpdateFields {}

SellerUpdateFields.Admin = 0;
SellerUpdateFields.Operator = 1;
SellerUpdateFields.Clerk = 2;
SellerUpdateFields.AuthToken = 3;

SellerUpdateFields.Types = [
  SellerUpdateFields.Admin,
  SellerUpdateFields.Operator,
  SellerUpdateFields.Clerk,
  SellerUpdateFields.AuthToken,
];

// Export
module.exports = SellerUpdateFields;
