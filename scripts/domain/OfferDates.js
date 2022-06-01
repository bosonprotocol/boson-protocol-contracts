const ethers = require("ethers");

/**
 * Boson Protocol Domain Entity: OfferDates
 *
 * See: {BosonTypes.OfferDates}
 */
class OfferDates {
  /*
        struct OfferDates {
            uint256 validFrom;
            uint256 validUntil;
            uint256 redeemableFrom;
            uint256 redeemableUntil;
        }
    */

  constructor(validFrom, validUntil, redeemableFrom, redeemableUntil) {
    this.validFrom = validFrom;
    this.validUntil = validUntil;
    this.redeemableFrom = redeemableFrom;
    this.redeemableUntil = redeemableUntil;
  }

  /**
   * Get a new OfferDates instance from a pojo representation
   * @param o
   * @returns {OfferDates}
   */
  static fromObject(o) {
    const { validFrom, validUntil, redeemableFrom, redeemableUntil } = o;

    return new OfferDates(validFrom, validUntil, redeemableFrom, redeemableUntil);
  }

  /**
   * Get a new OfferDates instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    let validFrom, validUntil, redeemableFrom, redeemableUntil;

    // destructure struct
    [validFrom, validUntil, redeemableFrom, redeemableUntil] = struct;

    return OfferDates.fromObject({
      validFrom: validFrom.toString(),
      validUntil: validUntil.toString(),
      redeemableFrom: redeemableFrom.toString(),
      redeemableUntil: redeemableUntil.toString(),
    });
  }

  /**
   * Get a database representation of this OfferDates instance
   * @returns {object}
   */
  toObject() {
    return JSON.parse(this.toString());
  }

  /**
   * Get a string representation of this OfferDates instance
   * @returns {string}
   */
  toString() {
    return JSON.stringify(this);
  }

  /**
   * Get a struct representation of this OfferDates instance
   * @returns {string}
   */
  toStruct() {
    return [this.validFrom, this.validUntil, this.redeemableFrom, this.redeemableUntil];
  }

  /**
   * Clone this OfferDates
   * @returns {OfferDates}
   */
  clone() {
    return OfferDates.fromObject(this.toObject());
  }

  /**
   * Is this OfferDates instance's validFrom field valid?
   * Must be a string representation of a big number
   * TODO: make sure it's time within a reasonable range?
   * @returns {boolean}
   */
  validFromIsValid() {
    let valid = false;
    let { validFrom } = this;
    try {
      valid = typeof validFrom === "string" && typeof ethers.BigNumber.from(validFrom) === "object";
    } catch (e) {}
    return valid;
  }

  /**
   * Is this OfferDates instance's validUntil field valid?
   * Must be a string representation of a big number
   * TODO: make sure it's time within a reasonable range?
   * @returns {boolean}
   */
  validUntilIsValid() {
    let valid = false;
    let { validUntil } = this;
    try {
      valid = typeof validUntil === "string" && typeof ethers.BigNumber.from(validUntil) === "object";
    } catch (e) {}
    return valid;
  }

  /**
   * Is this OfferDates instance's redeemableFrom field valid?
   * Must be a string representation of a big number
   * TODO: make sure it's time within a reasonable range?
   * @returns {boolean}
   */
  redeemableFromIsValid() {
    let valid = false;
    let { redeemableFrom } = this;
    try {
      valid = typeof redeemableFrom === "string" && typeof ethers.BigNumber.from(redeemableFrom) === "object";
    } catch (e) {}
    return valid;
  }

  /**
   * Is this OfferDates instance's redeemableUntil field valid?
   * Must be a string representation of a big number
   * TODO: make sure it's time within a reasonable range?
   * @returns {boolean}
   */
  redeemableUntilIsValid() {
    let valid = false;
    let { redeemableUntil } = this;
    try {
      valid = typeof redeemableUntil === "string" && typeof ethers.BigNumber.from(redeemableUntil) === "object";
    } catch (e) {}
    return valid;
  }

  /**
   * Is this OfferDates instance valid?
   * @returns {boolean}
   */
  isValid() {
    return (
      this.validFromIsValid() &&
      this.validUntilIsValid() &&
      this.redeemableFromIsValid() &&
      this.redeemableUntilIsValid()
    );
  }
}

// Export
module.exports = OfferDates;
