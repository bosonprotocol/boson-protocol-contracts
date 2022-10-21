const hre = require("hardhat");
const ethers = hre.ethers;
const network = hre.network.name;
const { Facets } = require("./config/facet-upgrade");
const environments = require("../environments");
const confirmations = network == "hardhat" ? 1 : environments.confirmations;
const tipMultiplier = ethers.BigNumber.from(environments.tipMultiplier);
const tipSuggestion = "1500000000"; // ethers.js always returns this constant, it does not vary per block
const maxPriorityFeePerGas = ethers.BigNumber.from(tipSuggestion).mul(tipMultiplier);
const { deployProtocolHandlerFacets } = require("./util/deploy-protocol-handler-facets.js");
const { FacetCutAction, getSelectors, removeSelectors } = require("./util/diamond-utils.js");
const { deploymentComplete, getFees, readContracts, writeContracts } = require("./util/utils.js");
const { getInterfaceIds, interfaceImplementers } = require("./config/supported-interfaces.js");
const Role = require("./domain/Role");
const packageFile = require("../package.json");
const readline = require("readline");
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

/**
 * Upgrades or removes existing facets, or adds new facets.
 *
 * Prerequisite:
 * - Admin must have UPGRADER role. Use `manage-roles.js` to grant it.
 *
 * Process:
 *  1.  Edit scripts/config/facet-upgrade.js.
 *  1a. Provide a list of facets that needs to be upgraded (field "addOrUpgrade") or removed completely (field "remove")
 *  1b. Optionally you can specify which selectors should be ignored (field "skip"). You don't have to specify "initialize()" since it's ignored by default
 *  2. Update protocol version in package.json. If not, script will prompt you to confirm that version remains unchanged.
 *  2. Run the appropriate npm script in package.json to upgrade facets for a given network
 *  3. Save changes to the repo as a record of what was upgraded
 */
async function main() {
  // Bail now if hardhat network
  if (network === "hardhat") process.exit();

  const chainId = (await ethers.provider.getNetwork()).chainId;
  const contractsFile = readContracts(chainId, network);
  let contracts = contractsFile.contracts;
  const interfaceIds = await getInterfaceIds();
  const interfaceIdFromFacetName = (facetName) => interfaceIds[interfaceImplementers[facetName]];

  const divider = "-".repeat(80);
  console.log(`${divider}\nBoson Protocol Contract Suite Upgrader\n${divider}`);
  console.log(`⛓  Network: ${network}\n📅 ${new Date()}`);

  // Check that package.json version was updated
  if (packageFile.version == contractsFile.protocolVersion) {
    const answer = await new Promise((resolve) => {
      rl.question("Protocol version has not been updated. Proceed anyway? (y/n) ", resolve);
    });
    switch (answer.toLowerCase()) {
      case "y":
      case "yes":
        break;
      case "n":
      case "no":
      default:
        process.exit(1);
    }
  }

  // Get the accounts
  const adminAddress = environments[network].adminAddress;

  // If admin address is unspecified, exit the process
  if (adminAddress == ethers.constants.AddressZero || !adminAddress) {
    console.log("Admin address must not be zero address");
    process.exit(1);
  }

  // Get list of accounts managed by node
  const nodeAccountList = (await ethers.provider.listAccounts()).map((address) => address.toLowerCase());

  if (nodeAccountList.includes(adminAddress.toLowerCase())) {
    console.log("🔱 Admin account: ", adminAddress);
  } else {
    console.log("🔱 Admin account not found");
    process.exit(1);
  }
  console.log(divider);

  // Get signer for admin address
  const adminSigner = await ethers.getSigner(adminAddress);

  // Get addresses of currently deployed contracts
  const protocolAddress = contracts.find((c) => c.name === "ProtocolDiamond").address;
  const accessControllerAddress = contracts.find((c) => c.name === "AccessController").address;

  if (!protocolAddress) {
    return addressNotFound("ProtocolDiamond");
  }

  if (!accessControllerAddress) {
    return addressNotFound("AccessController");
  }

  // Get AccessController abstraction
  const accessController = await ethers.getContractAt("AccessController", accessControllerAddress);

  // Check that caller has upgrader role.
  const hasRole = await accessController.hasRole(Role.UPGRADER, adminAddress);
  if (!hasRole) {
    console.log("Admin address does not have UPGRADER role");
    process.exit(1);
  }

  // Deploy new facets
  const deployedFacets = await deployProtocolHandlerFacets(
    protocolAddress,
    Facets.addOrUpgrade,
    maxPriorityFeePerGas,
    false
  );

  // Cast Diamond to DiamondCutFacet, DiamondLoupeFacet and IERC165Extended
  const diamondCutFacet = await ethers.getContractAt("DiamondCutFacet", protocolAddress);
  const diamondLoupe = await ethers.getContractAt("DiamondLoupeFacet", protocolAddress);
  const erc165Extended = await ethers.getContractAt("IERC165Extended", protocolAddress);

  // All handler facets currently have no-arg initializers
  let initFunction = "initialize()";
  let initInterface = new ethers.utils.Interface([`function ${initFunction}`]);
  let callData = initInterface.encodeFunctionData("initialize");

  // manage new or upgraded facets
  for (const newFacet of deployedFacets) {
    console.log(`\n📋 Facet: ${newFacet.name}`);

    // Get currently registered selectors
    const oldFacet = contracts.find((i) => i.name === newFacet.name);
    let registeredSelectors;
    if (oldFacet) {
      // Facet already exists and is only upgraded
      registeredSelectors = await diamondLoupe.facetFunctionSelectors(oldFacet.address);
    } else {
      // Facet is new
      registeredSelectors = [];
    }

    // Remove old entry from contracts
    contracts = contracts.filter((i) => i.name !== newFacet.name);
    const newFacetInterfaceId = interfaceIdFromFacetName(newFacet.name);
    deploymentComplete(newFacet.name, newFacet.contract.address, [], newFacetInterfaceId, contracts);

    // Get new selectors from compiled contract
    const selectors = getSelectors(newFacet.contract, true);
    const newSelectors = selectors.selectors.remove([initFunction]);

    // Determine actions to be made
    let selectorsToReplace = registeredSelectors.filter((value) => newSelectors.includes(value)); // intersection of old and new selectors
    let selectorsToRemove = registeredSelectors.filter((value) => !selectorsToReplace.includes(value)); // unique old selectors
    let selectorsToAdd = newSelectors.filter((value) => !selectorsToReplace.includes(value)); // unique new selectors

    // Skip selectors if set in config
    let selectorsToSkip = Facets.skip[newFacet.name] ? Facets.skip[newFacet.name] : [];
    selectorsToReplace = removeSelectors(selectorsToReplace, selectorsToSkip);
    selectorsToRemove = removeSelectors(selectorsToRemove, selectorsToSkip);
    selectorsToAdd = removeSelectors(selectorsToAdd, selectorsToSkip);

    // Check if selectors that are being added are not registered yet on some other facet
    // If collision is found, user must choose to either (s)kip it or (r)eplace it.
    for (const selectorToAdd of selectorsToAdd) {
      const existingFacetAddress = await diamondLoupe.facetAddress(selectorToAdd);
      if (existingFacetAddress != ethers.constants.AddressZero) {
        // Selector exist on some other facet
        const selectorName = selectors.signatureToNameMapping[selectorToAdd];
        const prompt = `Selector ${selectorName} is already registered on facet ${existingFacetAddress}. Do you want to (r)eplace or (s)kip it? `;
        const answer = await getUserResponse(prompt, ["r", "s"]);
        if (answer == "r") {
          // User chose to replace
          selectorsToReplace.push(selectorToAdd);
        } else {
          // User chose to skip
          selectorsToSkip.push(selectorName);
        }
        // In any case, remove it from selectorsToAdd
        selectorsToAdd = removeSelectors(selectorsToAdd, [selectorName]);
      }
    }

    // Adding and replacing are done in one diamond cut
    if (selectorsToAdd.length > 0 || selectorsToReplace.length > 0) {
      const newFacetAddress = newFacet.contract.address;
      let facetCut = [];
      if (selectorsToAdd.length > 0) facetCut.push([newFacetAddress, FacetCutAction.Add, selectorsToAdd]);
      if (selectorsToReplace.length > 0) facetCut.push([newFacetAddress, FacetCutAction.Replace, selectorsToReplace]);

      // Diamond cut
      const transactionResponse = await diamondCutFacet
        .connect(adminSigner)
        .diamondCut(facetCut, newFacetAddress, callData, await getFees(maxPriorityFeePerGas));
      await transactionResponse.wait(confirmations);
    }

    // Removing is done in a separate diamond cut
    if (selectorsToRemove.length > 0) {
      const removeFacetCut = [ethers.constants.AddressZero, FacetCutAction.Remove, selectorsToRemove];

      // Diamond cut
      const transactionResponse = await diamondCutFacet
        .connect(adminSigner)
        .diamondCut([removeFacetCut], ethers.constants.AddressZero, "0x", await getFees(maxPriorityFeePerGas));
      await transactionResponse.wait(confirmations);
    }

    // Logs
    console.log(`💎 Removed selectors:\n\t${selectorsToRemove.join("\n\t")}`);
    console.log(
      `💎 Replaced selectors:\n\t${selectorsToReplace
        .map((selector) => `${selector}: ${selectors.signatureToNameMapping[selector]}`)
        .join("\n\t")}`
    );
    console.log(
      `💎 Added selectors:\n\t${selectorsToAdd
        .map((selector) => `${selector}: ${selectors.signatureToNameMapping[selector]}`)
        .join("\n\t")}`
    );
    console.log(`❌ Skipped selectors:\n\t${selectorsToSkip.join("\n\t")}`);

    // If something was added or removed, support interface for old interface is not valid anymore
    const erc165 = await ethers.getContractAt("IERC165", protocolAddress);
    if (oldFacet && (selectorsToAdd.length > 0 || selectorsToRemove.length > 0)) {
      if (!oldFacet.interfaceId) {
        console.log(
          `Could not find interface id for old facet ${oldFacet.name}.\nYou might need to remove its interfaceId from "supportsInterface" manually.`
        );
      } else {
        // Remove from smart contract
        await erc165Extended
          .connect(adminSigner)
          .removeSupportedInterface(oldFacet.interfaceId, await getFees(maxPriorityFeePerGas));

        // Check if interface was shared across other facets and update contracts info
        contracts = contracts.map((entry) => {
          if (entry.interfaceId == oldFacet.interfaceId) {
            entry.interfaceId = newFacetInterfaceId;
          }
          return entry;
        });

        console.log(`Removed supported interface ${oldFacet.interfaceId} from supported interfaces.`);
      }
    }

    // Check if new facet registered its interface. If not, register it.
    const support = await erc165.supportsInterface(newFacetInterfaceId);
    if (!support) {
      await erc165Extended
        .connect(adminSigner)
        .addSupportedInterface(newFacetInterfaceId, await getFees(maxPriorityFeePerGas));
      console.log(`Added new interfaceId ${newFacetInterfaceId} to supported interfaces.`);
    }
  }

  // manage facets that are being completely removed
  for (const facetToRemove of Facets.remove) {
    // Get currently registered selectors
    const oldFacet = contracts.find((i) => i.name === facetToRemove);

    let registeredSelectors;
    if (oldFacet) {
      // Facet already exists and is only upgraded
      registeredSelectors = await diamondLoupe.facetFunctionSelectors(oldFacet.address);
    } else {
      // Facet does not exist, skip next steps
      continue;
    }
    console.log(`\n📋💀 Facet removal: ${facetToRemove}`);

    // Remove old entry from contracts
    contracts = contracts.filter((i) => i.name !== facetToRemove);

    // All selectors must be removed
    let selectorsToRemove = registeredSelectors; // all selectors must be removed

    // Removing the selectors
    const removeFacetCut = [ethers.constants.AddressZero, FacetCutAction.Remove, selectorsToRemove];

    // Diamond cut
    const transactionResponse = await diamondCutFacet
      .connect(adminSigner)
      .diamondCut([removeFacetCut], ethers.constants.AddressZero, "0x", await getFees(maxPriorityFeePerGas));
    await transactionResponse.wait(confirmations);

    // Logs
    console.log(`💎 Removed selectors:\n\t${selectorsToRemove.join("\n\t")}`);

    // Remove support for old interface
    if (!oldFacet.interfaceId) {
      console.log(
        `Could not find interface id for old facet ${oldFacet.name}.\nYou might need to remove its interfaceId from "supportsInterface" manually.`
      );
    } else {
      // Remove from smart contract
      await erc165Extended
        .connect(adminSigner)
        .removeSupportedInterface(oldFacet.interfaceId, await getFees(maxPriorityFeePerGas));

      // Check if interface was shared across other facets and update contracts info
      contracts = contracts.map((entry) => {
        if (entry.interfaceId == oldFacet.interfaceId) {
          entry.interfaceId = "";
        }
        return entry;
      });

      console.log(`Removed supported interface ${oldFacet.interfaceId} from supported interfaces.`);
    }
  }

  const contractsPath = await writeContracts(contracts);
  console.log(divider);
  console.log(`✅ Contracts written to ${contractsPath}`);
  console.log(divider);

  console.log(`\n📋 Diamond upgraded.`);
  console.log("\n");
}

const addressNotFound = (address) => {
  console.log(`${address} address not found for network ${network}`);
  process.exit(1);
};

async function getUserResponse(question, validResponses) {
  const answer = await new Promise((resolve) => {
    rl.question(question, resolve);
  });
  if (validResponses.includes(answer)) {
    return answer;
  } else {
    console.log("Invalid response!");
    return await getUserResponse(question, validResponses);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
