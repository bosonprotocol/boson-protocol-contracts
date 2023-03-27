/**
 * Seaport Domain Enum: ItemType
 */
class ItemType { }

ItemType.NATIVE = 0;
ItemType.ERC20 = 1;
ItemType.ERC721 = 2;
ItemType.ERC1155 = 3;
ItemType.ERC721_WITH_CRITERIA = 4;
ItemType.ERC1155_WITH_CRITERIA = 5;

ItemType.Types = [
  ItemType.NATIVE,
  ItemType.ERC20,
  ItemType.ERC721,
  ItemType.ERC1155,
  ItemType.ERC721_WITH_CRITERIA,
  ItemType.ERC1155_WITH_CRITERIA
];

// Export
module.exports = ItemType;
