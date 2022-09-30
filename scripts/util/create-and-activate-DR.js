const hre = require("hardhat");
const ethers = hre.ethers;
const fs = require("fs").promises;
const environments = require("../../environments");
const network = hre.network.name;
const confirmations = environments.confirmations;
const DisputeResolver = require("../../scripts/domain/DisputeResolver");

/**
Create and activate a dispute resolver
To use this script on the local network make sure to run `npm deploy-suite:local` first
Usage: npx hardhat create-dispute-resolver --path path/to/json --network <network>
Path should contain a JSON file with the following:
{
 "disputeResolver": {
  "id": string, // ignored
  "escalationResponsePeriod": string,
  "operator": string,
  "admin": string,
  "clerk": string,
  "treasury": string,
  "metadataUri": string,
  "active": boolean // ignored
  },
  "disputeResolverFees": [
    {
    "tokenAddress": string,
    "tokenName": string,
    "feeAmount": string
    }
  ],
  "sellerAllowList": [string]
}
**/

const createAndActivateDR = async (path) => {
  const file = await fs.readFile(path, "utf8");

  const { disputeResolver, disputeResolverFees, sellerAllowList } = await JSON.parse(file.toString());

  const adminAddress = environments[network].adminAddress;

  // If admin address is unspecified, exit the process
  if (adminAddress == ethers.constants.AddressZero || !adminAddress) {
    console.log("Admin address must not be zero address");
    process.exit(1);
  }

  // Find protocol diamond address
  const chainId = (await hre.ethers.provider.getNetwork()).chainId;
  const addresses = require(`../../addresses/${chainId}-${network}.json`);
  const protocolAddress = addresses.contracts.find((c) => c.name === "ProtocolDiamond").address;

  if (!protocolAddress) {
    console.log("Protocol address not found for network", network);
    process.exit(1);
  }

  // Cast protocol diamond to IBosonAccountHandler
  const accountHandler = await ethers.getContractAt("IBosonAccountHandler", protocolAddress);

  // Get signer for admin address
  const signer = await ethers.getSigner(adminAddress);

  // Create dispute resolver
  let tx = await accountHandler
    .connect(signer)
    .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);
  await tx.wait(confirmations);

  // Activate dispute resolver
  tx = await accountHandler.connect(signer).activateDisputeResolver(disputeResolver.id);
  const receipt = await tx.wait(confirmations);
  const disputeResolverCreated = receipt.events.find((e) => e.event === "DisputeResolverActivated").args[1];

  console.log("Dispute resolver created and activated");
  console.log(DisputeResolver.fromStruct(disputeResolverCreated));
};

exports.createAndActivateDR = createAndActivateDR;
