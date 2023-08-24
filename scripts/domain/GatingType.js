/**
 * Boson Protocol Domain Enum: GatingType
 */
class GatingType {}

GatingType.PerAddress = 0;
GatingType.PerTokenId = 1;

GatingType.Types = [GatingType.PerAddress, GatingType.PerTokenId];

// Export
module.exports = GatingType;
