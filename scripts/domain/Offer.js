const ethers = require("ethers");
const eip55 = require("eip55");

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
            uint256 protocolFee;
            uint256 buyerCancelPenalty;
            uint256 quantityAvailable;
            address exchangeToken;
            uint256 disputeResolverId;
            string metadataUri;
            string metadataHash;
            bool voided;
        }
    */

  constructor(
    id,
    sellerId,
    price,
    sellerDeposit,
    protocolFee,
    buyerCancelPenalty,
    quantityAvailable,
    exchangeToken,
    disputeResolverId,
    metadataUri,
    metadataHash,
    voided
  ) {
    this.id = id;
    this.sellerId = sellerId;
    this.price = price;
    this.sellerDeposit = sellerDeposit;
    this.protocolFee = protocolFee;
    this.buyerCancelPenalty = buyerCancelPenalty;
    this.quantityAvailable = quantityAvailable;
    this.exchangeToken = exchangeToken;
    this.disputeResolverId = disputeResolverId;
    this.metadataUri = metadataUri;
    this.metadataHash = metadataHash;
    this.voided = voided;
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
      protocolFee,
      buyerCancelPenalty,
      quantityAvailable,
      exchangeToken,
      disputeResolverId,
      metadataUri,
      metadataHash,
      voided,
    } = o;

    return new Offer(
      id,
      sellerId,
      price,
      sellerDeposit,
      protocolFee,
      buyerCancelPenalty,
      quantityAvailable,
      exchangeToken,
      disputeResolverId,
      metadataUri,
      metadataHash,
      voided
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
      protocolFee,
      buyerCancelPenalty,
      quantityAvailable,
      exchangeToken,
      disputeResolverId,
      metadataUri,
      metadataHash,
      voided;

    // destructure struct
    [
      id,
      sellerId,
      price,
      sellerDeposit,
      protocolFee,
      buyerCancelPenalty,
      quantityAvailable,
      exchangeToken,
      disputeResolverId,
      metadataUri,
      metadataHash,
      voided,
    ] = struct;

    return Offer.fromObject({
      id: id.toString(),
      sellerId: sellerId.toString(),
      price: price.toString(),
      sellerDeposit: sellerDeposit.toString(),
      protocolFee: protocolFee.toString(),
      buyerCancelPenalty: buyerCancelPenalty.toString(),
      quantityAvailable: quantityAvailable.toString(),
      exchangeToken,
      disputeResolverId: disputeResolverId.toString(),
      metadataUri,
      metadataHash,
      voided,
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
      this.protocolFee,
      this.buyerCancelPenalty,
      this.quantityAvailable,
      this.exchangeToken,
      this.disputeResolverId,
      this.metadataUri,
      this.metadataHash,
      this.voided,
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
    let valid = false;
    let { id } = this;
    try {
      valid = typeof id === "string" && typeof ethers.BigNumber.from(id) === "object";
    } catch (e) {}
    return valid;
  }

  /**
   * Is this Offer instance's sellerId field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  sellerIdIsValid() {
    let valid = false;
    let { sellerId } = this;
    try {
      valid = typeof sellerId === "string" && typeof ethers.BigNumber.from(sellerId) === "object";
    } catch (e) {}
    return valid;
  }

  /**
   * Is this Offer instance's price field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  priceIsValid() {
    let valid = false;
    let { price } = this;
    try {
      valid = typeof price === "string" && typeof ethers.BigNumber.from(price) === "object";
    } catch (e) {}
    return valid;
  }

  /**
   * Is this Offer instance's sellerDeposit field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  sellerDepositIsValid() {
    let valid = false;
    let { sellerDeposit } = this;
    try {
      valid = typeof sellerDeposit === "string" && typeof ethers.BigNumber.from(sellerDeposit) === "object";
    } catch (e) {}
    return valid;
  }

  /**
   * Is this Offer instance's protocolFee field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  protocolFeeIsValid() {
    let valid = false;
    let { protocolFee } = this;
    try {
      valid = typeof protocolFee === "string" && typeof ethers.BigNumber.from(protocolFee) === "object";
    } catch (e) {}
    return valid;
  }

  /**
   * Is this Offer instance's buyerCancelPenalty field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  buyerCancelPenaltyIsValid() {
    let valid = false;
    let { buyerCancelPenalty } = this;
    try {
      valid = typeof buyerCancelPenalty === "string" && typeof ethers.BigNumber.from(buyerCancelPenalty) === "object";
    } catch (e) {}
    return valid;
  }

  /**
   * Is this Offer instance's quantityAvailable field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  quantityAvailableIsValid() {
    let valid = false;
    let { quantityAvailable } = this;
    try {
      valid = typeof quantityAvailable === "string" && typeof ethers.BigNumber.from(quantityAvailable) === "object";
    } catch (e) {}
    return valid;
  }

  /**
   * Is this Offer instance's exchangeToken field valid?
   * Must be a eip55 compliant Ethereum address
   * Use "0x000.." for chain base currency, e.g., ETH
   *
   * @returns {boolean}
   */
  exchangeTokenIsValid() {
    let valid = false;
    let { exchangeToken } = this;
    try {
      valid = eip55.verify(eip55.encode(exchangeToken));
    } catch (e) {}
    return valid;
  }

  /**
   * Is this Offer instance's disputeResolverId field valid?
   * Must be a string representation of a big number
   * Use "0x000.." for chain base currency, e.g., ETH
   *
   * @returns {boolean}
   */
  disputeResolverIdIsValid() {
    let valid = false;
    let { disputeResolverId } = this;
    try {
      valid = typeof disputeResolverId === "string" && typeof ethers.BigNumber.from(disputeResolverId) === "object";
    } catch (e) {}
    return valid;
  }

  /**
   * Is this Offer instance's metadataUri field valid?
   * Always present, must be a string
   *
   * @returns {boolean}
   */
  metadataUriIsValid() {
    let valid = false;
    let { metadataUri } = this;
    try {
      valid = typeof metadataUri === "string";
    } catch (e) {}
    return valid;
  }

  /**
   * Is this Offer instance's metadataHash field valid?
   * Always present, must be a string
   *
   * @returns {boolean}
   */
  metadataHashIsValid() {
    let valid = false;
    let { metadataHash } = this;
    try {
      valid = typeof metadataHash === "string";
    } catch (e) {}
    return valid;
  }

  /**
   * Is this Offer instance's voided field valid?
   * @returns {boolean}
   */
  voidedIsValid() {
    let valid = false;
    let { voided } = this;
    try {
      valid = typeof voided === "boolean";
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
      this.protocolFeeIsValid() &&
      this.buyerCancelPenaltyIsValid() &&
      this.quantityAvailableIsValid() &&
      this.exchangeTokenIsValid() &&
      this.disputeResolverIdIsValid() &&
      this.metadataUriIsValid() &&
      this.metadataHashIsValid() &&
      this.voidedIsValid()
    );
  }
}

// Export
module.exports = Offer;
