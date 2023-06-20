const hre = require("hardhat");
const { expect } = require("chai");
const environments = require("../../environments");
const { getContractFactory, provider, ZeroAddress, getAddress } = hre.ethers;
const network = hre.network.name;
const confirmations = hre.network.name == "hardhat" ? 1 : environments.confirmations;

/**
 * Deploy mock tokens for unit tests
 *
 * @param tokens- tokens to deploy
 *
 * @returns {Promise<(*|*|*)[]>}
 */
async function deployMockTokens(tokens = ["BosonToken", "Foreign721", "Foreign1155", "FallbackError"]) {
  const deployedTokens = [];

  // Deploy all the mock tokens
  while (tokens.length) {
    let token = tokens.shift();
    let TokenContractFactory = await getContractFactory(token);
    const tokenContract = await TokenContractFactory.deploy();
    await tokenContract.waitForDeployment();
    deployedTokens.push(tokenContract);
  }

  // Return the deployed token contracts
  return deployedTokens;
}

/**
 * Deploy and mint mock auth tokens for unit tests
 */
async function deployAndMintMockNFTAuthTokens() {
  console.log("\n Deploying and Minting Mock Auth Tokens");
  console.log(`⛓  Network: ${hre.network.name}\n📅 ${new Date()}`);

  let addresses = [];
  let tx1, tx2;

  //Deploy a mock NFT to represent the Lens Protocol profile NFT
  let lensTokenContractFactory = await getContractFactory("MockNFTAuth721");
  const lensTokenContract = await lensTokenContractFactory.deploy();
  await lensTokenContract.waitForDeployment(confirmations);
  console.log(`✅ Mock Lens NFT Token deployed to: ${await lensTokenContract.getAddress()}`);

  //Deploy a mock NFT to represent the ENS NFT
  let ensTokenContractFactory = await getContractFactory("MockNFTAuth721");
  const ensTokenContract = await ensTokenContractFactory.deploy();
  await ensTokenContract.waitForDeployment(confirmations);
  console.log(`✅ Mock ENS NFT Token deployed to: ${await ensTokenContract.getAddress()}`);

  if (network == "test" || network == "localhost") {
    //We want to mint auth tokens to specific addresses
    if (environments[network].nftAuthTokenHolders != "") {
      addresses = environments[network].nftAuthTokenHolders?.split(", ");
      console.log("\n Tokens will be minted to addresses ", addresses);
    }
  } else if (network == "hardhat") {
    [...addresses] = await provider.listAccounts();

    //We only need auth tokens for 3 addresses
    addresses.splice(3, 18);
    console.log("\n Tokens will be minted to addresses ", addresses);
  }

  let lensTokenId = 100;
  let ensTokenId = 200;
  // Mint tokens for testing
  while (addresses.length) {
    let to = addresses.shift();
    tx1 = await lensTokenContract.mint(to, BigInt(lensTokenId));
    tx2 = await ensTokenContract.mint(to, BigInt(ensTokenId));

    await expect(tx1).to.emit(lensTokenContract, "Transfer").withArgs(ZeroAddress, getAddress(to), lensTokenId);

    await expect(tx2).to.emit(ensTokenContract, "Transfer").withArgs(ZeroAddress, getAddress(to), ensTokenId);

    let lensOwner = await lensTokenContract.ownerOf(BigInt(lensTokenId));
    let ensOwner = await ensTokenContract.ownerOf(BigInt(ensTokenId));

    console.log("✅ Owner of Lens token Id %s is ", lensTokenId, lensOwner);
    console.log("✅ Owner of ENS token Id %s is ", ensTokenId, ensOwner);

    lensTokenId++;
    ensTokenId++;
  }
  return {
    addresses: [await lensTokenContract.getAddress(), await ensTokenContract.getAddress()],
  };
}

exports.deployMockTokens = deployMockTokens;
exports.deployAndMintMockNFTAuthTokens = deployAndMintMockNFTAuthTokens;
