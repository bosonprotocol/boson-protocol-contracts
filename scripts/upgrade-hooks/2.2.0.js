const { ethers } = require("hardhat");
const environments = require("../../environments");
const tipMultiplier = ethers.BigNumber.from(environments.tipMultiplier);
const tipSuggestion = "1500000000"; // ethers.js always returns this constant, it does not vary per block
const maxPriorityFeePerGas = ethers.BigNumber.from(tipSuggestion).mul(tipMultiplier);
const { getFees } = require("./../util/utils");

const PausableRegion = require("../domain/PausableRegion.js");

async function preUpgrade(protocolAddress, facets) {
  // Pause the exchanges region of the protocol
  const pauseHandler = await ethers.getContractAt("IBosonPauseHandler", protocolAddress);
  await pauseHandler.pause([PausableRegion.Exchanges], await getFees(maxPriorityFeePerGas));

  // Get next exchange Id
  const exchangeHandler = await ethers.getContractAt("IBosonExchangeHandler", protocolAddress);
  const nextExchangeId = await exchangeHandler.getNextExchangeId();
  facets.facetsToInit.ExchangeHandlerFacet.constructorArgs = [nextExchangeId];

  return facets;
}

async function postUpgrade(protocolAddress) {
  // Unpause the protocol
  const pauseHandler = await ethers.getContractAt("IBosonPauseHandler", protocolAddress);
  await pauseHandler.unpause(await getFees(maxPriorityFeePerGas));
}

exports.preUpgrade = preUpgrade;
exports.postUpgrade = postUpgrade;
