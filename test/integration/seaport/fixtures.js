const hre = require("hardhat");
const ethers = hre.ethers;
const { constants, BigNumber, utils } = ethers;
const { abi } = require("./artifacts/contracts/Seaport.sol/Seaport.json");
const { getOfferOrConsiderationItem, calculateOrderHash } = require("./utils");
const { expect } = require("chai");
const { keccak256 } = require("ethers/lib/utils");

const SEAPORT_ADDRESS = "0x00000000000001ad428e4906aE43D8F9852d0dD6"; // 1.4
const SEAPORT_VERSION = "1.4";

const orderType = {
  OrderComponents: [
    { name: "offerer", type: "address" },
    { name: "zone", type: "address" },
    { name: "offer", type: "OfferItem[]" },
    { name: "consideration", type: "ConsiderationItem[]" },
    { name: "orderType", type: "uint8" },
    { name: "startTime", type: "uint256" },
    { name: "endTime", type: "uint256" },
    { name: "zoneHash", type: "bytes32" },
    { name: "salt", type: "uint256" },
    { name: "conduitKey", type: "bytes32" },
    { name: "counter", type: "uint256" },
  ],
  OfferItem: [
    { name: "itemType", type: "uint8" },
    { name: "token", type: "address" },
    { name: "identifierOrCriteria", type: "uint256" },
    { name: "startAmount", type: "uint256" },
    { name: "endAmount", type: "uint256" },
  ],
  ConsiderationItem: [
    { name: "itemType", type: "uint8" },
    { name: "token", type: "address" },
    { name: "identifierOrCriteria", type: "uint256" },
    { name: "startAmount", type: "uint256" },
    { name: "endAmount", type: "uint256" },
    { name: "recipient", type: "address" },
  ],
};

const seaportFixtures = async () => {
  const seaport = await ethers.getContractAt(abi, SEAPORT_ADDRESS);

  const getTestVoucher = function (identifierOrCriteria, token, startAmount = 1, endAmount = 1) {
    return getOfferOrConsiderationItem(2, token, identifierOrCriteria, startAmount, endAmount);
  };

  const getTestToken = function (
    identifierOrCriteria,
    token = constants.AddressZero,
    startAmount = 1,
    endAmount = 1,
    recipient
  ) {
    return getOfferOrConsiderationItem(0, token, identifierOrCriteria, startAmount, endAmount, recipient);
  };

  // const getAndVerifyOrderHash = async (orderComponents) => {
  //   const orderHash = await seaport.getOrderHash(orderComponents);
  //   const derivedOrderHash = calculateOrderHash(orderComponents);
  //   expect(orderHash).to.equal(derivedOrderHash);
  //   return orderHash;
  // };

  // // Required for EIP712 signing
  // const domainData = {
  //   name: process.env.REFERENCE ? "Consideration" : "Seaport",
  //   version: SEAPORT_VERSION,
  //   chainId,
  //   verifyingContract: seaport.address,
  // };

  // Returns signature
  // const signOrder = async (orderComponents, signer) => {
  //   const signature = await signer._signTypedData(
  //     { ...domainData, verifyingContract: seaport.address },
  //     orderType,
  //     orderComponents
  //   );

  //   const orderHash = await getAndVerifyOrderHash(orderComponents);

  //   const { domainSeparator } = await seaport.information();
  //   const digest = keccak256(`0x1901${domainSeparator.slice(2)}${orderHash.slice(2)}`);
  //   const recoveredAddress = utils.recoverAddress(digest, signature);

  //   expect(recoveredAddress).to.equal(signer.address);

  //   return signature;
  // };

  // const createOrder = async function (
  //   offerer,
  //   zone = constants.AddressZero,
  //   offer,
  //   consideration,
  //   orderType = 0,
  //   startTime,
  //   endTime,
  //   zoneHash = constants.HashZero,
  //   salt = constants.HashZero,
  //   conduitKey = constants.HashZero
  // ) {
  //   const counter = await seaport.getCounter(offerer.address);

  //   const orderParameters = {
  //     offerer: offerer.address,
  //     zone,
  //     offer,
  //     consideration,
  //     totalOriginalConsiderationItems: consideration.length,
  //     orderType,
  //     zoneHash,
  //     salt,
  //     conduitKey,
  //     startTime,
  //     endTime,
  //   };

  //   const orderComponents = {
  //     ...orderParameters,
  //     counter,
  //   };

  //   const orderHash = await getAndVerifyOrderHash(orderComponents);

  //   const { isValidated, isCancelled, totalFilled, totalSize } = await seaport.getOrderStatus(orderHash);

  //   expect(isCancelled).to.equal(false);

  //   const orderStatus = {
  //     isValidated,
  //     isCancelled,
  //     totalFilled,
  //     totalSize,
  //   };

  //   const flatSig = await signOrder(orderComponents, offerer);

  //   const order = {
  //     parameters: orderParameters,
  //     signature: flatSig,
  //     numerator: 1, // only used for advanced orders
  //     denominator: 1, // only used for advanced orders
  //     extraData: "0x", // only used for advanced orders
  //   };

  //   return {
  //     order,
  //     orderHash,
  //     orderStatus,
  //     orderComponents,
  //   };
  // };

  const getOrder = function (
    offerer,
    zone = constants.AddressZero,
    offer,
    consideration,
    orderType = 0,
    startTime,
    endTime,
    zoneHash = constants.HashZero,
    salt = 0,
    conduitKey = constants.HashZero
  ) {
    const parameters = {
      offerer: offerer.address,
      zone: zone?.address ?? constants.AddressZero,
      offer,
      consideration,
      orderType,
      startTime: BigNumber.from(startTime),
      endTime: BigNumber.from(endTime),
      zoneHash,
      salt: BigNumber.from(salt),
      conduitKey,
      totalOriginalConsiderationItems: BigNumber.from(consideration.length),
    };

    const signature = "0x";

    const order = {
      parameters,
      signature,
    };

    // How much ether (at most) needs to be supplied when fulfilling the order
    const value = offer
      .map((x) =>
        x.itemType === 0 ? (x.endAmount.gt(x.startAmount) ? x.endAmount : x.startAmount) : BigNumber.from(0)
      )
      .reduce((a, b) => a.add(b), BigNumber.from(0))
      .add(
        consideration
          .map((x) =>
            x.itemType === 0 ? (x.endAmount.gt(x.startAmount) ? x.endAmount : x.startAmount) : BigNumber.from(0)
          )
          .reduce((a, b) => a.add(b), BigNumber.from(0))
      );

    return {
      order,
      value,
    };
  };

  return {
    seaport,
    getOrder,
    getTestVoucher,
    getTestToken,
  };
};

exports.seaportFixtures = seaportFixtures;
