/**
 * ERC-165 identifiers for interfaces implemented by the Boson Protocol
 */
const { getInterfaceId } = require("../../scripts/util/diamond-utils.js");
const hre = require("hardhat");
const ethers = hre.ethers;

const interfaces = [
  "IBosonConfigHandler",
  "IBosonBundleHandler",
  "IBosonDisputeHandler",
  "IBosonExchangeHandler",
  "IBosonFundsHandler",
  "IBosonGroupHandler",
  "IBosonOfferHandler",
  "IBosonTwinHandler",
  "IBosonAccountHandler",
  "IBosonMetaTransactionsHandler",
  "IBosonOrchestrationHandler",
  "IClientExternalAddresses",
  "IDiamondCut",
  "IDiamondLoupe",
  "IERC165",
];

// manually add the interfaces that currently cannot be calculated
const otherInterfaces = {
  IBosonVoucher: "0x17c286ab",
  IERC1155: "0xd9b67a26",
  IERC721: "0x80ac58cd",
};

async function getInterfaceIds() {
  let interfaceIds = {};
  for (const iFace of interfaces) {
    let contractInstance = await ethers.getContractAt(iFace, ethers.constants.AddressZero);
    interfaceIds[iFace] = getInterfaceId(contractInstance);
  }
  return { ...interfaceIds, ...otherInterfaces };
}

exports.getInterfaceIds = getInterfaceIds;
