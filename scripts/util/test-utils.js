const hre = require("hardhat");
const ethers = hre.ethers;
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
    name: "BosonProtocolDiamond",
    version: "V1",
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

function calculateProtocolFee(price, protocolFeePercentage) {
  return ethers.BigNumber.from(price).mul(protocolFeePercentage).div("10000").toString();
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

exports.setNextBlockTimestamp = setNextBlockTimestamp;
exports.getEvent = getEvent;
exports.prepareDataSignatureParameters = prepareDataSignatureParameters;
exports.calculateVoucherExpiry = calculateVoucherExpiry;
exports.calculateProtocolFee = calculateProtocolFee;
exports.calculateContractAddress = calculateContractAddress;
