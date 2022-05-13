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
            uint256 validFromDate;
            uint256 validUntilDate;
            uint256 redeemableFromDate;
            uint256 fulfillmentPeriodDuration;
            uint256 voucherValidDuration;
            address exchangeToken;
            string metadataUri;
            string offerChecksum;
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
    validFromDate,
    validUntilDate,
    redeemableFromDate,
    fulfillmentPeriodDuration,
    voucherValidDuration,
    exchangeToken,
    metadataUri,
    offerChecksum,
    voided
  ) {
    this.id = id;
    this.sellerId = sellerId;
    this.price = price;
    this.sellerDeposit = sellerDeposit;
    this.protocolFee = protocolFee;
    this.buyerCancelPenalty = buyerCancelPenalty;
    this.quantityAvailable = quantityAvailable;
    this.validFromDate = validFromDate;
    this.validUntilDate = validUntilDate;
    this.redeemableFromDate = redeemableFromDate;
    this.voucherValidDuration = voucherValidDuration;
    this.fulfillmentPeriodDuration = fulfillmentPeriodDuration;
    this.exchangeToken = exchangeToken;
    this.metadataUri = metadataUri;
    this.offerChecksum = offerChecksum;
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
      validFromDate,
      validUntilDate,
      redeemableFromDate,
      fulfillmentPeriodDuration,
      voucherValidDuration,
      exchangeToken,
      metadataUri,
      offerChecksum,
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
      validFromDate,
      validUntilDate,
      redeemableFromDate,
      fulfillmentPeriodDuration,
      voucherValidDuration,
      exchangeToken,
      metadataUri,
      offerChecksum,
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
      validFromDate,
      validUntilDate,
      redeemableFromDate,
      fulfillmentPeriodDuration,
      voucherValidDuration,
      exchangeToken,
      metadataUri,
      offerChecksum,
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
      validFromDate,
      validUntilDate,
      redeemableFromDate,
      fulfillmentPeriodDuration,
      voucherValidDuration,
      exchangeToken,
      metadataUri,
      offerChecksum,
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
      validFromDate: validFromDate.toString(),
      validUntilDate: validUntilDate.toString(),
      redeemableFromDate: redeemableFromDate.toString(),
      fulfillmentPeriodDuration: fulfillmentPeriodDuration.toString(),
      voucherValidDuration: voucherValidDuration.toString(),
      exchangeToken,
      metadataUri,
      offerChecksum,
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
      this.validFromDate,
      this.validUntilDate,
      this.redeemableFromDate,
      this.fulfillmentPeriodDuration,
      this.voucherValidDuration,
      this.exchangeToken,
      this.metadataUri,
      this.offerChecksum,
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
   * Is this Offer instance's validFromDate field valid?
   * Must be a string representation of a big number
   * TODO: make sure it's time within a reasonable range?
   * @returns {boolean}
   */
  validFromDateIsValid() {
    let valid = false;
    let { validFromDate } = this;
    try {
      valid = typeof validFromDate === "string" && typeof ethers.BigNumber.from(validFromDate) === "object";
    } catch (e) {}
    return valid;
  }

  /**
   * Is this Offer instance's validUntilDate field valid?
   * Must be a string representation of a big number
   * TODO: make sure it's time within a reasonable range?
   * @returns {boolean}
   */
  validUntilDateIsValid() {
    let valid = false;
    let { validUntilDate } = this;
    try {
      valid = typeof validUntilDate === "string" && typeof ethers.BigNumber.from(validUntilDate) === "object";
    } catch (e) {}
    return valid;
  }

  /**
   * Is this Offer instance's redeemableFromDate field valid?
   * Must be a string representation of a big number
   * TODO: make sure it's time within a reasonable range?
   * @returns {boolean}
   */
  redeemableFromDateIsValid() {
    let valid = false;
    let { redeemableFromDate } = this;
    try {
      valid = typeof redeemableFromDate === "string" && typeof ethers.BigNumber.from(redeemableFromDate) === "object";
    } catch (e) {}
    return valid;
  }

  /**
   * Is this Offer instance's fulfillmentPeriodDuration field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  fulfillmentPeriodDurationIsValid() {
    let valid = false;
    let { fulfillmentPeriodDuration } = this;
    try {
      valid =
        typeof fulfillmentPeriodDuration === "string" &&
        typeof ethers.BigNumber.from(fulfillmentPeriodDuration) === "object";
    } catch (e) {}
    return valid;
  }

  /**
   * Is this Offer instance's voucherValidDuration field valid?
   * Must be a string representation of a big number
   * TODO: make sure it's time within a reasonable range?
   * @returns {boolean}
   */
  voucherValidDurationIsValid() {
    let valid = false;
    let { voucherValidDuration } = this;
    try {
      valid =
        typeof voucherValidDuration === "string" && typeof ethers.BigNumber.from(voucherValidDuration) === "object";
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
   * Is this Offer instance's offerChecksum field valid?
   * Always present, must be a string
   *
   * @returns {boolean}
   */
  offerChecksumIsValid() {
    let valid = false;
    let { offerChecksum } = this;
    try {
      valid = typeof offerChecksum === "string";
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
      this.validFromDateIsValid() &&
      this.validUntilDateIsValid() &&
      this.redeemableFromDateIsValid() &&
      this.fulfillmentPeriodDurationIsValid() &&
      this.voucherValidDurationIsValid() &&
      this.exchangeTokenIsValid() &&
      this.metadataUriIsValid() &&
      this.offerChecksumIsValid() &&
      this.voidedIsValid()
    );
  }
}

// Export
module.exports = Offer;
