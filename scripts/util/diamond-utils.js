const hre = require("hardhat");
const environments = "../../environments.js";
const confirmations = hre.network.name === "hardhat" ? 1 : environments.confirmations;
const FacetCutAction = require("../domain/FacetCutAction");
const { interfacesWithMultipleArtifacts } = require("./constants");
const { getFees } = require("./utils");
const ethers = hre.ethers;
const keccak256 = ethers.utils.keccak256;
const toUtf8Bytes = ethers.utils.toUtf8Bytes;

/**
 * Utilities for testing and interacting with Diamond
 *
 * @author Nick Mudge <nick@perfectabstractions.com> (https://twitter.com/mudgen)
 */
// get function selectors from ABI
function getSelectors(contract, returnSignatureToNameMapping = false) {
  const signatures = Object.keys(contract.interface.functions);
  let signatureToNameMapping = {};
  const selectors = signatures.reduce((acc, val) => {
    if (val !== "init(bytes)") {
      const signature = contract.interface.getSighash(val);
      acc.push(signature);
      if (returnSignatureToNameMapping) signatureToNameMapping[signature] = val;
    }
    return acc;
  }, []);
  selectors.contract = contract;
  selectors.remove = remove;
  selectors.get = get;
  if (returnSignatureToNameMapping) return { selectors, signatureToNameMapping };
  return selectors;
}

// get interface id
async function getInterfaceId(contractName, skipBaseCheck = false, isFullPath = false) {
  const contract = await ethers.getContractAt(contractName, ethers.constants.AddressZero);
  const signatures = Object.keys(contract.interface.functions);
  const selectors = signatures.reduce((acc, val) => {
    acc.push(ethers.BigNumber.from(contract.interface.getSighash(val)));
    return acc;
  }, []);

  let interfaceId = selectors.reduce((pv, cv) => pv.xor(cv), ethers.BigNumber.from("0x00000000"));

  // If contract inherits other contracts, their interfaces must be xor-ed
  if (!skipBaseCheck) {
    // Get base contracts
    let buildInfo;
    const { sourceName } = await hre.artifacts.readArtifact(contractName);

    if (!isFullPath) {
      buildInfo = await hre.artifacts.getBuildInfo(`${sourceName}:${contractName}`);
    } else {
      buildInfo = await hre.artifacts.getBuildInfo(contractName);
    }

    const nodes = buildInfo.output?.sources?.[sourceName]?.ast?.nodes;
    const node = nodes.find((n) => n.baseContracts); // node with information about base contracts

    for (const baseContract of node.baseContracts) {
      const baseName = baseContract.baseName.name;

      isFullPath = interfacesWithMultipleArtifacts.includes(baseName);

      const baseContractInterfaceId = ethers.BigNumber.from(
        await getInterfaceId(
          interfacesWithMultipleArtifacts.includes(baseName)
            ? `contracts/interfaces/${baseName}.sol:${baseName}`
            : baseName,
          false,
          isFullPath
        )
      );

      // Remove interface id of base contracts
      interfaceId = interfaceId.xor(baseContractInterfaceId);
    }
  }
  return interfaceId.isZero() ? "0x00000000" : ethers.utils.hexZeroPad(interfaceId.toHexString(), 4);
}

// get function selector from function signature
function getSelector(func) {
  const abiInterface = new ethers.utils.Interface([func]);
  return abiInterface.getSighash(ethers.utils.Fragment.from(func));
}

// used with getSelectors to remove selectors from an array of selectors
// functionNames argument is an array of function signatures
function remove(functionNamesOrSignature) {
  const selectors = this.filter((v) => {
    for (const functionName of functionNamesOrSignature) {
      if (v === this.contract.interface.getSighash(functionName)) {
        return false;
      }
    }
    return true;
  });
  selectors.contract = this.contract;
  selectors.remove = this.remove;
  selectors.get = this.get;
  return selectors;
}

// used with getSelectors to get selectors from an array of selectors
// functionNames argument is an array of function signatures
function get(functionNames) {
  const selectors = this.filter((v) => {
    for (const functionName of functionNames) {
      if (v === this.contract.interface.getSighash(functionName)) {
        return true;
      }
    }
    return false;
  });
  selectors.contract = this.contract;
  selectors.remove = this.remove;
  selectors.get = this.get;
  return selectors;
}

// remove selectors using an array of signatures
function removeSelectors(selectors, signatures) {
  const iface = new ethers.utils.Interface(signatures.map((v) => "function " + v));
  const removeSelectors = signatures.map((v) => iface.getSighash(v));
  selectors = selectors.filter((v) => !removeSelectors.includes(v));
  return selectors;
}

// find a particular address position in the return value of diamondLoupeFacet.facets()
function findAddressPositionInFacets(facetAddress, facets) {
  for (let i = 0; i < facets.length; i++) {
    if (facets[i].facetAddress === facetAddress) {
      return i;
    }
  }
}

function getFacetAddCut(facet, omitFunctions = []) {
  let selectors = omitFunctions.length ? getSelectors(facet).remove(omitFunctions) : getSelectors(facet);
  return [facet.address, FacetCutAction.Add, selectors];
}

function getFacetReplaceCut(facet, omitFunctions = []) {
  let selectors = omitFunctions.length ? getSelectors(facet).remove(omitFunctions) : getSelectors(facet);
  return [facet.address, FacetCutAction.Replace, selectors];
}

function getFacetRemoveCut(facet, omitFunctions = []) {
  let selectors = omitFunctions.length ? getSelectors(facet).remove(omitFunctions) : getSelectors(facet);
  return [facet.address, FacetCutAction.Remove, selectors];
}

async function getStateModifyingFunctions(facetNames) {
  let stateModifyingFunctions = [];
  for (const facetName of facetNames) {
    let FacetContractFactory = await ethers.getContractFactory(facetName);
    const functions = FacetContractFactory.interface.functions;
    const functionNames = Object.keys(functions);
    const facetStateModifyingFunctions = functionNames.filter(
      (fn) => fn != "initialize()" && functions[fn].stateMutability != "view"
    );
    stateModifyingFunctions.push(...facetStateModifyingFunctions);
  }
  return stateModifyingFunctions;
}

async function getStateModifyingFunctionsHashes(facetNames, omitFunctions = []) {
  //  Allowlist contract methods
  const stateModifyingFunctions = await getStateModifyingFunctions(facetNames);
  const smf = stateModifyingFunctions.filter((fn) => !omitFunctions.includes(fn));
  return smf.map((smf) => keccak256(toUtf8Bytes(smf)));
}

// Get ProtocolInitializationHandlerFacet initialize calldata to be called on diamondCut
function getInitializeCalldata(
  facetsToInitialize,
  version,
  isUpgrade,
  initializationData,
  initializationFacet,
  interfacesToRemove = [],
  interfacesToAdd = []
) {
  console.log("initialize version", version);
  version = ethers.utils.formatBytes32String(version);
  const addresses = facetsToInitialize.map((f) => f.contract.address);
  const calldata = facetsToInitialize.map((f) => f.initialize);

  return initializationFacet.interface.encodeFunctionData("initialize", [
    version,
    addresses,
    calldata,
    isUpgrade,
    initializationData,
    interfacesToRemove,
    interfacesToAdd,
  ]);
}

// Cut diamond with facets to be added, replaced and removed
async function cutDiamond(
  diamond,
  maxPriorityFeePerGas,
  deployedFacets,
  initializationAddress,
  initializeCalldata,
  facetsToRemove = []
) {
  const diamondCutFacet = await ethers.getContractAt("DiamondCutFacet", diamond);

  const cut = deployedFacets.reduce((acc, val) => {
    val.cut.forEach((c) => acc.push(c));
    return acc;
  }, []);

  const transactionResponse = await diamondCutFacet.diamondCut(
    [...facetsToRemove, ...cut],
    initializationAddress,
    initializeCalldata,
    await getFees(maxPriorityFeePerGas)
  );

  await transactionResponse.wait(confirmations);

  return transactionResponse;
}

exports.getSelectors = getSelectors;
exports.getSelector = getSelector;
exports.FacetCutAction = FacetCutAction;
exports.remove = remove;
exports.removeSelectors = removeSelectors;
exports.findAddressPositionInFacets = findAddressPositionInFacets;
exports.getFacetAddCut = getFacetAddCut;
exports.getFacetReplaceCut = getFacetReplaceCut;
exports.getFacetRemoveCut = getFacetRemoveCut;
exports.getInterfaceId = getInterfaceId;
exports.getStateModifyingFunctions = getStateModifyingFunctions;
exports.getStateModifyingFunctionsHashes = getStateModifyingFunctionsHashes;
exports.cutDiamond = cutDiamond;
exports.getInitializeCalldata = getInitializeCalldata;
