const {
  bigNumberIsValid,
  addressIsValid,
  booleanIsValid,
  stringIsValid,
  enumIsValid,
} = require("../util/validations.js");
const PriceType = require("./PriceType.js");
const { RoyaltyInfo, RoyaltyInfoList } = require("./RoyaltyInfo.js");

/**
 * Boson Protocol Domain Entity: Offer
 *
 * See: {BosonTypes.Offer}
 */
class Offer {
  /*
        struct Offer {
            uint256 id;
            uint256 sellerId;
            uint256 price;
            uint256 sellerDeposit;
            uint256 buyerCancelPenalty;
            uint256 quantityAvailable;
            address exchangeToken;
            PriceType priceType;
            string metadataUri;
            string metadataHash;
            bool voided;
            uint256 collectionIndex;            
            RoyaltyInfo[] royaltyInfo;
        }
    */

  constructor(
    id,
    sellerId,
    price,
    sellerDeposit,
    buyerCancelPenalty,
    quantityAvailable,
    exchangeToken,
    priceType,
    metadataUri,
    metadataHash,
    voided,
    collectionIndex,
    royaltyInfo
  ) {
    this.id = id;
    this.sellerId = sellerId;
    this.price = price;
    this.sellerDeposit = sellerDeposit;
    this.buyerCancelPenalty = buyerCancelPenalty;
    this.quantityAvailable = quantityAvailable;
    this.exchangeToken = exchangeToken;
    this.priceType = priceType;
    this.metadataUri = metadataUri;
    this.metadataHash = metadataHash;
    this.voided = voided;
    this.collectionIndex = collectionIndex;
    this.royaltyInfo = royaltyInfo;
  }

  /**
   * Get a new Offer instance from a pojo representation
   * @param o
   * @returns {Offer}
   */
  static fromObject(o) {
    const {
      id,
      sellerId,
      price,
      sellerDeposit,
      buyerCancelPenalty,
      quantityAvailable,
      exchangeToken,
      priceType,
      metadataUri,
      metadataHash,
      voided,
      collectionIndex,
      royaltyInfo,
    } = o;

    return new Offer(
      id,
      sellerId,
      price,
      sellerDeposit,
      buyerCancelPenalty,
      quantityAvailable,
      exchangeToken,
      priceType,
      metadataUri,
      metadataHash,
      voided,
      collectionIndex,
      royaltyInfo.map((ri) => RoyaltyInfo.fromObject(ri))
    );
  }

  /**
   * Get a new Offer instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    let id,
      sellerId,
      price,
      sellerDeposit,
      buyerCancelPenalty,
      quantityAvailable,
      exchangeToken,
      priceType,
      metadataUri,
      metadataHash,
      voided,
      collectionIndex,
      royaltyInfo;

    // destructure struct
    [
      id,
      sellerId,
      price,
      sellerDeposit,
      buyerCancelPenalty,
      quantityAvailable,
      exchangeToken,
      priceType,
      metadataUri,
      metadataHash,
      voided,
      collectionIndex,
      royaltyInfo,
    ] = struct;
    if (!collectionIndex) {
      collectionIndex = 0;
    }

    return Offer.fromObject({
      id: id.toString(),
      sellerId: sellerId.toString(),
      price: price.toString(),
      sellerDeposit: sellerDeposit.toString(),
      buyerCancelPenalty: buyerCancelPenalty.toString(),
      quantityAvailable: quantityAvailable.toString(),
      exchangeToken,
      priceType: Number(priceType),
      metadataUri,
      metadataHash,
      voided,
      collectionIndex: collectionIndex.toString(),
      royaltyInfo: royaltyInfo.map((ri) => RoyaltyInfo.fromStruct(ri)),
    });
  }

  /**
   * Get a database representation of this Offer instance
   * @returns {object}
   */
  toObject() {
    return JSON.parse(this.toString());
  }

  /**
   * Get a string representation of this Offer instance
   * @returns {string}
   */
  toString() {
    return JSON.stringify(this);
  }

  /**
   * Get a struct representation of this Offer instance
   * @returns {string}
   */
  toStruct() {
    return [
      this.id,
      this.sellerId,
      this.price,
      this.sellerDeposit,
      this.buyerCancelPenalty,
      this.quantityAvailable,
      this.exchangeToken,
      this.priceType,
      this.metadataUri,
      this.metadataHash,
      this.voided,
      this.collectionIndex,
      new RoyaltyInfoList(this.royaltyInfo).toStruct(),
    ];
  }

  /**
   * Clone this Offer
   * @returns {Offer}
   */
  clone() {
    return Offer.fromObject(this.toObject());
  }

  /**
   * Is this Offer instance's id field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  idIsValid() {
    return bigNumberIsValid(this.id);
  }

  /**
   * Is this Offer instance's sellerId field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  sellerIdIsValid() {
    return bigNumberIsValid(this.sellerId);
  }

  /**
   * Is this Offer instance's price field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  priceIsValid() {
    return bigNumberIsValid(this.price);
  }

  /**
   * Is this Offer instance's sellerDeposit field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  sellerDepositIsValid() {
    return bigNumberIsValid(this.sellerDeposit);
  }

  /**
   * Is this Offer instance's buyerCancelPenalty field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  buyerCancelPenaltyIsValid() {
    return bigNumberIsValid(this.buyerCancelPenalty);
  }

  /**
   * Is this Offer instance's quantityAvailable field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  quantityAvailableIsValid() {
    return bigNumberIsValid(this.quantityAvailable);
  }

  /**
   * Is this Offer instance's exchangeToken field valid?
   * Must be a eip55 compliant Ethereum address
   * Use "0x000.." for chain base currency, e.g., ETH
   *
   * @returns {boolean}
   */
  exchangeTokenIsValid() {
    return addressIsValid(this.exchangeToken);
  }

  /**
   * Is this Offer instance's priceType field valid?
   * @returns {boolean}
   */
  priceTypeIsValid() {
    return enumIsValid(this.priceType, PriceType.Types);
  }

  /**
   * Is this Offer instance's metadataUri field valid?
   * Always present, must be a string
   *
   * @returns {boolean}
   */
  metadataUriIsValid() {
    return stringIsValid(this.metadataUri);
  }

  /**
   * Is this Offer instance's metadataHash field valid?
   * Always present, must be a string
   *
   * @returns {boolean}
   */
  metadataHashIsValid() {
    return stringIsValid(this.metadataHash);
  }

  /**
   * Is this Offer instance's voided field valid?
   * @returns {boolean}
   */
  voidedIsValid() {
    return booleanIsValid(this.voided);
  }

  /**
   * Is this Offer instance's collectionIndex field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  collectionIndexIsValid() {
    return bigNumberIsValid(this.collectionIndex);
  }

  /**
   * Is this Offer instance's royaltyInfo field valid?
   * Must be a valid RoyaltyInfo instance
   * @returns {boolean}
   */
  royaltyInfoIsValid() {
    let valid = false;
    let { royaltyInfo } = this;
    let royaltyInfoList = new RoyaltyInfoList(royaltyInfo);
    try {
      valid = typeof royaltyInfoList == "object" && royaltyInfoList.isValid();
    } catch (e) {}
    return valid;
  }

  /**
   * Is this Offer instance valid?
   * @returns {boolean}
   */
  isValid() {
    return (
      this.idIsValid() &&
      this.sellerIdIsValid() &&
      this.priceIsValid() &&
      this.sellerDepositIsValid() &&
      this.buyerCancelPenaltyIsValid() &&
      this.quantityAvailableIsValid() &&
      this.exchangeTokenIsValid() &&
      this.priceTypeIsValid() &&
      this.metadataUriIsValid() &&
      this.metadataHashIsValid() &&
      this.voidedIsValid() &&
      this.collectionIndexIsValid() &&
      this.royaltyInfoIsValid()
    );
  }
}

// Export
module.exports = Offer;
