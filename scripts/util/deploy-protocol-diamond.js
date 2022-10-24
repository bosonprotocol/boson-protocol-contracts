const { getFacetAddCut } = require("./diamond-utils.js");
const { getInterfaceIds } = require("../config/supported-interfaces.js");
const hre = require("hardhat");
const ethers = hre.ethers;
const environments = require("../../environments");
const confirmations = hre.network.name == "hardhat" ? 1 : environments.confirmations;
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
  const AccessController = await ethers.getContractFactory("AccessController");
  const accessController = await AccessController.deploy(await getFees(maxPriorityFeePerGas));
  await accessController.deployTransaction.wait(confirmations);

  // Diamond Loupe Facet
  const DiamondLoupeFacet = await ethers.getContractFactory("DiamondLoupeFacet");
  const dlf = await DiamondLoupeFacet.deploy(await getFees(maxPriorityFeePerGas));
  await dlf.deployTransaction.wait(confirmations);

  // Diamond Cut Facet
  const DiamondCutFacet = await ethers.getContractFactory("DiamondCutFacet");
  const dcf = await DiamondCutFacet.deploy(await getFees(maxPriorityFeePerGas));
  await dcf.deployTransaction.wait(confirmations);

  // ERC165 Facet
  const ERC165Facet = await ethers.getContractFactory("ERC165Facet");
  const erc165f = await ERC165Facet.deploy(await getFees(maxPriorityFeePerGas));
  await erc165f.deployTransaction.wait(confirmations);

  // Arguments for Diamond constructor
  const diamondArgs = [
    accessController.address,
    [getFacetAddCut(dlf), getFacetAddCut(dcf), getFacetAddCut(erc165f)],
    interfaces,
  ];

  // Deploy Protocol Diamond
  const ProtocolDiamond = await ethers.getContractFactory("ProtocolDiamond");
  const protocolDiamond = await ProtocolDiamond.deploy(...diamondArgs, await getFees(maxPriorityFeePerGas));
  await protocolDiamond.deployTransaction.wait(confirmations);

  return [protocolDiamond, dlf, dcf, erc165f, accessController, diamondArgs];
}

if (require.main === module) {
  deployProtocolDiamond()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

exports.deployProtocolDiamond = deployProtocolDiamond;
