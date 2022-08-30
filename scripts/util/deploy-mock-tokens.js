const hre = require("hardhat");
const { expect } = require("chai");
const environments = require("../../environments");
const ethers = hre.ethers;
const network = hre.network.name;
const confirmations = environments.confirmations;

/**
 * Deploy mock tokens for unit tests
 *
 * @param gasLimit - gasLimit for transactions
 *
 * @returns {Promise<(*|*|*)[]>}
 */
async function deployMockTokens(gasLimit, tokens = ["BosonToken", "Foreign721", "Foreign1155", "FallbackError"]) {
  const deployedTokens = [];

  // Deploy all the mock tokens
  while (tokens.length) {
    let token = tokens.shift();
    let TokenContractFactory = await ethers.getContractFactory(token);
    const tokenContract = await TokenContractFactory.deploy({ gasLimit });
    await tokenContract.deployed();
    deployedTokens.push(tokenContract);
  }

  // Return the deployed token contracts
  return deployedTokens;
}

async function deployAndMintMockNFTAuthTokens() {
  console.log("\n Deploying and Minting Mock Auth Tokens");
  console.log(`⛓  Network: ${hre.network.name}\n📅 ${new Date()}`);

  const gasLimit = environments[network].gasLimit;
  let addresses = [];
  let tx1, tx2;

  //Deploy a mock NFT to represent the Lens Protocol profile NFT
  let lensTokenContractFactory = await ethers.getContractFactory("MockNFTAuth721");
  const lensTokenContract = await lensTokenContractFactory.deploy({ gasLimit });
  await lensTokenContract.deployTransaction.wait(confirmations);
  console.log(`✅ Mock Lens NFT Token deployed to: ${lensTokenContract.address}`);

  //Deploy a mock NFT to represent the ENS NFT
  let ensTokenContractFactory = await ethers.getContractFactory("MockNFTAuth721");
  const ensTokenContract = await ensTokenContractFactory.deploy({ gasLimit });
  await ensTokenContract.deployTransaction.wait(confirmations);
  console.log(`✅ Mock ENS NFT Token deployed to: ${ensTokenContract.address}`);

  if (network == "test" || network == "localhost") {
    //We want to mint auth tokens to specific addresses
    addresses = environments.test.nftAuthTokenHolders.split(", ");
    console.log("\n Tokens will be minted to addresses ", addresses);
  } else if (network == "hardhat") {
    [...addresses] = await ethers.provider.listAccounts();

    //We only need auth tokens for 3 addresses
    addresses.splice(3, 18);
    console.log("\n Tokens will be minted to addresses ", addresses);
  }

  let lensTokenId = 100;
  let ensTokenId = 200;
  // Mint tokens for testing
  while (addresses.length) {
    let to = addresses.shift();
    tx1 = await lensTokenContract.mint(to, ethers.BigNumber.from(lensTokenId));
    tx2 = await ensTokenContract.mint(to, ethers.BigNumber.from(ensTokenId));

    await expect(tx1)
      .to.emit(lensTokenContract, "Transfer")
      .withArgs(ethers.constants.AddressZero, ethers.utils.getAddress(to), lensTokenId);

    await expect(tx2)
      .to.emit(ensTokenContract, "Transfer")
      .withArgs(ethers.constants.AddressZero, ethers.utils.getAddress(to), ensTokenId);

    let lensOwner = await lensTokenContract.ownerOf(ethers.BigNumber.from(lensTokenId));
    let ensOwner = await ensTokenContract.ownerOf(ethers.BigNumber.from(ensTokenId));

    console.log("✅ Owner of Lens token Id %s is ", lensTokenId, lensOwner);
    console.log("✅ Owner of ENS token Id %s is ", ensTokenId, ensOwner);

    lensTokenId++;
    ensTokenId++;
  }
}

exports.deployMockTokens = deployMockTokens;
exports.deployAndMintMockNFTAuthTokens = deployAndMintMockNFTAuthTokens;
