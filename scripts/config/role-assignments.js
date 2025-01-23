const Role = require("../domain/Role");

/**
 * Role assignments for access control in the Boson Protocol contract suite
 *
 * Process:
 *  1.  Edit scripts/config/role-assignments.js. Addresses will be pulled from /addresses/<chainId>-<network>.json
 *  1a. Add role assignments following existing config
 *  1b. To remove an existing role assignment, delete role from entry's role array
 *  1b. If removing all roles from a previously-roled entry,
 *      - Remove roles from an entry's role array. Do not remove the entry's config from this file.
 *      - The script will only act on entries listed in RoleAssignments
 *  2. Run the appropriate npm script in package.json to manage roles for a given network
 *  3. Save changes to the repo as a record of who has what roles
 */
exports.RoleAssignments = {
  mumbai: {
    AdminAddress: {
      // do not change name
      roles: [Role.ADMIN, Role.UPGRADER, Role.PAUSER],
    },

    // For minting vouchers
    ProtocolDiamond: {
      // contract name must match name in /addresses/<chainId>-<network>.json
      roles: [Role.PROTOCOL],
    },
  },

  amoy: {
    AdminAddress: {
      // do not change name
      roles: [Role.ADMIN, Role.UPGRADER, Role.PAUSER],
    },

    // For minting vouchers
    ProtocolDiamond: {
      // contract name must match name in /addresses/<chainId>-<network>.json
      roles: [Role.PROTOCOL],
    },
  },

  polygon: {
    AdminAddress: {
      // do not change name
      roles: [Role.ADMIN, Role.UPGRADER],
    },

    // For minting vouchers
    ProtocolDiamond: {
      // contract name must match name in /addresses/<chainId>-<network>.json
      roles: [Role.PROTOCOL],
    },
  },

  mainnet: {
    AdminAddress: {
      // do not change name
      roles: [Role.ADMIN, Role.UPGRADER],
    },

    // For minting vouchers
    ProtocolDiamond: {
      // contract name must match name in /addresses/<chainId>-<network>.json
      roles: [Role.PROTOCOL],
    },
  },

  sepolia: {
    AdminAddress: {
      // do not change name
      roles: [Role.ADMIN, Role.UPGRADER, Role.PAUSER],
    },

    // For minting vouchers
    ProtocolDiamond: {
      // contract name must match name in /addresses/<chainId>-<network>.json
      roles: [Role.PROTOCOL],
    },
  },

  baseSepolia: {
    AdminAddress: {
      // do not change name
      roles: [Role.ADMIN, Role.UPGRADER, Role.PAUSER],
    },

    // For minting vouchers
    ProtocolDiamond: {
      // contract name must match name in /addresses/<chainId>-<network>.json
      roles: [Role.PROTOCOL],
    },
  },

  test: {
    AdminAddress: {
      // do not change name
      roles: [Role.ADMIN, Role.UPGRADER],
    },

    // For minting vouchers
    ProtocolDiamond: {
      // contract name must match name in /addresses/<chainId>-<network>.json
      roles: [Role.PROTOCOL],
    },
  },

  localhost: {
    AdminAddress: {
      // do not change name
      roles: [Role.ADMIN, Role.UPGRADER, Role.PAUSER],
    },

    // For minting vouchers
    ProtocolDiamond: {
      // contract name must match name in /addresses/<chainId>-<network>.json
      roles: [Role.PROTOCOL],
    },
  },
};
