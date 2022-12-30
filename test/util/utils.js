const hre = require("hardhat");
const ethers = hre.ethers;
const { getFacets } = require("../../scripts/config/facet-deploy.js");
const { keccak256, RLP } = ethers.utils;

function getEvent(receipt, factory, eventName) {
  let found = false;

  const eventFragment = factory.interface.fragments.filter((e) => e.name == eventName);
  const iface = new ethers.utils.Interface(eventFragment);

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
  const iface = new ethers.utils.Interface(eventFragment);

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

async function setNextBlockTimestamp(timestamp) {
  await ethers.provider.send("evm_setNextBlockTimestamp", [timestamp]);
  await ethers.provider.send("evm_mine", []);
}

function getSignatureParameters(signature) {
  if (!ethers.utils.isHexString(signature)) {
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
  metaTransactionsHandlerAddress
) {
  // Initialize data
  const domainType = [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "verifyingContract", type: "address" },
    { name: "salt", type: "bytes32" },
  ];

  const domainData = {
    name: "Boson Protocol",
    version: "V2",
    verifyingContract: metaTransactionsHandlerAddress,
    salt: ethers.utils.hexZeroPad(ethers.BigNumber.from(31337).toHexString(), 32), //hardhat default chain id is 31337
  };

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
  const signature = await ethers.provider.send("eth_signTypedData_v4", [user.address, dataToSign]);

  // Collect the Signature components
  const { r, s, v } = getSignatureParameters(signature);

  return {
    r: r,
    s: s,
    v: v,
  };
}

function calculateVoucherExpiry(block, voucherRedeemableFromDate, voucherValidDuration) {
  const startDate = ethers.BigNumber.from(block.timestamp).gte(ethers.BigNumber.from(voucherRedeemableFromDate))
    ? ethers.BigNumber.from(block.timestamp)
    : ethers.BigNumber.from(voucherRedeemableFromDate);
  return startDate.add(ethers.BigNumber.from(voucherValidDuration)).toString();
}

function applyPercentage(base, percentage) {
  return ethers.BigNumber.from(base).mul(percentage).div("10000").toString();
}

function calculateContractAddress(senderAddress, senderNonce) {
  const nonce = ethers.BigNumber.from(senderNonce);
  const nonceHex = nonce.eq(0) ? "0x" : nonce.toHexString();

  const input_arr = [senderAddress, nonceHex];
  const rlp_encoded = RLP.encode(input_arr);

  const contract_address_long = keccak256(rlp_encoded);

  const contract_address = "0x" + contract_address_long.substring(26); //Trim the first 24 characters.

  return ethers.utils.getAddress(contract_address);
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
      keyBuffer = ethers.utils.toUtf8Bytes(key);
      break;
    case paddingType.START:
      keyBuffer = Buffer.from(ethers.utils.hexZeroPad(key, 32).toString().slice(2), "hex");
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
