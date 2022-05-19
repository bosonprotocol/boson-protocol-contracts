const hre = require("hardhat");
const ethers = hre.ethers;

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
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
  ];

  const domainData = {
    name: "BosonProtocolDiamond",
    version: "V1",
    chainId: 31337, // hardhat default chain id
    verifyingContract: metaTransactionsHandlerAddress,
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

function calculateVoucherExpiry(block, redeemableFromDate, voucherValidDuration) {
  const startDate = ethers.BigNumber.from(block.timestamp).gte(ethers.BigNumber.from(redeemableFromDate))
    ? ethers.BigNumber.from(block.timestamp)
    : ethers.BigNumber.from(redeemableFromDate);
  return startDate.add(ethers.BigNumber.from(voucherValidDuration)).toString();
}

function calculateProtocolFee(sellerDeposit, price, protocolFeePrecentage) {
  return ethers.BigNumber.from(price).add(sellerDeposit).mul(protocolFeePrecentage).div("10000").toString();
}

exports.setNextBlockTimestamp = setNextBlockTimestamp;
exports.getEvent = getEvent;
exports.prepareDataSignatureParameters = prepareDataSignatureParameters;
exports.calculateVoucherExpiry = calculateVoucherExpiry;
exports.calculateProtocolFee = calculateProtocolFee;
