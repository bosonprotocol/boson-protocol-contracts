const ethers = require("ethers");
const keccak256 = ethers.utils.keccak256;
const toUtf8Bytes = ethers.utils.toUtf8Bytes;

/**
 * Boson Protocol Domain Enum: Role
 *
 * See: {BosonTypes.Role}
 */
class Role {}

Role.Names = [
  "ADMIN", // Role Admin
  "PROTOCOL", // Role for facets of the ProtocolDiamond
  "CLIENT", // Role for clients of the ProtocolDiamond
  "UPGRADER", // Role for performing contract and config upgrades
  "FEE_COLLECTOR", // Role for collecting fees from the protocol
];

Role.Names.forEach((roleName) => {
  const hash = keccak256(toUtf8Bytes(roleName));
  Role[roleName] = hash;
  Role[hash] = roleName;
});

// Export
module.exports = Role;
