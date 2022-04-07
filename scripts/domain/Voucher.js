const ethers = require("ethers");

/**
 * Boson Protocol Domain Entity: Voucher
 *
 * See: {BosonTypes.Voucher}
 */
class Voucher {
  /*
        struct Voucher {
            uint256 committedDate;
            uint256 validUntilDate;
            uint256 redeemedDate;
        }
   */

  constructor(committedDate, validUntilDate, redeemedDate, expired) {
    this.committedDate = committedDate;
    this.validUntilDate = validUntilDate;
    this.redeemedDate = redeemedDate;
    this.expired = expired;
  }

  /**
   * Get a new Voucher instance from a pojo representation
   * @param o
   * @returns {Voucher}
   */
  static fromObject(o) {
    const { committedDate, validUntilDate, redeemedDate, expired } = o;
    return new Voucher(committedDate, validUntilDate, redeemedDate, expired);
  }

  /**
   * Get a new Voucher instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    let committedDate, validUntilDate, redeemedDate, expired;

    // destructure struct
    [committedDate, validUntilDate, redeemedDate, expired] = struct;

    return Voucher.fromObject({
      committedDate: committedDate.toString(),
      validUntilDate: validUntilDate.toString(),
      redeemedDate: redeemedDate.toString(),
      expired: expired,
    });
  }

  /**
   * Get a database representation of this Voucher instance
   * @returns {object}
   */
  toObject() {
    return JSON.parse(this.toString());
  }

  /**
   * Get a string representation of this Voucher instance
   * @returns {string}
   */
  toString() {
    return JSON.stringify(this);
  }

  /**
   * Get a struct representation of this Voucher instance
   * @returns {string}
   */
  toStruct() {
    return [this.committedDate, this.validUntilDate, this.redeemedDate, this.expired];
  }

  /**
   * Clone this Voucher
   * @returns {Voucher}
   */
  clone() {
    return Voucher.fromObject(this.toObject());
  }

  /**
   * Is this Voucher instance's committedDate field valid?
   * If present, must be a string representation of a positive big number
   * @returns {boolean}
   */
  committedDateIsValid() {
    let valid = false;
    let { committedDate } = this;
    try {
      valid =
        committedDate === null ||
        committedDate === undefined ||
        (typeof committedDate === "string" && ethers.BigNumber.from(committedDate).gt(0));
    } catch (e) {}
    return valid;
  }

  /**
   * Is this Voucher instance's validUntilDate field valid?
   * If present, must be a string representation of a positive big number
   * @returns {boolean}
   */
  validUntilDateIsValid() {
    let valid = false;
    let { validUntilDate } = this;
    try {
      valid =
        validUntilDate === null ||
        validUntilDate === undefined ||
        (typeof validUntilDate === "string" && ethers.BigNumber.from(validUntilDate).gt(0));
    } catch (e) {}
    return valid;
  }

  /**
   * Is this Voucher instance's redeemedDate field valid?
   * If present, must be a string representation of a positive big number
   * @returns {boolean}
   */
  redeemedDateIsValid() {
    let valid = false;
    let { redeemedDate } = this;
    try {
      valid =
        redeemedDate === null ||
        redeemedDate === undefined ||
        (typeof redeemedDate === "string" && ethers.BigNumber.from(redeemedDate).gt(0));
    } catch (e) {}
    return valid;
  }

  /**
   * Is this Exchange instance's expired field valid?
   * @returns {boolean}
   */
  expiredIsValid() {
    let valid = false;
    let { expired } = this;
    try {
      valid = typeof expired === "boolean";
    } catch (e) {}
    return valid;
  }

  /**
   * Is this Voucher instance valid?
   * @returns {boolean}
   */
  isValid() {
    return (
      this.committedDateIsValid() && this.validUntilDateIsValid() && this.redeemedDateIsValid() && this.expiredIsValid()
    );
  }
}

// Export
module.exports = Voucher;
