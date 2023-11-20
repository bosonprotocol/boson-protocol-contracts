const { ZeroAddress, keccak256, id, solidityPackedKeccak256 } = require("ethers");
const { ItemType } = require("./ItemTypeEnum.js");
const { MerkleTree } = require("merkletreejs");

const getOfferOrConsiderationItem = function (
  itemType = ItemType.NATIVE,
  token = ZeroAddress,
  identifierOrCriteria = 0,
  startAmount = 1,
  endAmount = 1,
  recipient
) {
  const item = {
    itemType,
    token,
    identifierOrCriteria: BigInt(identifierOrCriteria),
    startAmount: BigInt(startAmount),
    endAmount: BigInt(endAmount),
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

  const offerItemTypeHash = id(offerItemTypeString);
  const considerationItemTypeHash = id(considerationItemTypeString);
  const orderTypeHash = id(orderTypeString);

  const offerHash = solidityPackedKeccak256(
    new Array(orderComponents.offer.length).fill("bytes32"),
    orderComponents.offer.map((offerItem) => {
      return solidityPackedKeccak256(
        ["bytes32", "uint256", "uint256", "uint256", "uint256", "uint256"],

        [
          offerItemTypeHash,
          offerItem.itemType,
          offerItem.token,
          offerItem.identifierOrCriteria,
          offerItem.startAmount,
          offerItem.endAmount,
        ]
      );
    })
  );

  const considerationHash = solidityPackedKeccak256(
    new Array(orderComponents.consideration.length).fill("bytes32"),
    orderComponents.consideration.map((considerationItem) => {
      return solidityPackedKeccak256(
        ["bytes32", "uint256", "uint256", "uint256", "uint256", "uint256", "uint256"],
        [
          considerationItemTypeHash,
          considerationItem.itemType,
          considerationItem.token,
          considerationItem.identifierOrCriteria,
          considerationItem.startAmount,
          considerationItem.endAmount,
          considerationItem.recipient,
        ]
      );
    })
  );

  const derivedOrderHash = solidityPackedKeccak256(
    [
      "bytes32",
      "uint256",
      "uint256",
      "bytes32",
      "bytes32",
      "uint256",
      "uint256",
      "uint256",
      "bytes32",
      "uint256",
      "uint256",
      "uint256",
    ],
    [
      orderTypeHash,
      orderComponents.offerer,
      orderComponents.zone,
      offerHash,
      considerationHash,
      orderComponents.orderType,
      orderComponents.startTime,
      orderComponents.endTime,
      orderComponents.zoneHash,
      orderComponents.salt,
      orderComponents.conduitKey,
      orderComponents.counter,
    ]
  );

  return derivedOrderHash;
};

function getRootAndProof(start, end, leaf) {
  const leaves = [];

  for (let i = start; i <= end; i++) {
    leaves.push(i);
  }
  const merkleTree = new MerkleTree(leaves, keccak256, { hashLeaves: true });

  const proof = merkleTree.getHexProof(keccak256(leaf));

  return { root: merkleTree.getHexRoot(), proof };
}
exports.getOfferOrConsiderationItem = getOfferOrConsiderationItem;
exports.calculateOrderHash = calculateOrderHash;
exports.getRootAndProof = getRootAndProof;
