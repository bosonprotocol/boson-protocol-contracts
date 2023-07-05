const { BigNumber, constants, utils } = require("ethers");

const getOfferOrConsiderationItem = function (
  itemType = 0,
  token = ZeroAddress,
  identifierOrCriteria = 0,
  startAmount = 1,
  endAmount = 1,
  recipient
) {
  const item = {
    itemType,
    token,
    identifierOrCriteria: BigNumber.from(identifierOrCriteria),
    startAmount: BigNumber.from(startAmount),
    endAmount: BigNumber.from(endAmount),
  };

  if (recipient) {
    item.recipient = recipient;
  }
  return item;
};

const calculateOrderHash = (orderComponents) => {
  const offerItemTypeString =
    "OfferItem(uint8 itemType,address token,uint256 identifierOrCriteria,uint256 startAmount,uint256 endAmount)";
  const considerationItemTypeString =
    "ConsiderationItem(uint8 itemType,address token,uint256 identifierOrCriteria,uint256 startAmount,uint256 endAmount,address recipient)";
  const orderComponentsPartialTypeString =
    "OrderComponents(address offerer,address zone,OfferItem[] offer,ConsiderationItem[] consideration,uint8 orderType,uint256 startTime,uint256 endTime,bytes32 zoneHash,uint256 salt,bytes32 conduitKey,uint256 counter)";
  const orderTypeString = `${orderComponentsPartialTypeString}${considerationItemTypeString}${offerItemTypeString}`;

  const offerItemTypeHash = utils.keccak256(utils.toUtf8Bytes(offerItemTypeString));
  const considerationItemTypeHash = utils.keccak256(utils.toUtf8Bytes(considerationItemTypeString));
  const orderTypeHash = utils.keccak256(utils.toUtf8Bytes(orderTypeString));

  const offerHash = utils.keccak256(
    "0x" +
      orderComponents.offer
        .map((offerItem) => {
          return utils
            .keccak256(
              "0x" +
                [
                  offerItemTypeHash.slice(2),
                  offerItem.itemType.toString().padStart(64, "0"),
                  offerItem.token.slice(2).padStart(64, "0"),
                  BigNumber.from(offerItem.identifierOrCriteria).toHexString().slice(2).padStart(64, "0"),
                  BigNumber.from(offerItem.startAmount).toHexString().slice(2).padStart(64, "0"),
                  BigNumber.from(offerItem.endAmount).toHexString().slice(2).padStart(64, "0"),
                ].join("")
            )
            .slice(2);
        })
        .join("")
  );

  const considerationHash = utils.keccak256(
    "0x" +
      orderComponents.consideration
        .map((considerationItem) => {
          return utils
            .keccak256(
              "0x" +
                [
                  considerationItemTypeHash.slice(2),
                  considerationItem.itemType.toString().padStart(64, "0"),
                  considerationItem.token.slice(2).padStart(64, "0"),
                  BigNumber.from(considerationItem.identifierOrCriteria).toHexString().slice(2).padStart(64, "0"),
                  BigNumber.from(considerationItem.startAmount).toHexString().slice(2).padStart(64, "0"),
                  BigNumber.from(considerationItem.endAmount).toHexString().slice(2).padStart(64, "0"),
                  considerationItem.recipient.slice(2).padStart(64, "0"),
                ].join("")
            )
            .slice(2);
        })
        .join("")
  );

  const derivedOrderHash = utils.keccak256(
    "0x" +
      [
        orderTypeHash.slice(2),
        orderComponents.offerer.slice(2).padStart(64, "0"),
        orderComponents.zone.slice(2).padStart(64, "0"),
        offerHash.slice(2),
        considerationHash.slice(2),
        orderComponents.orderType.toString().padStart(64, "0"),
        BigNumber.from(orderComponents.startTime).toHexString().slice(2).padStart(64, "0"),
        BigNumber.from(orderComponents.endTime).toHexString().slice(2).padStart(64, "0"),
        orderComponents.zoneHash.slice(2),
        BigNumber.from(orderComponents.salt).toHexString().slice(2).padStart(64, "0"),
        orderComponents.conduitKey.slice(2).padStart(64, "0"),
        BigNumber.from(orderComponents.counter).toHexString().slice(2).padStart(64, "0"),
      ].join("")
  );

  return derivedOrderHash;
};
exports.getOfferOrConsiderationItem = getOfferOrConsiderationItem;
exports.calculateOrderHash = calculateOrderHash;
