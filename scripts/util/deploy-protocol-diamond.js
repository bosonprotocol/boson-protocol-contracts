const { getFacetAddCut } = require("./diamond-utils.js");
const { getInterfaceIds } = require("../config/supported-interfaces.js");
const hre = require("hardhat");
const { getContractFactory, id, getContractAt } = hre.ethers;
const environments = require("../../environments");
const confirmations = hre.network.name === "hardhat" ? 1 : environments.confirmations;
const { getFees } = require("./utils");

/**
 * Deploy the ProtocolDiamond
 *
 * Reused between deployment script and unit tests for consistency
 *
 * @param maxPriorityFeePerGas - maxPriorityFeePerGas for transactions
 * @param create3 - CREATE3 deployment configuration (factory address and salt)
 * @returns {Promise<(*|*|*)[]>}
 */
async function deployProtocolDiamond(maxPriorityFeePerGas, create3) {
  // Get interface Ids
  const InterfaceIds = await getInterfaceIds();

  // Core interfaces that will be supported at the Diamond address
  const interfaces = [
    InterfaceIds.IDiamondLoupe,
    InterfaceIds.IDiamondCut,
    InterfaceIds.IERC165,
    InterfaceIds.IERC165Extended,
  ];

  // Deploy the AccessController contract
  const [deployer] = await hre.ethers.getSigners();
  const accessController = await deployContract(
    "AccessController",
    maxPriorityFeePerGas,
    create3,
    [deployer.address],
    ["address"]
  );

  // Diamond Loupe Facet
  const dlf = await deployContract("DiamondLoupeFacet", maxPriorityFeePerGas, create3);

  // Diamond Cut Facet
  const dcf = await deployContract("DiamondCutFacet", maxPriorityFeePerGas, create3);

  // ERC165 Facet
  const erc165f = await deployContract("ERC165Facet", maxPriorityFeePerGas, create3);

  // Arguments for Diamond constructor
  const diamondArgs = [
    await accessController.getAddress(),
    [await getFacetAddCut(dlf), await getFacetAddCut(dcf), await getFacetAddCut(erc165f)],
    interfaces,
  ];

  const diamondArgsTypes = ["address", "(address,uint8,bytes4[])[]", "bytes4[]"];

  // Deploy Protocol Diamond
  const protocolDiamond = await deployContract(
    "ProtocolDiamond",
    maxPriorityFeePerGas,
    create3,
    diamondArgs,
    diamondArgsTypes
  );

  return [protocolDiamond, dlf, dcf, erc165f, accessController, diamondArgs];
}

/**
 * Deploy a contract, either using CREATE or CREATE3
 *
 * @param contractName - name of the contract to deploy
 * @param maxPriorityFeePerGas - maxPriorityFeePerGas for transactions
 * @param create3 - CREATE3 deployment configuration (factory address and salt)
 * @param constructorArgs - constructor arguments
 * @param constructorArgsTypes - constructor argument types
 */
async function deployContract(
  contractName,
  maxPriorityFeePerGas,
  create3,
  constructorArgs = [],
  constructorArgsTypes = []
) {
  const contractFactory = await getContractFactory(contractName);

  if (create3) {
    //Deploy using CREATE3

    const salt = id(create3.salt + contractName);
    const byteCode = contractFactory.bytecode;
    let creationData = salt + byteCode.slice(2);
    if (constructorArgs.length > 0) {
      const abiCoder = new hre.ethers.AbiCoder();
      const encodedConstructorArgs = abiCoder.encode(constructorArgsTypes, constructorArgs);
      creationData += encodedConstructorArgs.slice(2);
    }

    const [deployer] = await hre.ethers.getSigners();

    const transaction = {
      to: create3.address,
      data: creationData,
    };

    // get the contract address. If it exists, it cannot be deployed again
    let contractAddress;
    try {
      contractAddress = await deployer.call(transaction);
    } catch (e) {
      console.log(`${contractName} cannot be deployed.`);
    }

    // deploy the contract
    const tx = await deployer.sendTransaction(transaction);
    await tx.wait(confirmations);
    const contract = await getContractAt(contractName, contractAddress);

    return contract;
  }

  // Deploy using CREATE
  const contract = await contractFactory.deploy(...constructorArgs, await getFees(maxPriorityFeePerGas));
  await contract.deploymentTransaction().wait(confirmations);
  return contract;
}

exports.deployProtocolDiamond = deployProtocolDiamond;
