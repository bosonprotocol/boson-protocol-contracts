const environments = require("../environments");
const hre = require("hardhat");
const ethers = hre.ethers;
const network = hre.network.name;
let gasLimit;
const confirmations = environments.confirmations;

const protocolConfig = require("./config/protocol-parameters");
const authTokenAddresses = require("./config/auth-token-addresses");

const Role = require("./domain/Role");
const { deployProtocolDiamond } = require("./util/deploy-protocol-diamond.js");
const { deployProtocolClients } = require("./util/deploy-protocol-clients.js");
const { deployProtocolConfigFacet } = require("./util/deploy-protocol-config-facet.js");
const { deployProtocolHandlerFacets } = require("./util/deploy-protocol-handler-facets.js");
const { verifyOnBlockExplorer, verifyOnTestEnv } = require("./util/report-verify-deployments");
const { delay, deploymentComplete, writeContracts } = require("./util/utils");
const AuthTokenType = require("../scripts/domain/AuthTokenType");

/**
 * Deploy Boson Protocol V2 contract suite
 *
 * Running with the appropriate npm script in package.json:
 * `npm run deploy-suite:local`
 *
 * Running with hardhat
 * `npx hardhat run --network hardhat scripts/deploy-suite.js`
 */

/**
 * Get the configuration data to be passed to the ConfigHandlerFacet initializer
 * @returns {{tokenAddress: string, treasuryAddress: string, voucherAddress: string, feePercentage: string, maxOffersPerGroup: string, maxTwinsPerBundle: string, maxOffersPerBundle: string}}
 */
function getConfig() {
  return [
    {
      token: protocolConfig.TOKEN[network],
      treasury: protocolConfig.TREASURY[network],
      voucherBeacon: protocolConfig.BEACON[network],
      beaconProxy: protocolConfig.BEACON_PROXY[network],
    },
    protocolConfig.limits,
    protocolConfig.fees,
  ];
}

/**
 * Get the contract addresses for supported NFT Auth token contracts
 * @returns {lensAddress: string, ensAddress: string}
 */
function getAuthTokenContracts() {
  return { lensAddress: authTokenAddresses.LENS[network], ensAddress: authTokenAddresses.ENS[network] };
}

/**
 * Get a list of no-arg initializer facet names to be cut into the Diamond
 */
function getNoArgFacetNames() {
  return [
    "AccountHandlerFacet",
    "SellerHandlerFacet",
    "BuyerHandlerFacet",
    "DisputeResolverHandlerFacet",
    "AgentHandlerFacet",
    "BundleHandlerFacet",
    "DisputeHandlerFacet",
    "ExchangeHandlerFacet",
    "FundsHandlerFacet",
    "GroupHandlerFacet",
    "MetaTransactionsHandlerFacet",
    "OfferHandlerFacet",
    "OrchestrationHandlerFacet",
    "TwinHandlerFacet",
    "PauseHandlerFacet",
  ];
}

async function main() {
  // Compile everything (in case run by node)
  await hre.run("compile");

  // Deployed contracts
  let contracts = [];

  let transactionResponse;

  gasLimit = environments[network].gasLimit;

  // Output script header
  const divider = "-".repeat(80);
  console.log(`${divider}\nBoson Protocol V2 Contract Suite Deployer\n${divider}`);
  console.log(`⛓  Network: ${hre.network.name}\n📅 ${new Date()}`);

  // Get the protocol config
  const config = getConfig();
  const authTokenContracts = getAuthTokenContracts();

  // Get the accounts
  const accounts = await ethers.getSigners();
  const deployer = accounts[0];

  console.log("🔱 Deployer account: ", deployer ? deployer.address : "not found" && process.exit());
  console.log(divider);

  console.log(`💎 Deploying AccessController, ProtocolDiamond, and Diamond utility facets...`);

  // Deploy the Diamond
  const [protocolDiamond, dlf, dcf, erc165f, accessController, diamondArgs] = await deployProtocolDiamond(gasLimit);
  deploymentComplete("AccessController", accessController.address, [], contracts);
  deploymentComplete("DiamondLoupeFacet", dlf.address, [], contracts);
  deploymentComplete("DiamondCutFacet", dcf.address, [], contracts);
  deploymentComplete("ERC165Facet", erc165f.address, [], contracts);
  deploymentComplete("ProtocolDiamond", protocolDiamond.address, diamondArgs, contracts);

  console.log(`\n💎 Granting UPGRADER role...`);

  // Temporarily grant UPGRADER role to deployer account
  transactionResponse = await accessController.grantRole(Role.UPGRADER, deployer.address);
  await transactionResponse.wait(confirmations);

  console.log(`\n💎 Deploying and initializing config facet...`);

  // Cut the ConfigHandlerFacet facet into the Diamond
  const {
    facets: [configHandlerFacet],
  } = await deployProtocolConfigFacet(protocolDiamond, config, gasLimit);
  deploymentComplete("ConfigHandlerFacet", configHandlerFacet.address, [], contracts);

  console.log(`\n💎 Deploying and initializing protocol handler facets...`);

  // Deploy and cut facets
  const deployedFacets = await deployProtocolHandlerFacets(protocolDiamond, getNoArgFacetNames(), gasLimit);
  for (let i = 0; i < deployedFacets.length; i++) {
    const deployedFacet = deployedFacets[i];
    deploymentComplete(deployedFacet.name, deployedFacet.contract.address, [], contracts);
  }

  console.log(`\n⧉ Deploying Protocol Client implementation/proxy pairs...`);

  // Deploy the Protocol Client implementation/proxy pairs
  const protocolClientArgs = [protocolDiamond.address];
  const [impls, beacons, proxies] = await deployProtocolClients(protocolClientArgs, gasLimit);
  const [bosonVoucherImpl] = impls;
  const [bosonClientBeacon] = beacons;
  const [bosonVoucherProxy] = proxies;

  // Gather the complete args that were used to create the proxies
  const bosonVoucherProxyArgs = [...protocolClientArgs, bosonVoucherImpl.address];

  // Report and prepare for verification
  deploymentComplete("BosonVoucher Logic", bosonVoucherImpl.address, [], contracts);
  deploymentComplete("BosonVoucher Beacon", bosonClientBeacon.address, bosonVoucherProxyArgs, contracts);
  deploymentComplete("BosonVoucher Proxy", bosonVoucherProxy.address, [], contracts);

  console.log(`\n🌐️Configuring and granting roles...`);

  // Cast Diamond to the IBosonConfigHandler interface for further interaction with it
  const bosonConfigHandler = await ethers.getContractAt("IBosonConfigHandler", protocolDiamond.address);

  // Add Voucher NFT addresses to protocol config
  transactionResponse = await bosonConfigHandler.setVoucherBeaconAddress(bosonClientBeacon.address);
  await transactionResponse.wait(confirmations);

  transactionResponse = await bosonConfigHandler.setBeaconProxyAddress(bosonVoucherProxy.address);
  await transactionResponse.wait(confirmations);

  //Add NFT auth token addresses to protocol config
  transactionResponse = await bosonConfigHandler.setAuthTokenContract(
    AuthTokenType.Lens,
    authTokenContracts.lensAddress
  );
  await transactionResponse.wait(confirmations);

  transactionResponse = await bosonConfigHandler.setAuthTokenContract(AuthTokenType.ENS, authTokenContracts.ensAddress);
  await transactionResponse.wait(confirmations);

  console.log(`✅ ConfigHandlerFacet updated with remaining post-initialization config.`);

  // Renounce temporarily granted UPGRADER role for deployer account
  transactionResponse = await accessController.renounceRole(Role.UPGRADER, deployer.address);
  await transactionResponse.wait(confirmations);

  // Grant PROTOCOL role to the ProtocolDiamond contract
  transactionResponse = await accessController.grantRole(Role.PROTOCOL, protocolDiamond.address);
  await transactionResponse.wait(confirmations);

  // If hardhat, get an address generated by the mnemonic
  const adminAddress = hre.network.name === "hardhat" ? accounts[1].address : environments[network].adminAddress;

  // Grant ADMIN role to the specified admin address
  transactionResponse = await accessController.grantRole(Role.ADMIN, adminAddress);
  await transactionResponse.wait(confirmations);

  console.log(`✅ Granted roles to appropriate contract and addresses.`);

  await writeContracts(contracts);

  //Verify on test node if test env
  if (hre.network.name === "test" || hre.network.name === "localhost") {
    await verifyOnTestEnv(contracts);
  }

  // Bail now if deploying locally
  if (hre.network.name === "hardhat" || hre.network.name === "test" || hre.network.name === "localhost") process.exit();

  // Wait a minute after deployment completes and then verify contracts on block exporer
  console.log("⏲ Pause one minute, allowing deployments to propagate before verifying..");
  await delay(60000).then(async () => {
    console.log("🔍 Verifying contracts on block explorer...");
    while (contracts.length) {
      const contract = contracts.shift();
      await verifyOnBlockExplorer(contract);
    }
  });

  console.log("\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
