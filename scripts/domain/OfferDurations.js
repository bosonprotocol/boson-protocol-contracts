const ethers = require("ethers");

/**
 * Boson Protocol Domain Entity: OfferDurations
 *
 * See: {BosonTypes.OfferDurations}
 */
class OfferDurations {
  /*
    struct OfferDurations {
        uint256 fulfillmentPeriod;
        uint256 voucherValid;
        uint256 disputeValid;
    }
  */

  constructor(fulfillmentPeriod, voucherValid, disputeValid) {
    this.voucherValid = voucherValid;
    this.fulfillmentPeriod = fulfillmentPeriod;
    this.disputeValid = disputeValid;
  }

  /**
   * Get a new OfferDurations instance from a pojo representation
   * @param o
   * @returns {OfferDurations}
   */
  static fromObject(o) {
    const { fulfillmentPeriod, voucherValid, disputeValid } = o;

    return new OfferDurations(fulfillmentPeriod, voucherValid, disputeValid);
  }

  /**
   * Get a new OfferDurations instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    let fulfillmentPeriod, voucherValid, disputeValid;

    // destructure struct
    [fulfillmentPeriod, voucherValid, disputeValid] = struct;

    return OfferDurations.fromObject({
      fulfillmentPeriod: fulfillmentPeriod.toString(),
      voucherValid: voucherValid.toString(),
      disputeValid: disputeValid.toString(),
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
    return [this.fulfillmentPeriod, this.voucherValid, this.disputeValid];
  }

  /**
   * Clone this OfferDurations
   * @returns {OfferDurations}
   */
  clone() {
    return OfferDurations.fromObject(this.toObject());
  }

  /**
   * Is this OfferDurations instance's fulfillmentPeriod field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  fulfillmentPeriodIsValid() {
    let valid = false;
    let { fulfillmentPeriod } = this;
    try {
      valid = typeof fulfillmentPeriod === "string" && typeof ethers.BigNumber.from(fulfillmentPeriod) === "object";
    } catch (e) {}
    return valid;
  }

  /**
   * Is this OfferDurations instance's voucherValid field valid?
   * Must be a string representation of a big number
   * TODO: make sure it's time within a reasonable range?
   * @returns {boolean}
   */
  voucherValidIsValid() {
    let valid = false;
    let { voucherValid } = this;
    try {
      valid = typeof voucherValid === "string" && typeof ethers.BigNumber.from(voucherValid) === "object";
    } catch (e) {}
    return valid;
  }

  /**
   * Is this OfferDurations instance's disputeValid field valid?
   * Must be a string representation of a big number
   * TODO: make sure it's time within a reasonable range?
   * @returns {boolean}
   */
  disputeValidIsValid() {
    let valid = false;
    let { disputeValid } = this;
    try {
      valid = typeof disputeValid === "string" && typeof ethers.BigNumber.from(disputeValid) === "object";
    } catch (e) {}
    return valid;
  }

  /**
   * Is this OfferDurations instance valid?
   * @returns {boolean}
   */
  isValid() {
    return this.fulfillmentPeriodIsValid() && this.voucherValidIsValid() && this.disputeValidIsValid();
  }
}

// Export
module.exports = OfferDurations;
