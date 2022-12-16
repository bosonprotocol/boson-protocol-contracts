const { bigNumberIsValid } = require("../util/validations.js");

/**
 * Boson Client Entity: Range
 *
 * See: {BosonVoucher.Range}
 */
class Range {
  /*
    struct Range {
      uint256 offerId;
      uint256 start;
      uint256 length;
      uint256 minted;
      }
  */

  constructor(offerId, start, length, minted) {
    this.offerId = offerId;
    this.start = start;
    this.length = length;
    this.minted = minted;
  }

  /**
   * Get a new Range instance from a pojo representation
   * @param o
   * @returns {Range}
   */
  static fromObject(o) {
    const { offerId, start, length, minted } = o;
    return new Range(offerId, start, length, minted);
  }

  /**
   * Get a new Range instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    let offerId, start, length, minted;

    // destructure struct
    [offerId, start, length, minted] = struct;

    return Range.fromObject({
      offerId: offerId.toString(),
      start: start.toString(),
      length: length.toString(),
      minted: minted.toString(),
    });
  }

  /**
   * Get a database representation of this Range instance
   * @returns {object}
   */
  toObject() {
    return JSON.parse(this.toString());
  }

  /**
   * Get a string representation of this Range instance
   * @returns {string}
   */
  toString() {
    return JSON.stringify(this);
  }

  /**
   * Get a struct representation of this Range instance
   * @returns {string}
   */
  toStruct() {
    return [this.offerId, this.start, this.length, this.minted];
  }

  /**
   * Clone this Range
   * @returns {Range}
   */
  clone() {
    return Range.fromObject(this.toObject());
  }

  /**
   * Is this Range instance's offerId field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  offerIdIsValid() {
    return bigNumberIsValid(this.offerId);
  }

  /**
   * Is this Range instance's start field valid?
   * If present, must be a string representation of a big number
   * @returns {boolean}
   */
  startIsValid() {
    return bigNumberIsValid(this.start, { optional: true });
  }

  /**
   * Is this Range instance's length field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  lengthIsValid() {
    return bigNumberIsValid(this.length, { optional: true });
  }

  /**
   * Is this Range instance's minted field valid?
   * If present, must be a string representation of a big number
   * @returns {boolean}
   */
  mintedIsValid() {
    return bigNumberIsValid(this.minted);
  }

  /**
   * Is this Range instance valid?
   * @returns {boolean}
   */
  isValid() {
    return this.offerIdIsValid() && this.startIsValid() && this.lengthIsValid() && this.mintedIsValid();
  }
}

// Export
module.exports = Range;
