const hre = require("hardhat");
const { ZeroHash, ZeroAddress } = hre.ethers;
const { getOfferOrConsiderationItem, calculateOrderHash } = require("./utils");
const { expect } = require("chai");
const OrderType = require("./OrderTypeEnum");
const ItemType = require("./ItemTypeEnum");
const Side = require("./SideEnum");

const seaportFixtures = async (seaport) => {
  const getTestVoucher = function (
    itemType = ItemType.ERC721,
    identifierOrCriteria,
    token,
    startAmount = 1,
    endAmount = 1
  ) {
    return getOfferOrConsiderationItem(itemType, token, identifierOrCriteria, startAmount, endAmount);
  };

  const getTestToken = function (
    itemType = ItemType.NATIVE,
    identifierOrCriteria,
    token = ZeroAddress,
    startAmount = 1,
    endAmount = 1,
    recipient
  ) {
    return getOfferOrConsiderationItem(itemType, token, identifierOrCriteria, startAmount, endAmount, recipient);
  };

  const getAndVerifyOrderHash = async (orderComponents) => {
    const orderHash = await seaport.getOrderHash(orderComponents);
    const derivedOrderHash = calculateOrderHash(orderComponents);
    expect(orderHash).to.equal(derivedOrderHash);
    return orderHash;
  };

  const getOrder = async function (
    offerer,
    zone = ZeroAddress,
    offer,
    consideration,
    orderType = OrderType.FULL_OPEN,
    startTime,
    endTime,
    zoneHash = ZeroHash,
    salt = 0,
    conduitKey = ZeroHash
  ) {
    const parameters = {
      offerer: await offerer.getAddress(),
      zone: zone?.address ?? ZeroAddress,
      offer,
      consideration,
      orderType,
      startTime: BigInt(startTime),
      endTime: BigInt(endTime),
      zoneHash,
      salt: BigInt(salt),
      conduitKey,
      totalOriginalConsiderationItems: BigInt(consideration.length),
    };

    const counter = await seaport.getCounter(await offerer.getAddress());
    const orderComponents = { ...parameters, counter };

    const orderHash = await getAndVerifyOrderHash(orderComponents);

    const signature = ZeroHash;

    const order = {
      parameters,
      signature,
    };

    // How much ether (at most) needs to be supplied when fulfilling the order
    const value = offer
      .map((x) => (x.itemType === 0 ? (x.endAmount.gt(x.startAmount) ? x.endAmount : x.startAmount) : BigInt(0)))
      .reduce((a, b) => a + b, BigInt(0))
      .add(
        consideration
          .map((x) => (x.itemType === 0 ? (x.endAmount.gt(x.startAmount) ? x.endAmount : x.startAmount) : BigInt(0)))
          .reduce((a, b) => a + b, BigInt(0))
      );

    return {
      order,
      orderHash,
      value,
    };
  };

  const getAdvancedOrder = async function (
    offerer,
    zone = ZeroAddress,
    offer,
    consideration,
    orderType = OrderType.FULL_OPEN,
    startTime,
    endTime,
    zoneHash = ZeroHash,
    salt = 0,
    conduitKey = ZeroHash,
    numerator = 1,
    denominator = 1
  ) {
    let order, orderHash, value;
    ({ order, orderHash, value } = await getOrder(
      offerer,
      zone,
      offer,
      consideration,
      orderType,
      startTime,
      endTime,
      zoneHash,
      salt,
      conduitKey
    ));

    order.numerator = numerator;
    order.denominator = denominator;
    order.extraData = ZeroHash;

    return { order, orderHash, value };
  };

  const getCriteriaResolver = (orderIndex = 0, side = Side.OFFER, index = 0, identifier = 1, criteriaProof) => {
    return {
      orderIndex,
      side,
      index,
      identifier,
      criteriaProof,
    };
  };

  return {
    getOrder,
    getTestVoucher,
    getTestToken,
    getCriteriaResolver,
    getAdvancedOrder,
  };
};

exports.seaportFixtures = seaportFixtures;
