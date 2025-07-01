const hre = require("hardhat");
const { getContractAt, provider } = hre.ethers;
const network = hre.network.name;
const { RoleAssignments } = require("./config/role-assignments");
const { readContracts, listAccounts } = require("./util/utils");
const environments = require("../environments");
const Role = require("./domain/Role");

/**
 * Manage roles for access control in the Boson Protocol contract suite.
 *
 * This script:
 *   - is idempotent, i.e., running twice with same assignment config
 *     will result in no state change on the contract
 *
 *   - will operate on the configured role assignments and use the
 *     fewest number of transactions to make granted roles match
 *     the assignments.
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
async function main(env) {
  // Bail now if hardhat network
  if (network === "hardhat") process.exit();

  const chainId = (await provider.getNetwork()).chainId;
  const contractsFile = readContracts(chainId, network, env);

  const divider = "-".repeat(80);
  console.log(`${divider}\nBoson Protocol Contract Suite Role Manager\n${divider}`);
  console.log(`⛓  Network: ${hre.network.name}\n📅 ${new Date()}`);

  // Get the accounts
  const accounts = await listAccounts();
  const admin = accounts[0];
  if (admin) {
    console.log("🔱 Admin account: ", admin);
    console.log(divider);
  } else {
    console.log("❌ Admin account not found");
    process.exit();
  }

  console.log(`🔑 Confirming roles...`);

  const accessControllerInfo = contractsFile.contracts.find((i) => i.name === "AccessController");

  // Get AccessController abstraction
  const accessController = await getContractAt("AccessController", accessControllerInfo.address);

  // Loop through assignments for this network
  const assignments = Object.entries(RoleAssignments[network]);

  for (let i = 0; i < assignments.length; i++) {
    // Get the assignment and break into name / config
    const assignment = assignments[i];
    const [name, config] = assignment;

    console.log(`\n🔍 ${name}`);

    let contractInfo;
    contractInfo = contractsFile.contracts.find((i) => i.name === name);
    config.address = name === "AdminAddress" ? environments[network].adminAddress : contractInfo.address;

    console.log(`   👉 ${config.address}`);

    // Loop through assigned roles for address
    for (let j = 0; j < config.roles.length; j++) {
      // Check if role already assigned
      const role = config.roles[j];
      const hasRole = await accessController.hasRole(role, config.address);

      // Grant role if not already granted
      if (!hasRole) {
        await accessController.grantRole(role, config.address);
      }

      // Report status
      console.log(`   ✅ ${Role[role]} - ${hasRole ? "No change" : "Granted"}`);
    }

    // Make sure previously assigned but now unassigned roles are removed
    const unassigned = Role.Names.filter((name) => !config.roles.includes(Role[name]));

    for (let j = 0; j < unassigned.length; j++) {
      // Check if role currently assigned
      const role = Role[unassigned[j]];
      const hasRole = await accessController.hasRole(role, config.address);

      // Revoke role if previously granted
      if (hasRole) {
        await accessController.revokeRole(role, config.address);
      }

      // Report status
      console.log(`   ❌ ${Role[role]} - ${!hasRole ? "No change" : "Revoked"}`);
    }
  }

  console.log(`\n📋 Roles confirmed.`);
  console.log("\n");
}

exports.manageRoles = main;
