const environments = require('../environments');
const hre = require("hardhat");
const ethers = hre.ethers;
const network = hre.network.name;
const gasLimit = environments.gasLimit;

const Role = require("./domain/Role");
const { deployProtocolDiamond } = require('./util/deploy-protocol-diamond.js');
const { deployProtocolClients } = require('./util/deploy-protocol-clients.js');
const { deployProtocolConfigFacet } = require('./util/deploy-protocol-config-facet.js');
const { deployProtocolHandlerFacets } = require('./util/deploy-protocol-handler-facets.js');
const { delay, deploymentComplete, verifyOnEtherscan, verifyOnTestEnv, writeContracts } = require("./util/report-verify-deployments");

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
    const maxOffersPerGroup = "100";
    const maxTwinsPerBundle = "100";
    const maxOffersPerBundle = "100";
    const maxOffersPerBatch = "100";
    const maxTokensPerWithdrawal = "100";

    // Boson Token (ERC-20) contract address
    const TOKEN = {
        'mainnet': '0xC477D038d5420C6A9e0b031712f61c5120090de9',
        'ropsten': '0xf47e4fd9d2ebd6182f597ee12e487cca37fc524c',
        'hardhat': '0x0000000000000000000000000000000000000000',
        'test': '0x520ce45DF6d14334257BFdD360a5C22B06E309c7'
    }

    // Treasury contract address
    const TREASURY = {
        'mainnet': '0x4a25E18076DDcFd646ED14ABC07286c2A4c1256A',
        'ropsten': '0x0000000000000000000000000000000000000000',
        'hardhat': '0x0000000000000000000000000000000000000000',
        'test': '0x0000000000000000000000000000000000000000'
    }

    // Voucher contract address
    const VOUCHER = {
        'mainnet': '0x0000000000000000000000000000000000000000',
        'ropsten': '0x0000000000000000000000000000000000000000',
        'hardhat': '0x0000000000000000000000000000000000000000',
        'test': '0x0000000000000000000000000000000000000000'
    }

    return {
            tokenAddress: TOKEN[network],
            treasuryAddress: TREASURY[network],
            voucherAddress: VOUCHER[network],
            feePercentage,
            maxOffersPerGroup,
            maxTwinsPerBundle,            
            maxOffersPerBundle,
            maxOffersPerBatch,
            maxTokensPerWithdrawal
    };
}

/**
 * Get a list of no-arg initializer facet names to be cut into the Diamond
 */
function getNoArgFacetNames(){

    return [
        "AccountHandlerFacet",
        "BundleHandlerFacet",
        "DisputeHandlerFacet",
        "ExchangeHandlerFacet",
        "FundsHandlerFacet",
        "GroupHandlerFacet",
        "MetaTransactionsHandlerFacet",
        "OfferHandlerFacet",
        "OrchestrationHandlerFacet",
        "TwinHandlerFacet"
    ];

}

async function main() {

    // Compile everything (in case run by node)
    await hre.run('compile');

    // Deployed contracts
    let contracts = [];

    // Output script header
    const divider = "-".repeat(80);
    console.log(`${divider}\nBoson Protocol V2 Contract Suite Deployer\n${divider}`);
    console.log(`⛓  Network: ${hre.network.name}\n📅 ${new Date()}`);

    // Get the protocol config
    const config = getConfig();

    // Get the accounts
    const accounts = await ethers.provider.listAccounts();
    const deployer = accounts[0];
    console.log("🔱 Deployer account: ", deployer ? deployer : "not found" && process.exit());
    console.log(divider);

    console.log(`💎 Deploying AccessController, ProtocolDiamond, and Diamond utility facets...`);

    // Deploy the Diamond
    [protocolDiamond, dlf, dcf, accessController, diamondArgs] = await deployProtocolDiamond(gasLimit);
    deploymentComplete('AccessController', accessController.address, [], contracts);
    deploymentComplete('DiamondLoupeFacet', dlf.address, [], contracts);
    deploymentComplete('DiamondCutFacet', dcf.address, [], contracts);
    deploymentComplete('ProtocolDiamond', protocolDiamond.address, diamondArgs, contracts);

    console.log(`\n💎 Deploying and initializing protocol facets...`);

    // Temporarily grant UPGRADER role to deployer account
    await accessController.grantRole(Role.UPGRADER, deployer);

    // Cut the ConfigHandlerFacet facet into the Diamond
    const protocolConfig = [
        config.tokenAddress,
        config.treasuryAddress,
        config.voucherAddress,
        config.feePercentage,
        config.maxOffersPerGroup,
        config.maxTwinsPerBundle,        
        config.maxOffersPerBundle,
        config.maxOffersPerBatch,
        config.maxTokensPerWithdrawal
    ];
    const { facets: [configHandlerFacet] } = await deployProtocolConfigFacet(protocolDiamond, protocolConfig, gasLimit);
    deploymentComplete('ConfigHandlerFacet', configHandlerFacet.address, [], contracts);

    // Deploy and cut facets
    const deployedFacets = await deployProtocolHandlerFacets(protocolDiamond, getNoArgFacetNames(), gasLimit);
    for (let i=0; i < deployedFacets.length; i++) {
        const deployedFacet = deployedFacets[i];
        deploymentComplete(deployedFacet.name, deployedFacet.contract.address, [], contracts);
    }

    console.log(`\n⧉ Deploying Protocol Client implementation/proxy pairs...`);

    // Deploy the Protocol Client implementation/proxy pairs
    const protocolClientArgs = [accessController.address, protocolDiamond.address];
    [impls, proxies, clients] = await deployProtocolClients(protocolClientArgs, gasLimit);
    [bosonVoucherImpl] = impls;
    [bosonVoucherProxy] = proxies;
    [bosonVoucher] = clients;

    // Gather the complete args that were used to create the proxies
    const bosonVoucherProxyArgs = [...protocolClientArgs, bosonVoucherImpl.address];

    // Report and prepare for verification
    deploymentComplete("BosonVoucher Logic", bosonVoucherImpl.address, [], contracts);
    deploymentComplete("BosonVoucher Proxy", bosonVoucherProxy.address, bosonVoucherProxyArgs, contracts);

    console.log(`\n🌐️Configuring and granting roles...`);

    // Cast Diamond to the IBosonConfigHandler interface for further interaction with it
    const bosonConfigHandler = await ethers.getContractAt('IBosonConfigHandler', protocolDiamond.address);

    // Renounce temporarily granted UPGRADER role for deployer account
    await accessController.renounceRole(Role.UPGRADER, deployer);

    // Add Voucher NFT addresses to protocol config
    await bosonConfigHandler.setVoucherAddress(bosonVoucher.address);

    console.log(`✅ ConfigHandlerFacet updated with remaining post-initialization config.`);

    // Add roles to contracts and addresses that need it
    await accessController.grantRole(Role.PROTOCOL, protocolDiamond.address);
    await accessController.grantRole(Role.CLIENT, bosonVoucher.address);

    console.log(`✅ Granted roles to appropriate contract and addresses.`);

    await writeContracts(contracts);

    //Verify on test node if test env 
    if (hre.network.name === 'test') {
        await verifyOnTestEnv(contracts);
    }
  
    // Bail now if deploying locally
    if (hre.network.name === 'hardhat' || hre.network.name === 'test') process.exit();
    
    // Wait a minute after deployment completes and then verify contracts on etherscan
    console.log('⏲ Pause one minute, allowing deployments to propagate to Etherscan backend...');
    await delay(60000).then(
        async () => {
            console.log('🔍 Verifying contracts on Etherscan...');
            while(contracts.length) {
                contract = contracts.shift()
                await verifyOnEtherscan(contract);
            }
        }
    );

    console.log("\n");
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });