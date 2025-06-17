const shell = require("shelljs");

const environments = require("../../environments");
const tipMultiplier = BigInt(environments.tipMultiplier);
const tipSuggestion = 1500000000n; // js always returns this constant, it does not vary per block
const maxPriorityFeePerGas = tipSuggestion + tipMultiplier;
const { readContracts, getFees, checkRole, writeContracts } = require("../util/utils.js");
const hre = require("hardhat");
const ethers = hre.ethers;
const { getContractAt, getSigners, encodeBytes32String } = ethers;
const network = hre.network.name;
const tag = "v2.4.1";
const version = "2.4.1";
const { META_TRANSACTION_FORWARDER } = require("../config/client-upgrade");
const confirmations = hre.network.name == "hardhat" ? 1 : environments.confirmations;

async function migrate(env) {
  console.log(`Migration ${tag} started`);

  try {
    if (env !== "upgrade-test") {
      console.log("Removing any local changes before upgrading");
      shell.exec(`git reset @{u}`);
      const statusOutput = shell.exec("git status -s -uno scripts package.json");

      if (statusOutput.stdout) {
        throw new Error("Local changes found. Please stash them before upgrading");
      }
    }

    const { chainId } = await ethers.provider.getNetwork();
    const contractsFile = readContracts(chainId, network, env);

    if (contractsFile?.protocolVersion !== "2.4.0") {
      throw new Error("Current contract version must be 2.4.0");
    }

    console.log(`Checking out contracts on version ${tag}`);
    shell.exec(`rm -rf contracts/*`);
    shell.exec(`git checkout ${tag} contracts package.json package-lock.json`);

    shell.exec(`git checkout HEAD scripts`);

    console.log("Installing dependencies");
    shell.exec(`npm install`);

    console.log("Compiling contracts");
    await recompileContracts();

    let contracts = contractsFile?.contracts;
    const signer = (await getSigners())[0].address;
    // Check if admin has UPGRADER role
    checkRole(contracts, "UPGRADER", signer);

    const protocolAddress = contracts.find((c) => c.name === "ProtocolDiamond")?.address;
    const initializationFacetAddress = contracts.find((c) => c.name === "ProtocolInitializationHandlerFacet")?.address;

    console.log("Update protocol version");
    const diamondCutFacet = await getContractAt("DiamondCutFacet", protocolAddress);
    const protocolInitializationFacet = await getContractAt("ProtocolInitializationHandlerFacet", protocolAddress);
    const versionBytes32 = encodeBytes32String(version);
    const initializationData = protocolInitializationFacet.interface.encodeFunctionData("initialize", [
      versionBytes32,
      [],
      [],
      true,
      "0x",
      [],
      [],
    ]);

    const tx = await diamondCutFacet.diamondCut(
      [],
      initializationFacetAddress,
      initializationData,
      await getFees(maxPriorityFeePerGas)
    );
    await tx.wait(confirmations);

    // Update version in contracts file
    const newVersion = (await protocolInitializationFacet.getVersion()).replace(/\0/g, "");

    console.log(`\n📋 New version: ${newVersion}`);

    const contractsPath = await writeContracts(contracts, env, newVersion);
    console.log(`✅ Contracts written to ${contractsPath}`);

    console.log("Executing upgrade clients script");

    const clientConfig = {
      META_TRANSACTION_FORWARDER,
    };

    // Upgrade clients
    await hre.run("upgrade-clients", {
      env,
      clientConfig: JSON.stringify(clientConfig),
      newVersion: version,
    });

    shell.exec(`git checkout HEAD`);
    shell.exec(`git reset HEAD`);
    console.log(`Migration ${tag} completed`);
  } catch (e) {
    console.error(e);
    shell.exec(`git checkout HEAD`);
    shell.exec(`git reset HEAD`);
    throw `Migration failed with: ${e}`;
  }
}

async function recompileContracts() {
  await hre.run("clean");
  // If some contract was removed, compilation succeeds, but afterwards it falsely reports missing artifacts
  // This is a workaround to ignore the error
  try {
    await hre.run("compile");
  } catch {}
}

exports.migrate = migrate;
