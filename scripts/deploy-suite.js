const environments = require("../environments");
const hre = require("hardhat");
const ethers = hre.ethers;
const network = hre.network.name;
let gasLimit;
const confirmations = environments.confirmations;

const Role = require("./domain/Role");
const { deployProtocolDiamond } = require("./util/deploy-protocol-diamond.js");
const { deployProtocolClients } = require("./util/deploy-protocol-clients.js");
const { deployProtocolConfigFacet } = require("./util/deploy-protocol-config-facet.js");
const { deployProtocolHandlerFacets } = require("./util/deploy-protocol-handler-facets.js");
const {
  delay,
  deploymentComplete,
  verifyOnBlockExplorer,
  verifyOnTestEnv,
  writeContracts,
} = require("./util/report-verify-deployments");
const { oneMonth } = require("../test/utils/constants");
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
  // Protocol configuration params
  const feePercentage = "150"; // 1.5%  = 150
  const protocolFeeFlatBoson = "0";
  const maxExchangesPerBatch = "100";
  const maxOffersPerGroup = "100";
  const maxTwinsPerBundle = "100";
  const maxOffersPerBundle = "100";
  const maxOffersPerBatch = "100";
  const maxTokensPerWithdrawal = "100";
  const maxFeesPerDisputeResolver = 100;
  const maxEscalationResponsePeriod = oneMonth;
  const maxDisputesPerBatch = "100";
  const maxAllowedSellers = "100";
  const buyerEscalationDepositPercentage = "100"; // 1%
  const maxTotalOfferFeePercentage = 4000; // 40%
  const maxRoyaltyPecentage = 1000; //10%

  // Boson Token (ERC-20) contract address
  const TOKEN = {
    mainnet: "0xC477D038d5420C6A9e0b031712f61c5120090de9",
    hardhat: ethers.constants.AddressZero,
    test: "0x520ce45DF6d14334257BFdD360a5C22B06E309c7",
    mumbai: ethers.constants.AddressZero,
  };

  // Treasury contract address
  const TREASURY = {
    mainnet: "0x4a25E18076DDcFd646ED14ABC07286c2A4c1256A",
    hardhat: ethers.constants.AddressZero,
    test: ethers.constants.AddressZero,
    mumbai: ethers.constants.AddressZero,
  };

  // Boson voucher beacon contract address
  const BEACON = {
    mainnet: ethers.constants.AddressZero,
    hardhat: ethers.constants.AddressZero,
    test: ethers.constants.AddressZero,
    mumbai: ethers.constants.AddressZero,
  };

  // Beacon proxy contract address
  const BEACON_PROXY = {
    mainnet: ethers.constants.AddressZero,
    hardhat: ethers.constants.AddressZero,
    test: ethers.constants.AddressZero,
    mumbai: ethers.constants.AddressZero,
  };

  return [
    {
      token: TOKEN[network],
      treasury: TREASURY[network],
      voucherBeacon: BEACON[network],
      beaconProxy: BEACON_PROXY[network],
    },
    {
      maxExchangesPerBatch,
      maxOffersPerGroup,
      maxTwinsPerBundle,
      maxOffersPerBundle,
      maxOffersPerBatch,
      maxTokensPerWithdrawal,
      maxFeesPerDisputeResolver,
      maxEscalationResponsePeriod,
      maxDisputesPerBatch,
      maxAllowedSellers,
      maxTotalOfferFeePercentage,
      maxRoyaltyPecentage,
    },
    {
      percentage: feePercentage,
      flatBoson: protocolFeeFlatBoson,
    },
    buyerEscalationDepositPercentage,
  ];
}

/**
 * Get the contract addresses for supported NFT Auth token contracts
 * @returns {lensAddress: string, ensAddress: string}
 */
function getAuthTokenContracts() {
  // Lens protocol NFT contract address
  const LENS = {
    mainnet: "0xDb46d1Dc155634FbC732f92E853b10B288AD5a1d",
    hardhat: "0x60Ae865ee4C725cd04353b5AAb364553f56ceF82",
    test: "0x60Ae865ee4C725cd04353b5AAb364553f56ceF82", //dummy value required for set function to work. TODO: replace with real address
    mumbai: "0x60Ae865ee4C725cd04353b5AAb364553f56ceF82",
  };

  // ENS contract address
  const ENS = {
    mainnet: "0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85",
    hardhat: "0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85",
    test: "0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85", //dummy value required for set function to work.  TODO: replace with real address
    mumbai: "0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85",
  };

  return { lensAddress: LENS[network], ensAddress: ENS[network] };
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
  ];
}

async function main() {
  // Compile everything (in case run by node)
  await hre.run("compile");

  // Deployed contracts
  let contracts = [];

  let transactionResponse;

  gasLimit = environments[network].gasLimit;

  console.log("gasLimit ", gasLimit);

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
  const [protocolDiamond, dlf, dcf, accessController, diamondArgs] = await deployProtocolDiamond(gasLimit);
  deploymentComplete("AccessController", accessController.address, [], contracts);
  deploymentComplete("DiamondLoupeFacet", dlf.address, [], contracts);
  deploymentComplete("DiamondCutFacet", dcf.address, [], contracts);
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
  const protocolClientArgs = [accessController.address, protocolDiamond.address];
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

  // Renounce temporarily granted UPGRADER role for deployer account
  transactionResponse = await accessController.renounceRole(Role.UPGRADER, deployer.address);
  await transactionResponse.wait(confirmations);

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

  // Add roles to contracts and addresses that need it
  transactionResponse = await accessController.grantRole(Role.PROTOCOL, protocolDiamond.address);
  await transactionResponse.wait(confirmations);

  console.log(`✅ Granted roles to appropriate contract and addresses.`);

  await writeContracts(contracts);

  //Verify on test node if test env
  if (hre.network.name === "test") {
    await verifyOnTestEnv(contracts);
  }

  // Bail now if deploying locally
  if (hre.network.name === "hardhat" || hre.network.name === "test") process.exit();

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
