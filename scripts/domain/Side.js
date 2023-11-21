/**
 * Boson Protocol Domain Enum: Side
 */
class Side {}

Side.Ask = 0;
Side.Bid = 1;
Side.Wrapper = 2;

Side.Types = [Side.Ask, Side.Bid, Side.Wrapper];

// Export
module.exports = Side;
