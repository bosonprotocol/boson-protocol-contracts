/**
 * ERC-165 identifiers for interfaces implemented by the Boson Protocol
 */
const { getInterfaceId } = require('../../scripts/util/diamond-utils.js')
const hre = require("hardhat");
const ethers = hre.ethers;

const interfaces = [
    'IBosonConfigHandler',
    'IBosonDisputeHandler',
    'IBosonExchangeHandler',
    'IBosonFundsHandler',
    'IBosonOfferHandler',
    'IBosonTwinHandler',
    'IBosonAccountHandler',
    'IBosonClient',
    'IDiamondCut',
    'IDiamondLoupe',
    'IERC165',     
]

// manually add the interfaces that currently cannot be calculated
const otherInterfaces = {
    'IBosonVoucher':    "0x8a75c03e",
    'IERC1155':         "0xd9b67a26",
    'IERC721':          "0x80ac58cd"
}


async function getInterfaceIds() {
    let interfaceIds = {};
    for (const interface of interfaces) {
        let contractInstance = await ethers.getContractAt(interface, ethers.constants.AddressZero);
        interfaceIds[interface] = getInterfaceId(contractInstance);
    }
    return {...interfaceIds, ...otherInterfaces};
}


exports.getInterfaceIds = getInterfaceIds
