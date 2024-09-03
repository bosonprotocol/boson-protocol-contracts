const hre = require("hardhat");
const { ethers } = hre;
const { getContractAt, getContractFactory, ZeroAddress } = ethers;
const environments = require("../../environments");
const tipMultiplier = BigInt(environments.tipMultiplier);
const tipSuggestion = 1500000000n; // js always returns this constant, it does not vary per block
const maxPriorityFeePerGas = BigInt(tipSuggestion) * tipMultiplier;
const { getFees, readContracts } = require("./../util/utils");
const confirmations = hre.network.name == "hardhat" ? 1 : environments.confirmations;
const abiCoder = new ethers.AbiCoder();
const network = hre.network.name;

let backFillData = {};

async function preUpgrade(protocolAddress, facets, env) {
  const { sellerIds, royaltyPercentages, offerIds } = backFillData;
  console.log("Backfilling sellers and offers...");
  console.log("royaltyPercentages", royaltyPercentages);
  console.log("sellerIds", sellerIds);
  console.log("offerIds", offerIds);

  const maxBackfill = 100; // max number of sellers and offers to backfill in a single transaction

  // Backfill the data pre-upgrade
  let totalCount =
    sellerIds.reduce((acc, val) => acc + val.length, 0) + offerIds.reduce((acc, val) => acc + val.length, 0);
  let backfillCount = Math.floor(totalCount / maxBackfill);

  let deployedFacets = [];
  if (backfillCount > 0) {
    const diamondCutFacet = await getContractAt("DiamondCutFacet", protocolAddress);
    const protocolInitializationContractFactory = await getContractFactory("ProtocolInitializationHandlerFacet");
    const protocolInitializationFacet = await protocolInitializationContractFactory.deploy(
      await getFees(maxPriorityFeePerGas)
    );
    await protocolInitializationFacet.waitForDeployment(confirmations);

    const deployedFacet = {
      name: "ProtocolInitializationHandlerFacet",
      contract: protocolInitializationFacet,
      cut: [],
      constructorArgs: [],
    };

    deployedFacets.push(deployedFacet);

    facets.addOrUpgrade = facets.addOrUpgrade.filter((f) => f !== "ProtocolInitializationHandlerFacet");

    while (totalCount >= maxBackfill) {
      // need to backfill with `initV2_4_0External`

      let sliceCount = 0;
      const royaltyPercentagesSlice = [];
      const sellerIdsSlice = [];
      const offerIdsSlice = [];

      while (sliceCount < maxBackfill) {
        royaltyPercentagesSlice.push(royaltyPercentages[0]);
        const sellerIdsSliceByPercentage = sellerIds[0].slice(0, maxBackfill - sliceCount);

        sellerIds[0] = sellerIds[0].slice(maxBackfill - sliceCount);

        const remainingSlots = Math.max(maxBackfill - sliceCount - sellerIdsSliceByPercentage.length, 0);

        sliceCount += sellerIdsSliceByPercentage.length;

        const offerIdsSliceByPercentage = offerIds[0].slice(0, remainingSlots);
        offerIds[0] = offerIds[0].slice(remainingSlots);

        sliceCount += offerIdsSliceByPercentage.length;

        if (sellerIds[0].length == 0 && offerIds[0].length == 0) {
          sellerIds.shift();
          offerIds.shift();
          royaltyPercentages.shift();
        }

        sellerIdsSlice.push(sellerIdsSliceByPercentage);
        offerIdsSlice.push(offerIdsSliceByPercentage);
      }

      totalCount -= sliceCount;

      const initializationData = abiCoder.encode(
        ["uint256[]", "uint256[][]", "uint256[][]", "address"],
        [royaltyPercentagesSlice, sellerIdsSlice, offerIdsSlice, ZeroAddress]
      );

      console.log(`Backfilling sellers and offers... #${backfillCount--}`);
      console.log([royaltyPercentagesSlice, sellerIdsSlice, offerIdsSlice, ZeroAddress]);
      const calldataProtocolInitialization = protocolInitializationFacet.interface.encodeFunctionData(
        "initV2_4_0External",
        [initializationData]
      );

      // Make the "cut", i.e. call initV2_4_0External via diamond
      await diamondCutFacet.diamondCut(
        [],
        await protocolInitializationFacet.getAddress(),
        calldataProtocolInitialization,
        await getFees(maxPriorityFeePerGas)
      );
    }
  }

  // Prepare initialization data
  // Backfill the remaining data
  const { chainId } = await ethers.provider.getNetwork();
  const contractsFile = readContracts(chainId, network, env);
  let contracts = contractsFile?.contracts;
  const priceDiscoveryClientAddress = contracts.find((c) => c.name === "BosonPriceDiscoveryClient")?.address;
  console.log("remaining data");
  console.log([royaltyPercentages, sellerIds, offerIds, priceDiscoveryClientAddress]);
  facets.initializationData = abiCoder.encode(
    ["uint256[]", "uint256[][]", "uint256[][]", "address"],
    [royaltyPercentages, sellerIds, offerIds, priceDiscoveryClientAddress]
  );

  return { facets, deployedFacets };
}

exports.preUpgrade = preUpgrade;
exports.backFillData = function (data) {
  backFillData = data;
};
