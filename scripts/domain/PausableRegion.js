/**
 * Boson Protocol Domain Enum: PausableRegion
 */
class PausableRegion {}

PausableRegion.Offers = 0;
PausableRegion.Twins = 1;
PausableRegion.Bundles = 2;
PausableRegion.Groups = 3;
PausableRegion.Sellers = 4;
PausableRegion.Buyers = 5;
PausableRegion.DisputeResolvers = 6;
PausableRegion.Agents = 7;
PausableRegion.Exchanges = 8;
PausableRegion.Disputes = 9;
PausableRegion.Funds = 10;
PausableRegion.Orchestration = 11;

PausableRegion.Regions = [
  PausableRegion.Offers,
  PausableRegion.Twins,
  PausableRegion.Bundles,
  PausableRegion.Groups,
  PausableRegion.Sellers,
  PausableRegion.Buyers,
  PausableRegion.DisputeResolvers,
  PausableRegion.Agents,
  PausableRegion.Exchanges,
  PausableRegion.Disputes,
  PausableRegion.Funds,
  PausableRegion.Orchestration,
];

// Export
module.exports = PausableRegion;
