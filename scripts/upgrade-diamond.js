const hre = require("hardhat");
const ethers = hre.ethers;
const network = hre.network.name;
const { Facets } = require("./config/facet-upgrade");
const { readContracts } = require("./util/utils");
const environments = require("../environments");
const confirmations = network == "hardhat" ? 1 : environments.confirmations;
const tipMultiplier = ethers.BigNumber.from(environments.tipMultiplier);
const tipSuggestion = "1500000000"; // ethers.js always returns this constant, it does not vary per block
const maxPriorityFeePerGas = ethers.BigNumber.from(tipSuggestion).mul(tipMultiplier);
const { deployProtocolHandlerFacets } = require("./util/deploy-protocol-handler-facets.js");
const { FacetCutAction, getSelectors } = require("./util/diamond-utils.js");
const { deploymentComplete, getFees, writeContracts } = require("./util/utils.js");

/**
 * Upgrades facets.
 *
 * TODO:
 * 1. get list of facets to upgrade (either pass in as arguments, or from file)
 * 2. deploy facets ✅
 * 3. update addresses file ✅
 * 4. get list of old selectors on updated facet ✅
 * 5. compare sellectors of new facet and create add/replace/remove methods ✅
 * 6. make diamond cuts ✅
 * 7. make logs
 * 8. check if caller has upgrader role and bail otherwise
 */
async function main() {
  console.log("a");
  // Bail now if hardhat network
  if (network === "hardhat") process.exit();

  const chainId = (await hre.ethers.provider.getNetwork()).chainId;
  const contractsFile = readContracts(chainId, network);
  let contracts = contractsFile.contracts;

  const divider = "-".repeat(80);
  console.log(`${divider}\nBoson Protocol Contract Suite Upgrader\n${divider}`);
  console.log(`⛓  Network: ${hre.network.name}\n📅 ${new Date()}`);

  // Get the accounts
  const accounts = await ethers.provider.listAccounts();
  const admin = accounts[0];
  console.log("🔱 Admin account: ", admin ? admin : "not found" && process.exit());
  console.log(divider);

  const protocolDiamondInfo = contracts.find((i) => i.name === "ProtocolDiamond");

  const diamondLoupe = await ethers.getContractAt("DiamondLoupeFacet", protocolDiamondInfo.address);

  // deploy facets
  // Deploy and cut facets
  const deployedFacets = await deployProtocolHandlerFacets(
    protocolDiamondInfo.address,
    Facets,
    maxPriorityFeePerGas,
    false
  );
  // for (let i = 0; i < deployedFacets.length; i++) {
  //   const deployedFacet = deployedFacets[i];
  //   deploymentComplete(deployedFacet.name, deployedFacet.contract.address, [], contracts);
  // }

  // Cast Diamond to DiamondCutFacet
  const diamondCutFacet = await ethers.getContractAt("DiamondCutFacet", protocolDiamondInfo.address);

  // All handler facets currently have no-arg initializers
  let initFunction = "initialize()";
  let initInterface = new ethers.utils.Interface([`function ${initFunction}`]);
  let callData = initInterface.encodeFunctionData("initialize");

  for (const facet of deployedFacets) {
    // TODO better naming for facet = new, facetInfo = old

    // get currently registered selectors
    const facetInfo = contracts.find((i) => i.name === facet.name);
    const registeredSelectors = await diamondLoupe.facetFunctionSelectors(facetInfo.address);

    // get new selectors from compiled contract
    const newSelectors = getSelectors(facet.contract).remove(["initialize()"]);

    // determine actions to be made
    const replaceSelectors = registeredSelectors.filter((value) => newSelectors.includes(value));
    const removeSelectors = registeredSelectors.filter((value) => !replaceSelectors.includes(value));
    const addSelectors = newSelectors.filter((value) => !replaceSelectors.includes(value));

    console.log("add and replace");
    if (addSelectors.length > 0 || replaceSelectors.length > 0) {
      const newFacetAddress = facet.contract.address;
      let facetCut = [];
      if (addSelectors.length > 0) facetCut.push([newFacetAddress, FacetCutAction.Add, addSelectors]);
      if (replaceSelectors.length > 0) facetCut.push([newFacetAddress, FacetCutAction.Replace, replaceSelectors]);

      const transactionResponse = await diamondCutFacet.diamondCut(
        facetCut,
        newFacetAddress,
        callData,
        await getFees(maxPriorityFeePerGas)
      );
      await transactionResponse.wait(confirmations);
    }

    console.log("remove");
    if (removeSelectors.length > 0) {
      const removeFacetCut = [ethers.constants.AddressZero, FacetCutAction.Remove, removeSelectors];

      const transactionResponse = await diamondCutFacet.diamondCut(
        [removeFacetCut],
        ethers.constants.AddressZero,
        "0x",

        await getFees(maxPriorityFeePerGas)
      );
      await transactionResponse.wait(confirmations);
    }

    // remove old entry from contracts
    contracts = contracts.filter((i) => i.name !== facet.name);
    deploymentComplete(facet.name, facet.contract.address, [], contracts);
  }

  const contractsPath = await writeContracts(contracts);
  console.log(`✅ Contracts written to ${contractsPath}`);

  console.log(`\n📋 Diamond upgraded.`);
  console.log("\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
