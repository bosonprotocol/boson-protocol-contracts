const hre = require("hardhat");
const { keccak256, toUtf8Bytes, getContractAt, ZeroAddress, Interface, getContractFactory, encodeBytes32String } =
  hre.ethers;
const environments = "../../environments.js";

const confirmations = hre.network.name === "hardhat" ? 1 : environments.confirmations;
const FacetCutAction = require("../domain/FacetCutAction");
const { interfacesWithMultipleArtifacts } = require("./constants");
const { getFees, toHexString } = require("./utils");

/**
 * Utilities for testing and interacting with Diamond
 *
 * @author Nick Mudge <nick@perfectabstractions.com> (https://twitter.com/mudgen)
 */
// get function selectors from ABI
function getSelectors(contract, returnSignatureToNameMapping = false) {
  let signatureToNameMapping = {};
  const selectors = contract.interface.fragments
    .filter((f) => f.type == "function" && f.name !== "init")
    .map((f) => {
      if (returnSignatureToNameMapping) signatureToNameMapping[f.selector] = f.name;
      return f.selector;
    });

  selectors.contract = contract;
  selectors.remove = remove;
  selectors.get = get;
  if (returnSignatureToNameMapping) return { selectors, signatureToNameMapping };
  return selectors;
}

// get interface id
async function getInterfaceId(contractName, skipBaseCheck = false, isFullPath = false) {
  const contract = await getContractAt(contractName, ZeroAddress);
  const fragments = contract.interface.fragments.filter((f) => f.type == "function");
  const selectors = fragments.reduce((acc, val) => {
    acc.push(val.selector);
    return acc;
  }, []);

  let interfaceId = selectors.reduce((pv, cv) => pv ^ BigInt(cv), BigInt(0x00000000));

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
      interfaceId = interfaceId ^ baseContractInterfaceId;
    }
  }
  return interfaceId == 0n ? "0x00000000" : toHexString(interfaceId, { startPad: 8 });
}

// used with getSelectors to remove selectors from an array of selectors
function remove(selectorsToRemove) {
  const selectors = this.filter((v) => {
    for (const selector of selectorsToRemove) {
      if (v === selector) {
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
  const selectors = this.contract.interface.fragments
    .filter((f) => f.type == "function")
    .filter((f) => functionNames.includes(f.name))
    .map((f) => f.selector);

  selectors.contract = this.contract;
  selectors.remove = this.remove;
  selectors.get = this.get;
  return selectors;
}

// remove selectors using an array of signatures
function removeSelectors(selectors, signatures) {
  const iface = new Interface(signatures.map((v) => "function " + v));
  const removeSelectors = iface.fragments.map((f) => f.selector);
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

async function getFacetAddCut(facet, omitFunctions = []) {
  let selectors = omitFunctions.length ? getSelectors(facet).remove(omitFunctions) : getSelectors(facet);
  const address = await facet.getAddress();
  return [address, FacetCutAction.Add, selectors];
}

async function getFacetReplaceCut(facet, omitFunctions = []) {
  let selectors = omitFunctions.length ? getSelectors(facet).remove(omitFunctions) : getSelectors(facet);
  const address = await facet.getAddress();
  return [address, FacetCutAction.Replace, selectors];
}

async function getFacetRemoveCut(facet, omitFunctions = []) {
  let selectors = omitFunctions.length ? getSelectors(facet).remove(omitFunctions) : getSelectors(facet);
  const address = await facet.getAddress();
  return [address, FacetCutAction.Remove, selectors];
}

async function getStateModifyingFunctions(facetNamesOrAbis, omitFunctions = [], onlyFunctions = [], isAbi = false) {
  let stateModifyingFunctions = [];
  for (const facetNameOrAbi of facetNamesOrAbis) {
    let FacetContractFactory = isAbi
      ? new hre.ethers.Contract(ZeroAddress, facetNameOrAbi)
      : await getContractFactory(facetNameOrAbi);
    const functions = FacetContractFactory.interface.fragments;
    const facetStateModifyingFunctions = functions
      .filter((fn) => {
        if (fn.type == "function" && fn.stateMutability !== "view" && !omitFunctions.some((f) => fn.name.includes(f))) {
          if (onlyFunctions.length === 0) {
            return true;
          }

          if (onlyFunctions.some((f) => fn.name.includes(f))) {
            return true;
          }
        }
        return false;
      })
      .map((fn) => fn.format("sighash"));

    stateModifyingFunctions = stateModifyingFunctions.concat(facetStateModifyingFunctions);
  }

  return stateModifyingFunctions;
}

function getStateModifyingFunctionsHashes(facetNames, omitFunctions = [], onlyFunctions = [], isAbi = false) {
  return async function getFunctionsHashes() {
    //  Allowlist contract methods
    const stateModifyingFunctions = await getStateModifyingFunctions(
      facetNames,
      [...omitFunctions, "initialize"],
      onlyFunctions,
      isAbi
    );
    return stateModifyingFunctions.map((smf) => keccak256(toUtf8Bytes(smf)));
  };
}

// Get ProtocolInitializationHandlerFacet initialize calldata to be called on diamondCut
async function getInitializeCalldata(
  facetsToInitialize,
  version,
  isUpgrade,
  initializationData,
  initializationFacet = "0x",
  interfacesToRemove = [],
  interfacesToAdd = []
) {
  version = encodeBytes32String(version);
  const addresses = await facetsToInitialize.map((f) => f.contract.target);

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
