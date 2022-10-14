/**
 * Boson Protocol Domain Enum: SellerFields
 */
class SellerFields {}

SellerFields.Admin = 0;
SellerFields.Operator = 1;
SellerFields.Clerk = 2;
SellerFields.AuthToken = 3;

SellerFields.Types = [SellerFields.None, SellerFields.Custom, SellerFields.Lens, SellerFields.ENS];

// Export
module.exports = SellerFields;
