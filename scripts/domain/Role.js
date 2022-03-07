const ethers = require('ethers');
const keccak256 = ethers.utils.keccak256;
const toUtf8Bytes = ethers.utils.toUtf8Bytes;
const NODE = (typeof module !== 'undefined' && typeof module.exports !== 'undefined');

/**
 * Boson Protocol Domain Enum: Role
 *
 * See: {BosonTypes.Role}
 */
class Role {}

Role.Names = [
    "ADMIN",           // Role Admin
    "PROTOCOL",        // Role for facets of the ProtocolDiamond
    "CLIENT",          // Role for clients of the ProtocolDiamond
    "UPGRADER"         // Role for performing contract and config upgrades
]

Role.Names.forEach( roleName => {
    const hash     = keccak256(toUtf8Bytes(roleName));
    Role[roleName] = hash;
    Role[hash]     = roleName;
})

// Export
if (NODE) {
    module.exports = Role;
} else {
    // Namespace the export in browsers
    if (window) {
        if (!window.Boson) window.Boson = {};
        window.Boson.Role = Role;
    }
}