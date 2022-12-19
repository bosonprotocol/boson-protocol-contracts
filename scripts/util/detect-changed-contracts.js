const hre = require("hardhat");
const shell = require("shelljs");
const { getInterfaceIds, interfaceImplementers } = require("../config/supported-interfaces.js");

const prefix = "contracts/";

// folders to check. Folder names are relative to "contracts"
const sources = ["diamond", "protocol/facets", "protocol/clients"];

/**
Detects is contract changed between two versions

1. Checkouts the branch you want to compare to
2  Compiles the contracts, stores bytecodes
3. Checkouts the branch you want to compare 
4. Compiles the contracts, stores bytecodes
5. Compares bytecodes. If bytecode is different, or it does not exists in either branch, it is considered changed

@param {string} referenceCommit - commit/tag/branch to compare to
@param {string} targetCommit - commit/tag/branch to compare. If not provided, it will compare to current branch.
*/
async function detectChangedContract(referenceCommit, targetCommit) {
  // By default compiler adds metadata ipfs hash to the end of bytecode.
  // Even if contract is not changed, the metadata hash can be different, which makes the bytecode different and hard to detect if change has happened.
  // To make comparison clean, we remove the metadata hash from the bytecode.
  for (const compiler of hre.config.solidity.compilers) {
    // This setting is solidity v0.8.9 style
    // versions >= 0.8.18 use compiler.settings["metadata"] = {appendCBOR: false}
    compiler.settings["metadata"] = { bytecodeHash: "none" };
  }

  // Check if reference commit is provided
  if (!referenceCommit) {
    console.log("Please provide a reference commit");
    process.exit(1);
  }

  // Checkout old version
  console.log(`Checking out version ${referenceCommit}`);
  shell.exec(`git checkout ${referenceCommit} contracts`);

  // Compile old version
  await hre.run("clean");
  await hre.run("compile");

  // Get reference bytecodes
  const referenceBytecodes = await getBytecodes();
  const referenceInterfaceIds = await getInterfaceIds();

  // Checkout new version
  targetCommit = targetCommit || "HEAD";
  console.log(`Checking out version ${targetCommit}`);
  shell.exec(`git checkout ${targetCommit} contracts`);

  // Compile new version
  await hre.run("clean");
  await hre.run("compile");

  // get target bytecodes
  const targetBytecodes = await getBytecodes();
  const targetInterfaceIds = await getInterfaceIds();

  // Compare bytecodes
  const referenceContractList = Object.keys(referenceBytecodes);
  const targetContractList = Object.keys(targetBytecodes);

  const overlappingContracts = referenceContractList.filter((contract) => targetContractList.includes(contract));
  const removedContracts = referenceContractList.filter((contract) => !overlappingContracts.includes(contract));
  const newContracts = targetContractList.filter((contract) => !overlappingContracts.includes(contract));

  // Removed and new contracts are considered changed by default
  // Overlapping contracts are only considered changed if the bytecode is different
  let changedContracts = [];
  for (const contract of overlappingContracts) {
    if (referenceBytecodes[contract] != targetBytecodes[contract]) {
      const interfaceImplementer = interfaceImplementers[contract];
      const interfaceChange = referenceInterfaceIds[interfaceImplementer] != targetInterfaceIds[interfaceImplementer];
      changedContracts.push({ name: contract, interfaceChange });
    }
  }

  // Print results
  if (removedContracts.length > 0) {
    console.log("REMOVED CONTRACTS");
    console.table(removedContracts);
  }

  if (newContracts.length > 0) {
    console.log("NEW CONTRACTS");
    console.table(newContracts);
  }

  if (changedContracts.length > 0) {
    console.log("CHANGED CONTRACTS");
    console.table(changedContracts);
  }

  console.log(`Total removed contracts: ${removedContracts.length}`);
  console.log(`Total new contracts: ${newContracts.length}`);
  console.log(`Total changed contracts: ${changedContracts.length}`);

  // Checkout back to original branch
  shell.exec(`git checkout HEAD contracts`);
}

async function getBytecodes() {
  // Get build info
  const contractNames = await hre.artifacts.getAllFullyQualifiedNames();

  let byteCodes = {};
  for (let contractName of contractNames) {
    const [source, name] = contractName.split(":");

    // Skip contracts that are not in the source folders
    if (!sources.some((s) => source.startsWith(`${prefix}${s}`))) continue;

    // Abstract contracts do not have bytecode, and factory creation fails. Skip them.
    try {
      const contract = await hre.ethers.getContractFactory(name);

      // Store the bytecode
      byteCodes[name] = contract.bytecode;
    } catch {}
  }

  return byteCodes;
}

exports.detectChangedContract = detectChangedContract;
