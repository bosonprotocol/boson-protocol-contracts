const { ethers } = require("hardhat");
const {
  getAddress,
  provider,
  keccak256,
  encodeRlp,
  getSigners,
  parseUnits,
  getContractAt,
  toBeArray,
  isHexString,
  zeroPadValue,
  Interface,
  toUtf8Bytes,
  solidityPackedKeccak256,
  ZeroAddress,
  ZeroHash,
} = ethers;
const { getFacets } = require("../../scripts/config/facet-deploy.js");
const { oneWeek, oneMonth, maxPriorityFeePerGas } = require("./constants");
const Role = require("../../scripts/domain/Role");
const { toHexString } = require("../../scripts/util/utils.js");
const { expect } = require("chai");
const Offer = require("../../scripts/domain/Offer");
const { RoyaltyRecipientInfoList } = require("../../scripts/domain/RoyaltyRecipientInfo.js");
const { RoyaltyInfo } = require("../../scripts/domain/RoyaltyInfo.js");

function getEvent(receipt, factory, eventName) {
  let found = false;

  const eventFragment = factory.interface.fragments.filter((e) => e.name == eventName);
  const iface = new Interface(eventFragment);

  for (const log in receipt.logs) {
    const topics = receipt.logs[log].topics;

    for (const index in topics) {
      const encodedTopic = topics[index];

      try {
        // CHECK IF TOPIC CORRESPONDS TO THE EVENT GIVEN TO FN
        const event = iface.getEvent(encodedTopic);

        if (event && event.name == eventName) {
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
  const iface = new Interface(eventFragment);

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
        offerHandler.connect(assistant).createOffer(offer, offerDates, offerDurations, disputeResolver.id, agentId, offerFeeLimit)
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
          await assistant.getAddress(),
        );
 * 
 * @param {*} returnedOffer 
 * @returns 
 */
function compareOfferStructs(returnedOffer) {
  expect(Offer.fromStruct(returnedOffer).toStruct()).to.deep.equal(this);
  return true;
}

// ToDo: make a generic predicate for comparing structs
/** Predicate to compare RoyaltyRecipientInfoList in emitted events
 * Bind Royalty Recipient List to this function and pass it to .withArgs() instead of the expected Royalty recipient list
 * If returned and expected Royalty Recipient Lists are equal, the test will pass, otherwise it raises an error
 * 
 * Example
 * 
 * await expect(tx)
    .to.emit(accountHandler, "RoyaltyRecipientsChanged")
    .withArgs(seller.id, compareRoyaltyRecipientInfoList.bind(expectedRoyaltyRecipientInfoList.toStruct()), admin.address);
 * 
 * @param {*} returnedRoyaltyRecipientInfoList 
 * @returns 
 */
function compareRoyaltyRecipientInfoLists(returnedRoyaltyRecipientInfoList) {
  expect(RoyaltyRecipientInfoList.fromStruct(returnedRoyaltyRecipientInfoList).toStruct()).to.deep.equal(this);
  return true;
}

/** Predicate to compare RoyaltyInfo in emitted events
 * Bind Royalty Info to this function and pass it to .withArgs() instead of the expected Royalty Info struct
 * If returned and expected Royalty Infos are equal, the test will pass, otherwise it raises an error
 *
 * @param {*} returnedRoyaltyInfo
 * @returns
 */
function compareRoyaltyInfo(returnedRoyaltyInfo) {
  expect(RoyaltyInfo.fromStruct(returnedRoyaltyInfo).toStruct()).to.deep.equal(this);
  return true;
}

/** Predicate to compare protocol version in emitted events
 * Bind expected protocol version to this function and pass it to .withArgs() instead of the expected protocol version
 * If trimmed returned and expected versions are equal, the test will pass, otherwise it raises an error
 *
 * @param {*} returnedRoyaltyInfo
 * @returns equality of expected and returned protocol versions
 */
function compareProtocolVersions(returnedVersion) {
  // trim returned version
  const trimmedReturnedVersion = returnedVersion.replace(/\0/g, "");

  return trimmedReturnedVersion == this;
}

async function setNextBlockTimestamp(timestamp, mine = false) {
  if (typeof timestamp == "string" && timestamp.startsWith("0x0") && timestamp.length > 3)
    timestamp = "0x" + timestamp.substring(3);
  await provider.send("evm_setNextBlockTimestamp", [timestamp]);

  // when testing static call, a block must be mined to get the correct timestamp
  if (mine) await provider.send("evm_mine", []);
}

async function getCurrentBlockAndSetTimeForward(seconds) {
  const blockNumber = await provider.getBlockNumber();
  const block = await provider.getBlock(blockNumber);
  const newTime = block.timestamp + Number(seconds);
  await setNextBlockTimestamp(newTime);
}

function getSignatureParameters(signature) {
  if (!isHexString(signature)) {
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
    domainData.salt = zeroPadValue(toHexString(31337n), 32);
  } else {
    const { chainId } = await provider.getNetwork();
    domainData.chainId = chainId.toString();
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
  const signature = await provider.send("eth_signTypedData_v4", [await user.getAddress(), dataToSign]);

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
  const startDate =
    BigInt(block.timestamp) > BigInt(voucherRedeemableFromDate)
      ? BigInt(block.timestamp)
      : BigInt(voucherRedeemableFromDate);
  return (startDate + BigInt(voucherValidDuration)).toString();
}

function applyPercentage(base, percentage) {
  return ((BigInt(base) * BigInt(percentage)) / BigInt(10000)).toString();
}

function calculateContractAddress(senderAddress, senderNonce) {
  const nonce = BigInt(senderNonce);
  const nonceHex = nonce == 0n ? "0x" : toBeArray(nonce);

  const input_arr = [senderAddress, nonceHex];
  const rlp_encoded = encodeRlp(input_arr);

  const contract_address_long = keccak256(rlp_encoded);

  const contract_address = "0x" + contract_address_long.substring(26); //Trim the first 24 characters.

  return getAddress(contract_address);
}

function calculateContractAddress2(senderAddress, cloneByteCodeHash, salt) {
  const contract_address_long = solidityPackedKeccak256(
    ["bytes1", "address", "bytes32", "bytes32"],
    ["0xFF", senderAddress, salt, cloneByteCodeHash]
  );

  const contract_address = "0x" + contract_address_long.substring(26); //Trim the first 24 characters.

  return getAddress(contract_address);
}

function getCloneByteCodeHash(beaconProxyAddress) {
  return keccak256(
    `0x3d602d80600a3d3981f3363d3d373d3d3d363d73${beaconProxyAddress.slice(2)}5af43d82803e903d91602b57fd5bf3`
  );
}

function getCollectionSalt(sellerSalt, collectionSalt) {
  return solidityPackedKeccak256(["bytes32", "bytes32"], [sellerSalt, collectionSalt]);
}

function getSellerSalt(sellerAdmin, sellerSalt) {
  return solidityPackedKeccak256(["address", "bytes32"], [sellerAdmin, sellerSalt]);
}

function calculateCloneAddress(
  voucherCreator,
  beaconProxyAddress,
  sellerAddress,
  collectionSalt = ZeroHash,
  creationSalt = ZeroHash
) {
  const cloneByteCodeHash = getCloneByteCodeHash(beaconProxyAddress);
  const sellerSalt = getSellerSalt(sellerAddress, creationSalt);
  const salt = getCollectionSalt(sellerSalt, collectionSalt);
  return calculateContractAddress2(voucherCreator, cloneByteCodeHash, salt);
}

async function calculateBosonProxyAddress(proxyCreator) {
  const salt = solidityPackedKeccak256(["string"], ["BosonVoucherProxy"]);
  const { bytecode } = await ethers.getContractFactory("BeaconClientProxy");
  const byteCodeHash = keccak256(bytecode);
  return calculateContractAddress2(proxyCreator, byteCodeHash, salt);
}

const paddingType = {
  NONE: 0,
  START: 1,
  END: 2,
};

function getMappingStoragePosition(slot, key, padding = paddingType.NONE) {
  let keyBuffer;

  let keyHex = String(key).startsWith("0x") ? String(key) : toHexString(key);

  switch (padding) {
    case paddingType.NONE:
      keyBuffer = toUtf8Bytes(key);
      break;
    case paddingType.START:
      keyBuffer = Buffer.from(zeroPadValue(keyHex, 32).toString().slice(2), "hex");
      break;
    case paddingType.END:
      keyBuffer = Buffer.from(keyHex.slice(2).padEnd(64, "0"), "hex");
      break;
  }

  const slotHex = String(slot).startsWith("0x") ? slot : toHexString(slot);
  const pBuffer = Buffer.from(slotHex.slice(2), "hex"); // slice is used to remove '0x' prefix for Buffer.from
  return keccak256(Buffer.concat([keyBuffer, pBuffer]));
}

async function getFacetsWithArgs(facetNames, config) {
  const facets = await getFacets(config);
  const keys = Object.keys(facets).filter((key) => facetNames.includes(key));
  return keys.reduce((obj, key) => {
    obj[key] = { init: facets[key].init, constructorArgs: facets[key].constructorArgs };
    return obj;
  }, {});
}

function objectToArray(input) {
  // If the input is not an object, return it as-is
  if (typeof input !== "object" || input === null) {
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

const generateOfferId = incrementer();
const offerHandler = {
  get(target, propKey) {
    const original = target[propKey];

    if (typeof original === "function") {
      if (propKey === "connect") {
        return function (...args) {
          const connectedObject = original.apply(target, args);

          return new Proxy(connectedObject, {
            get(target, propKey) {
              const originalMethod = target[propKey];

              if (propKey === "createOffer") {
                return function (...args) {
                  return new Promise((resolve, reject) => {
                    originalMethod
                      .apply(target, args)
                      .then((tx) => {
                        const lastArg = args.at(-1);
                        if (
                          lastArg &&
                          typeof lastArg === "object" &&
                          "getOfferId" in lastArg &&
                          lastArg["getOfferId"]
                        ) {
                          return resolve(generateOfferId.next().value);
                        }
                        return resolve(tx);
                      })
                      .catch(reject);
                  });
                };
              }

              return originalMethod;
            },
          });
        };
      }
    }

    return original;
  },
};
async function setupTestEnvironment(contracts, { bosonTokenAddress, forwarderAddress, wethAddress } = {}) {
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
    "SequentialCommitHandlerFacet",
    "PriceDiscoveryHandlerFacet",
  ];

  const signers = await getSigners();
  const [deployer, protocolTreasury, bosonToken, pauser] = signers;

  // Deploy the Protocol Diamond
  const [protocolDiamond, , , , accessController] = await deployProtocolDiamond(maxPriorityFeePerGas);

  // Temporarily grant UPGRADER role to deployer account
  await accessController.grantRole(Role.UPGRADER, await deployer.getAddress());

  // Grant PROTOCOL role to ProtocolDiamond address and renounces admin
  await accessController.grantRole(Role.PROTOCOL, await protocolDiamond.getAddress());

  // Grant PAUSER role to pauser account
  await accessController.grantRole(Role.PAUSER, await pauser.getAddress());

  // Deploy the Protocol client implementation/proxy pairs (currently just the Boson Voucher)
  const protocolClientArgs = [await protocolDiamond.getAddress()];
  const [implementations, beacons] = await deployProtocolClients(
    protocolClientArgs,
    maxPriorityFeePerGas,
    forwarderAddress
  );
  const [beacon] = beacons;
  const [voucherImplementation] = implementations;

  // set protocolFees
  const protocolFeePercentage = "200"; // 2 %
  const protocolFeeFlatBoson = parseUnits("0.01", "ether").toString();
  const buyerEscalationDepositPercentage = "1000"; // 10%

  // Add config Handler, so ids start at 1, and so voucher address can be found
  const protocolConfig = [
    // Protocol addresses
    {
      treasury: await protocolTreasury.getAddress(),
      token: bosonTokenAddress || (await bosonToken.getAddress()),
      voucherBeacon: await beacon.getAddress(),
      beaconProxy: ZeroAddress,
      priceDiscovery: await beacon.getAddress(), // dummy address, changed later
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
      maxRoyaltyPercentage: 1000, //10%
      minResolutionPeriod: oneWeek,
      maxResolutionPeriod: oneMonth,
      minDisputePeriod: oneWeek,
      maxPremintedVouchers: 10000,
    },
    // Protocol fees
    protocolFeePercentage,
    protocolFeeFlatBoson,
    buyerEscalationDepositPercentage,
  ];

  const facetsToDeploy = await getFacetsWithArgs(facetNames, protocolConfig);
  if (wethAddress) {
    facetsToDeploy["SequentialCommitHandlerFacet"].constructorArgs[0] = wethAddress; // update only weth address
    facetsToDeploy["PriceDiscoveryHandlerFacet"].constructorArgs[0] = wethAddress; // update only weth address
  }
  // Cut the protocol handler facets into the Diamond
  await deployAndCutFacets(await protocolDiamond.getAddress(), facetsToDeploy, maxPriorityFeePerGas);

  let contractInstances = {};
  for (const contract of Object.keys(contracts)) {
    contractInstances[contract] = await getContractAt(contracts[contract], await protocolDiamond.getAddress());
    if (contract === "offerHandler") {
      const proxiedOfferHandler = new Proxy(contractInstances[contract], offerHandler);
      contractInstances[contract] = proxiedOfferHandler;
    }
  }

  const extraReturnValues = { accessController, voucherImplementation, beacon };

  return {
    signers: signers.slice(3),
    contractInstances,
    protocolConfig,
    diamondAddress: await protocolDiamond.getAddress(),
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
  return (BigInt(offerId) << 128n) + BigInt(exchangeId);
}

function* incrementer() {
  let i = 0;
  while (true) {
    const reset = yield (i++).toString();
    if (reset) {
      // reset to 0 instead of 1 to not count the reset call
      i = 0;
    }
  }
}

exports.setNextBlockTimestamp = setNextBlockTimestamp;
exports.getEvent = getEvent;
exports.eventEmittedWithArgs = eventEmittedWithArgs;
exports.prepareDataSignatureParameters = prepareDataSignatureParameters;
exports.calculateVoucherExpiry = calculateVoucherExpiry;
exports.calculateContractAddress = calculateContractAddress;
exports.calculateCloneAddress = calculateCloneAddress;
exports.calculateBosonProxyAddress = calculateBosonProxyAddress;
exports.applyPercentage = applyPercentage;
exports.getMappingStoragePosition = getMappingStoragePosition;
exports.paddingType = paddingType;
exports.getFacetsWithArgs = getFacetsWithArgs;
exports.compareOfferStructs = compareOfferStructs;
exports.compareRoyaltyRecipientInfoLists = compareRoyaltyRecipientInfoLists;
exports.objectToArray = objectToArray;
exports.deriveTokenId = deriveTokenId;
exports.incrementer = incrementer;
exports.getCurrentBlockAndSetTimeForward = getCurrentBlockAndSetTimeForward;
exports.setupTestEnvironment = setupTestEnvironment;
exports.getSnapshot = getSnapshot;
exports.revertToSnapshot = revertToSnapshot;
exports.getSellerSalt = getSellerSalt;
exports.compareRoyaltyInfo = compareRoyaltyInfo;
exports.compareProtocolVersions = compareProtocolVersions;
exports.generateOfferId = generateOfferId;
