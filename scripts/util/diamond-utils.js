const hre = require("hardhat");
const { keccak256, toUtf8Bytes, getContractAt, ZeroAddress } = hre.ethers;;
const environments = "../../environments.js";
const confirmations = hre.network.name === "hardhat" ? 1 : environments.confirmations;
const FacetCutAction = require("../domain/FacetCutAction");
const { interfacesWithMultipleArtifacts } = require("./constants");
const { getFees } = require("./utils");

function removeNativeFunctions(interface) {
  return Object.keys(interface).filter(key => !["deploy", "fragments", "fallback", "receive"].includes(key));
}

/**
 * Utilities for testing and interacting with Diamond
 *
 * @author Nick Mudge <nick@perfectabstractions.com> (https://twitter.com/mudgen)
 */
// get function selectors from ABI
function getSelectors(contract, returnSignatureToNameMapping = false) {
  const signatures =removeNativeFunctions(contract.interface);
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
 const contract = await getContractAt(contractName, ZeroAddress);
  const signatures = removeNativeFunctions(contract.interface);
  const selectors = signatures.reduce((acc, val) => {
    acc.push(BigInt(contract[val].getSighash()));
    return acc;
  }, []);

  let interfaceId = selectors.reduce((pv, cv) => pv ^ cv, BigInt(0x00000000));

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

      const baseContractInterfaceId = BigInt(
        await getInterfaceId(
          interfacesWithMultipleArtifacts.includes(baseName)
            ? `contracts/interfaces/${baseName}.sol:${baseName}`
            : baseName,
          false,
          isFullPath
        )
      );

      // Remove interface id of base contracts
      interfaceId = interfaceId ^baseContractInterfaceId;
    }
  }
  return interfaceId == 0n ? "0x00000000" : hexZeroPad(interfaceId.toHexString(), 4);
}

// get function selector from function signature
function getSelector(func) {
  const abiInterface = new Interface([func]);
  return abiInterface.getSighash(Fragment.from(func));
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
  const iface = new Interface(signatures.map((v) => "function " + v));
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

async function getStateModifyingFunctions(facetNames, omitFunctions = [], onlyFunctions = []) {
  let stateModifyingFunctions = [];
  for (const facetName of facetNames) {
    let FacetContractFactory = await getContractFactory(facetName);
    const functions = FacetContractFactory.interface.functions;
    const functionNames = Object.keys(functions);
    const facetStateModifyingFunctions = functionNames.filter((fn) => {
      if (functions[fn].stateMutability !== "view" && !omitFunctions.includes(fn)) {
        if (onlyFunctions.length === 0) {
          return true;
        }
        for (const func of onlyFunctions) {
          if (fn.includes(func)) {
            return true;
          }
        }
      }
      return false;
    });

    stateModifyingFunctions = stateModifyingFunctions.concat(facetStateModifyingFunctions);
  }

  return stateModifyingFunctions;
}

function getStateModifyingFunctionsHashes(facetNames, omitFunctions = [], onlyFunctions = []) {
  return async function getFunctionsHashes() {
    //  Allowlist contract methods
    const stateModifyingFunctions = await getStateModifyingFunctions(
      facetNames,
      [...omitFunctions, "initialize()"],
      onlyFunctions
    );
    return stateModifyingFunctions.map((smf) => keccak256(toUtf8Bytes(smf)));
  };
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
  version = formatBytes32String(version);
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
  const diamondCutFacet = await getContractAt("DiamondCutFacet", diamond);

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
