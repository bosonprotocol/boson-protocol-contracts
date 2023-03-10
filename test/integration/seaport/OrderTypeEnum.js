/**
 * Seaport Domain Enum: OrderType
 */
class OrderType {}

OrderType.FULL_OPEN = 0;
OrderType.PARTIAL_OPEN = 1;
OrderType.FULL_RESTRICTED = 2;
OrderType.PARTIAL_RESTRICTED = 3;
OrderType.CONTRACT = 4;

OrderType.Types = [
  OrderType.FULL_OPEN,
  OrderType.PARTIAL_OPEN,
  OrderType.FULL_RESTRICTED,
  OrderType.PARTIAL_RESTRICTED,
  OrderType.CONTRACT,
];

// Export
module.exports = OrderType;
