const hre = require("hardhat");
const ethers = hre.ethers;
const { constants, BigNumber } = ethers;
const { getOfferOrConsiderationItem, calculateOrderHash } = require("./utils");
const { expect } = require("chai");
const OrderType = require("./OrderTypeEnum");

const seaportFixtures = async (seaport) => {
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

  const getAndVerifyOrderHash = async (orderComponents) => {
    const orderHash = await seaport.getOrderHash(orderComponents);
    const derivedOrderHash = calculateOrderHash(orderComponents);
    expect(orderHash).to.equal(derivedOrderHash);
    return orderHash;
  };

  const getOrder = async function (
    offerer,
    zone = constants.AddressZero,
    offer,
    consideration,
    orderType = OrderType.FULL_OPEN,
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

    const counter = await seaport.getCounter(offerer.address);
    const orderComponents = { ...parameters, counter };

    const orderHash = await getAndVerifyOrderHash(orderComponents);

    const signature = constants.HashZero;

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
      orderHash,
      value,
    };
  };

  return {
    getOrder,
    getTestVoucher,
    getTestToken,
  };
};

exports.seaportFixtures = seaportFixtures;
