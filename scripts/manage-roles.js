const hre = require("hardhat");
const ethers = hre.ethers;
const network = hre.network.name;
const { ContractAddresses } = require("./config/contract-addresses");
const { RoleAssignments } = require("./config/role-assignments");
const Role = require("./domain/Role");

/**
 * Manage roles for access control in the Boson Protocol contract suite
 *
 * This script:
 *   - is idempotent, i.e., running twice with same assignment config
 *     will result in no state change on the contract
 *
 *   - will operate on the configured role assignments and use the
 *     fewest number of transactions to make granted roles match
 *     the assignments.
 *
 * Preparation:
 *  1.  Edit scripts/config/role-assignments.js
 *  1a. Add new address / role assignments following existing config
 *  1b. To remove an existing role assignment, delete role from addresses' roles array
 *  1b. If removing all roles from a previously roled address,
 *      - remove roles from addresses' role array but not the address configuration.
 *      = the script will only act on addresses listed in RoleAssignments
 *  2. Run this script with the appropriate npm script in package.json to log the output
 *  3. Save changes to the repo as a record of who has what roles
 */
async function main() {
  // Bail now if local network
  if (network === "hardhat") process.exit();

  const divider = "-".repeat(80);
  console.log(`${divider}\nBoson Protocol Contract Suite Role Manager\n${divider}`);
  console.log(`⛓  Network: ${hre.network.name}\n📅 ${new Date()}`);

  // Get the accounts
  const accounts = await ethers.provider.listAccounts();
  const admin = accounts[0];
  console.log("🔱 Admin account: ", admin ? admin : "not found" && process.exit());
  console.log(divider);

  console.log(`🔑 Confirming roles...`);

  // Get AccessController abstraction
  const accessController = await ethers.getContractAt("AccessController", ContractAddresses[network].AccessController);

  // Loop through assignments for this network
  const assignments = Object.entries(RoleAssignments[network]);
  for (let i = 0; i < assignments.length; i++) {
    // Get the assignment and break into name / config
    const assignment = assignments[i];
    const [name, config] = assignment;
    console.log(`\n🔍 ${name}`);
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

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
