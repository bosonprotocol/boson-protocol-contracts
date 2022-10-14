/**
 * Boson Protocol Domain Enum: SellerFields
 */
class SellerFields {}

SellerFields.Admin = 0;
SellerFields.Operator = 1;
SellerFields.Clerk = 2;
SellerFields.AuthToken = 3;

SellerFields.Types = [SellerFields.Admin, SellerFields.Operator, SellerFields.Clerk, SellerFields.AuthToken];

// Export
module.exports = SellerFields;
