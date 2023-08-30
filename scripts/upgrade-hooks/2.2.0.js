const { ethers } = require("hardhat");
const { getContractAt } = ethers;
const environments = require("../../environments");
const tipMultiplier = BigInt(environments.tipMultiplier);
const tipSuggestion = 1500000000n; // js always returns this constant, it does not vary per block
const maxPriorityFeePerGas = BigInt(tipSuggestion) * tipMultiplier;
const { getFees } = require("./../util/utils");

const PausableRegion = require("../domain/PausableRegion.js");

async function preUpgrade(protocolAddress, facets) {
  // Pause the exchanges region of the protocol
  console.log("Pausing the protocol...");
  const pauseHandler = await getContractAt("IBosonPauseHandler", protocolAddress);
  await pauseHandler.pause([PausableRegion.Exchanges], await getFees(maxPriorityFeePerGas));

  // Get next exchange Id
  const exchangeHandler = await getContractAt("IBosonExchangeHandler", protocolAddress);
  const nextExchangeId = await exchangeHandler.getNextExchangeId();
  facets.facetsToInit.ExchangeHandlerFacet.constructorArgs = [nextExchangeId];

  return facets;
}

async function postUpgrade(protocolAddress) {
  // Unpause the protocol
  console.log("Unpausing the protocol...");
  const pauseHandler = await getContractAt("IBosonPauseHandler", protocolAddress);
  await pauseHandler.unpause(await getFees(maxPriorityFeePerGas));
}

exports.preUpgrade = preUpgrade;
exports.postUpgrade = postUpgrade;
