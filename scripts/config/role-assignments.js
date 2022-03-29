const { ContractAddresses } = require("./contract-addresses");
const Role = require("../domain/Role");

/**
 * Role assignments for access control in the Boson Protocol contract suite
 *
 * Process:
 *  1.  Edit scripts/config/role-assignments.js
 *  1a. Add new address / role assignments following existing config
 *  1b. Remove an existing role assignment, delete role from addresses' role array
 *  1b. If removing all roles from a previously roled-address,
 *      - remove roles from addresses' role array but not address configuration.
 *      = the script will only act on addresses listed in RoleAssignments
 *  2. Run the appropriate npm script in package.json to manage roles for a given network
 *  3. Save changes to the repo as a record of who has what roles
 */
exports.RoleAssignments = {
  ropsten: {
    "Deployer / role admin address": {
      address: "",
      roles: [Role.ADMIN, Role.UPGRADER],
    },

    // For minting vouchers
    "ProtocolDiamond contract": {
      address: ContractAddresses.ropsten.ProtocolDiamond,
      roles: [Role.PROTOCOL],
    },
  },

  mainnet: {
    "Deployer / role admin address": {
      address: "",
      roles: [Role.ADMIN, Role.UPGRADER],
    },

    // For minting vouchers
    "ProtocolDiamond contract": {
      address: ContractAddresses.mainnet.ProtocolDiamond,
      roles: [Role.PROTOCOL],
    },
  },
};
