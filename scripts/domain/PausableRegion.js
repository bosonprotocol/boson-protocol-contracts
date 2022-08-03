/**
 * Boson Protocol Domain Enum: PausableRegion
 */
class PausableRegion {}

PausableRegion.Config = 0;
PausableRegion.Offers = 1;
PausableRegion.Twins = 2;
PausableRegion.Bundles = 3;
PausableRegion.Groups = 4;
PausableRegion.Sellers = 5;
PausableRegion.Buyers = 6;
PausableRegion.DisputeResolvers = 7;
PausableRegion.Agents = 8;
PausableRegion.Exchanges = 9;
PausableRegion.Disputes = 10;
PausableRegion.Funds = 11;
PausableRegion.Orchestration = 11;

PausableRegion.Regions = [
  PausableRegion.Config,
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
