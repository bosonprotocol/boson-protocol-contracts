const { bigNumberIsValid } = require("../util/validations.js");

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
            uint256 voucherRedeemableFrom;
            uint256 voucherRedeemableUntil;
        }
    */

  constructor(validFrom, validUntil, voucherRedeemableFrom, voucherRedeemableUntil) {
    this.validFrom = validFrom;
    this.validUntil = validUntil;
    this.voucherRedeemableFrom = voucherRedeemableFrom;
    this.voucherRedeemableUntil = voucherRedeemableUntil;
  }

  /**
   * Get a new OfferDates instance from a pojo representation
   * @param o
   * @returns {OfferDates}
   */
  static fromObject(o) {
    const { validFrom, validUntil, voucherRedeemableFrom, voucherRedeemableUntil } = o;

    return new OfferDates(validFrom, validUntil, voucherRedeemableFrom, voucherRedeemableUntil);
  }

  /**
   * Get a new OfferDates instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    let validFrom, validUntil, voucherRedeemableFrom, voucherRedeemableUntil;

    // destructure struct
    [validFrom, validUntil, voucherRedeemableFrom, voucherRedeemableUntil] = struct;

    return OfferDates.fromObject({
      validFrom: validFrom.toString(),
      validUntil: validUntil.toString(),
      voucherRedeemableFrom: voucherRedeemableFrom.toString(),
      voucherRedeemableUntil: voucherRedeemableUntil.toString(),
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
    return [this.validFrom, this.validUntil, this.voucherRedeemableFrom, this.voucherRedeemableUntil];
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
    return bigNumberIsValid(this.validFrom);
  }

  /**
   * Is this OfferDates instance's validUntil field valid?
   * Must be a string representation of a big number
   * TODO: make sure it's time within a reasonable range?
   * @returns {boolean}
   */
  validUntilIsValid() {
    return bigNumberIsValid(this.validUntil);
  }

  /**
   * Is this OfferDates instance's voucherRedeemableFrom field valid?
   * Must be a string representation of a big number
   * TODO: make sure it's time within a reasonable range?
   * @returns {boolean}
   */
  voucherRedeemableFromIsValid() {
    return bigNumberIsValid(this.voucherRedeemableFrom);
  }

  /**
   * Is this OfferDates instance's voucherRedeemableUntil field valid?
   * Must be a string representation of a big number
   * TODO: make sure it's time within a reasonable range?
   * @returns {boolean}
   */
  voucherRedeemableUntilIsValid() {
    return bigNumberIsValid(this.voucherRedeemableUntil);
  }

  /**
   * Is this OfferDates instance valid?
   * @returns {boolean}
   */
  isValid() {
    return (
      this.validFromIsValid() &&
      this.validUntilIsValid() &&
      this.voucherRedeemableFromIsValid() &&
      this.voucherRedeemableUntilIsValid()
    );
  }
}

// Export
module.exports = OfferDates;
