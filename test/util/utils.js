const { ethers } = require("hardhat");
const { utils, provider, BigNumber, keccak256, RLP, getSigners } = ethers;
const { getFacets } = require("../../scripts/config/facet-deploy.js");
const { oneWeek, oneMonth, maxPriorityFeePerGas } = require("./constants");
const Role = require("../../scripts/domain/Role");
const { expect } = require("chai");
const Offer = require("../../scripts/domain/Offer");

function getEvent(receipt, factory, eventName) {
  let found = false;

  const eventFragment = factory.interface.fragments.filter((e) => e.name == eventName);
  const iface = new utils.Interface(eventFragment);

  for (const log in receipt.logs) {
    const topics = receipt.logs[log].topics;

    for (const index in topics) {
      const encodedTopic = topics[index];

      try {
        // CHECK IF TOPIC CORRESPONDS TO THE EVENT GIVEN TO FN
        const event = iface.getEvent(encodedTopic);

        if (event.name == eventName) {
          found = true;
          const eventArgs = iface.parseLog(receipt.logs[log]).args;
          return eventArgs;
        }
      } catch (e) {
        if (e.message.includes("no matching event")) continue;
        console.log("event error: ", e);
        throw new Error(e);
      }
    }
  }

  if (!found) {
    throw new Error(`Event with name ${eventName} was not emitted!`);
  }
}

function eventEmittedWithArgs(receipt, factory, eventName, args) {
  let found = false;
  let match = false;

  const eventFragment = factory.interface.fragments.filter((e) => e.name == eventName);
  const iface = new utils.Interface(eventFragment);

  for (const log in receipt.logs) {
    const topics = receipt.logs[log].topics;

    for (const index in topics) {
      const encodedTopic = topics[index];

      try {
        // CHECK IF TOPIC CORRESPONDS TO THE EVENT GIVEN TO FN
        const event = iface.getEvent(encodedTopic);

        if (event.name == eventName) {
          found = true;
          const eventArgs = iface.parseLog(receipt.logs[log]).args;
          match = compareArgs(eventArgs, args);
          return match;
        }
      } catch (e) {
        if (e.message.includes("no matching event")) continue;
        console.log("event error: ", e);
        throw new Error(e);
      }
    }
  }

  if (!found) {
    throw new Error(`Event with name ${eventName} was not emitted!`);
  }
}

function compareArgs(eventArgs, args) {
  //loop over args because eventArgs always have 2 entries for each argument
  let i = args.length;
  while (i--) {
    if (args[i] != eventArgs[i]) return false;
  }

  return true;
}

/** Predicate to compare offer structs in emitted events
 * Bind expected offer struct to this function and pass it to .withArgs() instead of the expected offer struct
 * If returned and expected offer structs are equal, the test will pass, otherwise it raises an error
 * 
 * Example
 * 
 *  await expect(
        offerHandler.connect(assistant).createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId)
      )
        .to.emit(offerHandler, "OfferCreated")
        .withArgs(
          nextOfferId,
          offer.sellerId,
          compareOfferStructs.bind(offerStruct),  <====== BIND OFFER STRUCT TO THIS FUNCTION
          offerDatesStruct,
          offerDurationsStruct,
          disputeResolutionTermsStruct,
          offerFeesStruct,
          agentId,
          assistant.address,
        );
 * 
 * @param {*} returnedOffer 
 * @returns 
 */
function compareOfferStructs(returnedOffer) {
  expect(Offer.fromStruct(returnedOffer).toStruct()).to.deep.equal(this);
  return true;
}

async function setNextBlockTimestamp(timestamp) {
  if (typeof timestamp == "string" && timestamp.startsWith("0x0") && timestamp.length > 3)
    timestamp = "0x" + timestamp.substring(3);
  await provider.send("evm_setNextBlockTimestamp", [timestamp]);
  await provider.send("evm_mine", []);
}

function getSignatureParameters(signature) {
  if (!utils.isHexString(signature)) {
    throw new Error('Given value "'.concat(signature, '" is not a valid hex string.'));
  }

  signature = signature.substring(2);
  const r = "0x" + signature.substring(0, 64);
  const s = "0x" + signature.substring(64, 128);
  const v = parseInt(signature.substring(128, 130), 16);

  return {
    r: r,
    s: s,
    v: v,
  };
}

async function prepareDataSignatureParameters(
  user,
  customTransactionTypes,
  primaryType,
  message,
  forwarderAddress,
  domainName = "Boson Protocol",
  domainVersion = "V2",
  type = "Protocol"
) {
  // Initialize data
  const domainType =
    type == "Protocol"
      ? [
          { name: "name", type: "string" },
          { name: "version", type: "string" },
          { name: "verifyingContract", type: "address" },
          { name: "salt", type: "bytes32" },
        ]
      : [
          { name: "name", type: "string" },
          { name: "version", type: "string" },
          { name: "chainId", type: "uint256" },
          { name: "verifyingContract", type: "address" },
        ];

  const domainData = {
    name: domainName ?? "Boson Protocol",
    version: domainVersion ?? "V2",
    verifyingContract: forwarderAddress,
  };

  if (type == "Protocol") {
    //hardhat default chain id is 31337
    domainData.salt = utils.hexZeroPad(BigInt(31337).toHexString(), 32);
  } else {
    const { chainId } = await provider.getNetwork();
    domainData.chainId = chainId;
  }

  // Prepare the types
  let metaTxTypes = {
    EIP712Domain: domainType,
  };
  metaTxTypes = Object.assign({}, metaTxTypes, customTransactionTypes);

  // Prepare the data to sign
  let dataToSign = JSON.stringify({
    types: metaTxTypes,
    domain: domainData,
    primaryType: primaryType,
    message: message,
  });

  // Sign the data
  const signature = await provider.send("eth_signTypedData_v4", [user.address, dataToSign]);

  // Collect the Signature components
  const { r, s, v } = getSignatureParameters(signature);

  return {
    r: r,
    s: s,
    v: v,
    signature,
  };
}

function calculateVoucherExpiry(block, voucherRedeemableFromDate, voucherValidDuration) {
  const startDate = BigInt(block.timestamp)>BigInt(voucherRedeemableFromDate)
    ? BigInt(block.timestamp)
    : BigInt(voucherRedeemableFromDate);
  return startDate+BigInt(voucherValidDuration).toString();
}

function applyPercentage(base, percentage) {
return BigInt(base)*BigInt(percentage)/BigInt(10000);
}

function calculateContractAddress(senderAddress, senderNonce) {
  const nonce = BigInt(senderNonce);
  const nonceHex = nonce.eq(0) ? "0x" : nonce.toHexString();

  const input_arr = [senderAddress, nonceHex];
  const rlp_encoded = RLP.encode(input_arr);

  const contract_address_long = keccak256(rlp_encoded);

  const contract_address = "0x" + contract_address_long.substring(26); //Trim the first 24 characters.

  return utils.getAddress(contract_address);
}

const paddingType = {
  NONE: 0,
  START: 1,
  END: 2,
};

function getMappingStoragePosition(slot, key, padding = paddingType.NONE) {
  let keyBuffer;
  switch (padding) {
    case paddingType.NONE:
      keyBuffer = utils.toUtf8Bytes(key);
      break;
    case paddingType.START:
      keyBuffer = Buffer.from(utils.hexZeroPad(key, 32).toString().slice(2), "hex");
      break;
    case paddingType.END:
      keyBuffer = Buffer.from(key.slice(2).padEnd(64, "0"), "hex"); // assume key is prefixed with 0x
      break;
  }
  const pBuffer = Buffer.from(slot.toHexString().slice(2), "hex");
  return keccak256(Buffer.concat([keyBuffer, pBuffer]));
}

async function getFacetsWithArgs(facetNames, config) {
  const facets = await getFacets(config);
  const keys = Object.keys(facets).filter((key) => facetNames.includes(key));
  return keys.reduce((obj, key) => {
    obj[key] = facets[key];
    return obj;
  }, {});
}

function objectToArray(input) {
  // If the input is not an object, return it as-is
  if (BigNumber.isBigNumber(input) || typeof input !== "object" || input === null) {
    return input;
  }

  // If the input is an array, convert its elements recursively
  if (Array.isArray(input)) {
    return input.map((element) => objectToArray(element));
  }

  // If the input is an object, convert its properties recursively
  const keys = Object.keys(input);
  const result = new Array(keys.length);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const value = objectToArray(input[key]);
    result[i] = value;
  }
  return result;
}

async function setupTestEnvironment(contracts, { bosonTokenAddress, forwarderAddress } = {}) {
  // Load modules only here to avoid the caching issues in upgrade tests
  const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
  const { deployProtocolClients } = require("../../scripts/util/deploy-protocol-clients");
  const { deployAndCutFacets } = require("../../scripts/util/deploy-protocol-handler-facets");

  const facetNames = [
    "SellerHandlerFacet",
    "BuyerHandlerFacet",
    "AgentHandlerFacet",
    "DisputeResolverHandlerFacet",
    "ExchangeHandlerFacet",
    "OfferHandlerFacet",
    "GroupHandlerFacet",
    "TwinHandlerFacet",
    "BundleHandlerFacet",
    "DisputeHandlerFacet",
    "FundsHandlerFacet",
    "OrchestrationHandlerFacet1",
    "OrchestrationHandlerFacet2",
    "PauseHandlerFacet",
    "AccountHandlerFacet",
    "ProtocolInitializationHandlerFacet",
    "ConfigHandlerFacet",
    "MetaTransactionsHandlerFacet",
  ];

  const signers = await getSigners();
  const [deployer, protocolTreasury, bosonToken, pauser] = signers;

  // Deploy the Protocol Diamond
  const [protocolDiamond, , , , accessController] = await deployProtocolDiamond(maxPriorityFeePerGas);

  // Temporarily grant UPGRADER role to deployer account
  await accessController.grantRole(Role.UPGRADER, deployer.address);

  // Grant PROTOCOL role to ProtocolDiamond address and renounces admin
  await accessController.grantRole(Role.PROTOCOL, protocolDiamond.address);

  // Grant PAUSER role to pauser account
  await accessController.grantRole(Role.PAUSER, pauser.address);

  // Deploy the Protocol client implementation/proxy pairs (currently just the Boson Voucher)
  const protocolClientArgs = [protocolDiamond.address];
  const [implementations, beacons, proxies, clients] = await deployProtocolClients(
    protocolClientArgs,
    maxPriorityFeePerGas,
    forwarderAddress
  );
  const [beacon] = beacons;
  const [proxy] = proxies;
  const [bosonVoucher] = clients;
  const [voucherImplementation] = implementations;

  // set protocolFees
  const protocolFeePercentage = "200"; // 2 %
  const protocolFeeFlatBoson = parseUnits("0.01", "ether").toString();
  const buyerEscalationDepositPercentage = "1000"; // 10%

  // Add config Handler, so ids start at 1, and so voucher address can be found
  const protocolConfig = [
    // Protocol addresses
    {
      treasury: protocolTreasury.address,
      token: bosonTokenAddress || bosonToken.address,
      voucherBeacon: beacon.address,
      beaconProxy: proxy.address,
    },
    // Protocol limits
    {
      maxExchangesPerBatch: 100,
      maxOffersPerGroup: 100,
      maxTwinsPerBundle: 100,
      maxOffersPerBundle: 100,
      maxOffersPerBatch: 100,
      maxTokensPerWithdrawal: 100,
      maxFeesPerDisputeResolver: 100,
      maxEscalationResponsePeriod: oneMonth,
      maxDisputesPerBatch: 100,
      maxAllowedSellers: 100,
      maxTotalOfferFeePercentage: 4000, //40%
      maxRoyaltyPecentage: 1000, //10%
      maxResolutionPeriod: oneMonth,
      minDisputePeriod: oneWeek,
      maxPremintedVouchers: 10000,
    },
    // Protocol fees
    {
      percentage: protocolFeePercentage,
      flatBoson: protocolFeeFlatBoson,
      buyerEscalationDepositPercentage,
    },
  ];

  const facetsToDeploy = await getFacetsWithArgs(facetNames, protocolConfig);

  // Cut the protocol handler facets into the Diamond
  await deployAndCutFacets(protocolDiamond.address, facetsToDeploy, maxPriorityFeePerGas);

  let contractInstances = {};
  for (const contract of Object.keys(contracts)) {
    contractInstances[contract] = await getContractAt(contracts[contract], protocolDiamond.address);
  }

  const extraReturnValues = { accessController, bosonVoucher, voucherImplementation, beacon };

  return {
    signers: signers.slice(3),
    contractInstances,
    protocolConfig,
    diamondAddress: protocolDiamond.address,
    extraReturnValues,
  };
}

async function getSnapshot() {
  return await provider.send("evm_snapshot", []);
}

async function revertToSnapshot(snapshotId) {
  return await provider.send("evm_revert", [snapshotId]);
}

function deriveTokenId(offerId, exchangeId) {
  return BigInt(offerId).shl(128)+exchangeId;
}

exports.setNextBlockTimestamp = setNextBlockTimestamp;
exports.getEvent = getEvent;
exports.eventEmittedWithArgs = eventEmittedWithArgs;
exports.prepareDataSignatureParameters = prepareDataSignatureParameters;
exports.calculateVoucherExpiry = calculateVoucherExpiry;
exports.calculateContractAddress = calculateContractAddress;
exports.applyPercentage = applyPercentage;
exports.getMappingStoragePosition = getMappingStoragePosition;
exports.paddingType = paddingType;
exports.getFacetsWithArgs = getFacetsWithArgs;
exports.compareOfferStructs = compareOfferStructs;
exports.objectToArray = objectToArray;
exports.setupTestEnvironment = setupTestEnvironment;
exports.getSnapshot = getSnapshot;
exports.revertToSnapshot = revertToSnapshot;
exports.deriveTokenId = deriveTokenId;
