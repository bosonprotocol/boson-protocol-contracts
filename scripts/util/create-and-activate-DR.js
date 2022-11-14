const hre = require("hardhat");
const ethers = hre.ethers;
const fs = require("fs").promises;
const environments = require("../../environments");
const network = hre.network.name;
const confirmations = hre.network.name == "hardhat" ? 1 : environments.confirmations;
const DisputeResolver = require("../../scripts/domain/DisputeResolver");
const Role = require("../domain/Role");

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
  "privateKey": string // optional
}
**/

const getDisputeResolverFromEvent = (events, eventName, index) => {
  return DisputeResolver.fromStruct(events.find((e) => e.event === eventName).args[index]);
};

const addressNotFound = (address) => {
  console.log(`${address} address not found for network ${network}`);
  process.exit(1);
};

const createAndActivateDR = async (path) => {
  const file = await fs.readFile(path, "utf8");

  let { disputeResolver, disputeResolverFees, sellerAllowList, privateKey } = await JSON.parse(file.toString());

  const adminAddress = environments[network].adminAddress;

  // If admin address is unspecified, exit the process
  if (adminAddress == ethers.constants.AddressZero || !adminAddress) {
    console.log("Admin address must not be zero address");
    process.exit(1);
  }

  // Find protocol diamond and accessController addresses
  const chainId = (await hre.ethers.provider.getNetwork()).chainId;
  const addressList = require(`../../addresses/${chainId}-${network}.json`).contracts;
  const protocolAddress = addressList.find((c) => c.name === "ProtocolDiamond").address;
  const accessControllerAddress = addressList.find((c) => c.name === "AccessController").address;

  if (!protocolAddress) {
    return addressNotFound("ProtocolDiamond");
  }

  if (!accessControllerAddress) {
    return addressNotFound("AccessController");
  }

  // Cast protocol diamond to IBosonAccountHandler
  const accountHandler = await ethers.getContractAt("IBosonAccountHandler", protocolAddress);
  // Get AccessController abstraction
  const accessController = await ethers.getContractAt("AccessController", accessControllerAddress);

  const hasRole = await accessController.hasRole(Role.ADMIN, adminAddress);

  if (!hasRole) {
    console.log("Admin address does not have admin role");
    process.exit(1);
  }

  // Get signer for admin address
  const protocolAdminSigner = await ethers.getSigner(adminAddress);

  let tx, receipt;
  // Create dispute resolver
  // if (!activateOnly) {
  // privateKey
  let disputeResolverSigner;

  if (!privateKey) {
    disputeResolverSigner = protocolAdminSigner;
  } else {
    disputeResolverSigner = new ethers.Wallet(privateKey, protocolAdminSigner.provider);
  }

  // create dispute resolver with callers account
  let initialDisputeResolver = { ...disputeResolver };
  initialDisputeResolver.admin = disputeResolverSigner.address;
  initialDisputeResolver.operator = disputeResolverSigner.address;
  initialDisputeResolver.clerk = disputeResolverSigner.address;

  tx = await accountHandler
    .connect(disputeResolverSigner)
    .createDisputeResolver(initialDisputeResolver, disputeResolverFees, sellerAllowList);
  receipt = await tx.wait(confirmations);
  initialDisputeResolver = getDisputeResolverFromEvent(receipt.events, "DisputeResolverCreated", 1);

  // if caller does not match supplied dispute resolver, update it.
  // this is primary used when one does not have access to private key of dispute resolver or it does not exist (i.e. DR is a smart contract)
  if (
    initialDisputeResolver.admin.toLowerCase() != disputeResolver.admin.toLowerCase() ||
    initialDisputeResolver.operator.toLowerCase() != disputeResolver.operator.toLowerCase() ||
    initialDisputeResolver.clerk.toLowerCase() != disputeResolver.clerk.toLowerCase()
  ) {
    disputeResolver.id = initialDisputeResolver.id;
    tx = await accountHandler.connect(disputeResolverSigner).updateDisputeResolver(disputeResolver);
    receipt = await tx.wait(confirmations);
    disputeResolver = getDisputeResolverFromEvent(receipt.events, "DisputeResolverUpdated", 1);
  } else {
    // no need to update on chain
    disputeResolver = initialDisputeResolver;
  }

  console.log(`Dispute resolver created with id ${disputeResolver.id}`);
  // }

  // Activate dispute resolver
  // if (!createOnly) {
  //   tx = await accountHandler.connect(protocolAdminSigner).activateDisputeResolver(disputeResolver.id);
  //   receipt = await tx.wait(confirmations);
  //   disputeResolver = getDisputeResolverFromEvent(receipt.events, "DisputeResolverActivated", 1);
  //   console.log(`Dispute resolver activated`);
  // }

  console.log(disputeResolver);
};

exports.createAndActivateDR = createAndActivateDR;
