const ethers = require("ethers");
const eip55 = require("eip55");

/**
 * Boson Protocol Domain Entity: OfferDetails
 *
 * See: {BosonTypes.OfferDetails}
 */
class OfferDetails {
  /*
        struct OfferDetails {
            address buyer;
            uint256 offerId;
        }
  */

  constructor(buyer, offerId) {
    this.buyer = buyer;
    this.offerId = offerId;
  }

  /**
   * Get a new OfferDetails instance from a pojo representation
   * @param o
   * @returns {OfferDetails}
   */
  static fromObject(o) {
    const { buyer, offerId } = o;

    return new OfferDetails(buyer, offerId);
  }

  /**
   * Get a new OfferDetails instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    let buyer, offerId;

    // destructure struct
    [buyer, offerId] = struct;

    return OfferDetails.fromObject({
      buyer: buyer,
      offerId: offerId.toString(),
    });
  }

  /**
   * Get a database representation of this OfferDetails instance
   * @returns {object}
   */
  toObject() {
    return JSON.parse(this.toString());
  }

  /**
   * Get a string representation of this OfferDetails instance
   * @returns {string}
   */
  toString() {
    return JSON.stringify(this);
  }

  /**
   * Get a struct representation of this OfferDetails instance
   * @returns {string}
   */
  toStruct() {
    return [this.buyer, this.offerId];
  }

  /**
   * Clone this OfferDetails
   * @returns {OfferDetails}
   */
  clone() {
    return OfferDetails.fromObject(this.toObject());
  }

  /**
   * Is this OfferDetails instance's buyer field valid?
   * Must be a eip55 compliant Ethereum address
   *
   * @returns {boolean}
   */
  buyerIsValid() {
    let valid = false;
    let { buyer } = this;
    try {
      valid = eip55.verify(eip55.encode(buyer));
    } catch (e) {}
    return valid;
  }

  /**
   * Is this OfferDetails instance's offerId field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  offerIdIsValid() {
    let valid = false;
    let { offerId } = this;
    try {
      valid = typeof offerId === "string" && typeof ethers.BigNumber.from(offerId) === "object";
    } catch (e) {}
    return valid;
  }

  /**
   * Is this OfferDetails instance valid?
   * @returns {boolean}
   */
  isValid() {
    return this.buyerIsValid() && this.offerIdIsValid();
  }
}

// Export
module.exports = OfferDetails;
