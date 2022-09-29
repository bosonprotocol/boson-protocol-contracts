const { bigNumberIsValid } = require("../util/validations.js");

/**
 * Boson Protocol Domain Entity: OfferDurations
 *
 * See: {BosonTypes.OfferDurations}
 */
class OfferDurations {
  /*
    struct OfferDurations {
        uint256 disputePeriod;
        uint256 voucherValid;
        uint256 resolutionPeriod;
    }
  */

  constructor(disputePeriod, voucherValid, resolutionPeriod) {
    this.voucherValid = voucherValid;
    this.disputePeriod = disputePeriod;
    this.resolutionPeriod = resolutionPeriod;
  }

  /**
   * Get a new OfferDurations instance from a pojo representation
   * @param o
   * @returns {OfferDurations}
   */
  static fromObject(o) {
    const { disputePeriod, voucherValid, resolutionPeriod } = o;

    return new OfferDurations(disputePeriod, voucherValid, resolutionPeriod);
  }

  /**
   * Get a new OfferDurations instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    let disputePeriod, voucherValid, resolutionPeriod;

    // destructure struct
    [disputePeriod, voucherValid, resolutionPeriod] = struct;

    return OfferDurations.fromObject({
      disputePeriod: disputePeriod.toString(),
      voucherValid: voucherValid.toString(),
      resolutionPeriod: resolutionPeriod.toString(),
    });
  }

  /**
   * Get a database representation of this OfferDurations instance
   * @returns {object}
   */
  toObject() {
    return JSON.parse(this.toString());
  }

  /**
   * Get a string representation of this OfferDurations instance
   * @returns {string}
   */
  toString() {
    return JSON.stringify(this);
  }

  /**
   * Get a struct representation of this OfferDurations instance
   * @returns {string}
   */
  toStruct() {
    return [this.disputePeriod, this.voucherValid, this.resolutionPeriod];
  }

  /**
   * Clone this OfferDurations
   * @returns {OfferDurations}
   */
  clone() {
    return OfferDurations.fromObject(this.toObject());
  }

  /**
   * Is this OfferDurations instance's disputePeriod field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  disputePeriodIsValid() {
    return bigNumberIsValid(this.disputePeriod);
  }

  /**
   * Is this OfferDurations instance's voucherValid field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  voucherValidIsValid() {
    return bigNumberIsValid(this.voucherValid);
  }

  /**
   * Is this OfferDurations instance's resolutionPeriod field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  resolutionPeriodIsValid() {
    return bigNumberIsValid(this.resolutionPeriod);
  }

  /**
   * Is this OfferDurations instance valid?
   * @returns {boolean}
   */
  isValid() {
    return this.disputePeriodIsValid() && this.voucherValidIsValid() && this.resolutionPeriodIsValid();
  }
}

// Export
module.exports = OfferDurations;
