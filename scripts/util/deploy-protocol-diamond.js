const { getFacetAddCut } = require("./diamond-utils.js");
const { getInterfaceIds } = require("../config/supported-interfaces.js");
const hre = require("hardhat");
const { getContractFactory, provider } = hre.ethers;
const environments = require("../../environments");
const confirmations = hre.network.name === "hardhat" ? 1 : environments.confirmations;
const { getFees } = require("./utils");

/**
 * Deploy the ProtocolDiamond
 *
 * Reused between deployment script and unit tests for consistency
 *
 * @param maxPriorityFeePerGas - maxPriorityFeePerGas for transactions
 * @returns {Promise<(*|*|*)[]>}
 */
async function deployProtocolDiamond(maxPriorityFeePerGas) {
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
  const AccessController = await getContractFactory("AccessController");
  const accessController = await AccessController.deploy(await getFees(maxPriorityFeePerGas));
  await accessController.deploymentTransaction().wait(confirmations);

  // Diamond Loupe Facet
  const DiamondLoupeFacet = await getContractFactory("DiamondLoupeFacet");
  const dlf = await DiamondLoupeFacet.deploy(await getFees(maxPriorityFeePerGas));
  await dlf.deploymentTransaction().wait(confirmations);

  // Diamond Cut Facet
  const DiamondCutFacet = await getContractFactory("DiamondCutFacet");
  const dcf = await DiamondCutFacet.deploy(await getFees(maxPriorityFeePerGas));
  await dcf.deploymentTransaction().wait(confirmations);

  // ERC165 Facet
  const ERC165Facet = await getContractFactory("ERC165Facet");
  const erc165f = await ERC165Facet.deploy(await getFees(maxPriorityFeePerGas));
  await erc165f.deploymentTransaction().wait(confirmations);

  // Arguments for Diamond constructor
  const diamondArgs = [
    accessController.getAddress(),
    [getFacetAddCut(dlf), getFacetAddCut(dcf), getFacetAddCut(erc165f)],
    interfaces,
  ];

  // Deploy Protocol Diamond
  const ProtocolDiamond = await getContractFactory("ProtocolDiamond");
  const protocolDiamond = await ProtocolDiamond.deploy(...diamondArgs, await getFees(maxPriorityFeePerGas));
  await protocolDiamond.deploymentTransaction().wait(confirmations);

  return [protocolDiamond, dlf, dcf, erc165f, accessController, diamondArgs];
}

exports.deployProtocolDiamond = deployProtocolDiamond;
