const { getFacetAddCut } = require("./diamond-utils.js");
const { getInterfaceIds } = require("../config/supported-interfaces.js");
const hre = require("hardhat");
const ethers = hre.ethers;
const environments = require("../../environments");
const confirmations = environments.confirmations;

/**
 * Deploy the ProtocolDiamond
 *
 * Reused between deployment script and unit tests for consistency
 *
 * @param gasLimit - gasLimit for transactions
 * @param gasPrice - gasPrice for transactions
 * @returns {Promise<(*|*|*)[]>}
 */
async function deployProtocolDiamond(gasLimit, gasPrice) {
  // Get interface Ids
  const InterfaceIds = await getInterfaceIds();

  // Core interfaces that will be supported at the Diamond address
  const interfaces = [InterfaceIds.IDiamondLoupe, InterfaceIds.IDiamondCut, InterfaceIds.IERC165];

  // Deploy the AccessController contract
  const AccessController = await ethers.getContractFactory("AccessController");
  const accessController = await AccessController.deploy({
    gasLimit: gasLimit,
    gasPrice,
  });
  await accessController.deployTransaction.wait(confirmations);

  // Diamond Loupe Facet
  const DiamondLoupeFacet = await ethers.getContractFactory("DiamondLoupeFacet");
  const dlf = await DiamondLoupeFacet.deploy({
    gasLimit: gasLimit,
    gasPrice,
  });
  await dlf.deployTransaction.wait(confirmations);

  // Diamond Cut Facet
  const DiamondCutFacet = await ethers.getContractFactory("DiamondCutFacet");
  const dcf = await DiamondCutFacet.deploy({ gasLimit: gasLimit, gasPrice });
  await dcf.deployTransaction.wait(confirmations);

  // ERC165 Facet
  const ERC165Facet = await ethers.getContractFactory("ERC165Facet");
  const erc165f = await ERC165Facet.deploy({ gasLimit: gasLimit, gasPrice });
  await erc165f.deployTransaction.wait(confirmations);

  // Arguments for Diamond constructor
  const diamondArgs = [
    accessController.address,
    [getFacetAddCut(dlf), getFacetAddCut(dcf), getFacetAddCut(erc165f)],
    interfaces,
  ];

  // Deploy Protocol Diamond
  const ProtocolDiamond = await ethers.getContractFactory("ProtocolDiamond");
  const protocolDiamond = await ProtocolDiamond.deploy(...diamondArgs, {
    gasLimit: gasLimit,
    gasPrice,
  });
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
