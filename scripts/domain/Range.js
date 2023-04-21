const { bigNumberIsValid, addressIsValid } = require("../util/validations.js");

/**
 * Boson Client Entity: Range
 *
 * See: {BosonVoucher.Range}
 */
class Range {
  /*
    struct Range {
      uint256 start;
      uint256 length;
      uint256 minted;
      uint256 lastBurnedTokenId;
      address owner;
      }
  */

  constructor(start, length, minted, lastBurnedTokenId, owner) {
    this.start = start;
    this.length = length;
    this.minted = minted;
    this.lastBurnedTokenId = lastBurnedTokenId;
    this.owner = owner;
  }

  /**
   * Get a new Range instance from a pojo representation
   * @param o
   * @returns {Range}
   */
  static fromObject(o) {
    const { start, length, minted, lastBurnedTokenId, owner } = o;
    return new Range(start, length, minted, lastBurnedTokenId, owner);
  }

  /**
   * Get a new Range instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    // destructure struct
    let [start, length, minted, lastBurnedTokenId, owner] = struct;

    return Range.fromObject({
      start: start.toString(),
      length: length.toString(),
      minted: minted.toString(),
      lastBurnedTokenId: lastBurnedTokenId.toString(),
      owner,
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
    return [this.start, this.length, this.minted, this.lastBurnedTokenId, this.owner];
  }

  /**
   * Clone this Range
   * @returns {Range}
   */
  clone() {
    return Range.fromObject(this.toObject());
  }

  /**
   * Is this Range instance's start field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  startIsValid() {
    return bigNumberIsValid(this.start);
  }

  /**
   * Is this Range instance's length field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  lengthIsValid() {
    return bigNumberIsValid(this.length);
  }

  /**
   * Is this Range instance's minted field valid?
   * If present, must be a string representation of a big number
   * @returns {boolean}
   */
  mintedIsValid() {
    return bigNumberIsValid(this.minted, { optional: true });
  }

  /**
   * Is this Range instance's lastBurnedTokenId field valid?
   * If present, must be a string representation of a big number
   * @returns {boolean}
   */
  lastBurnedTokenIdIsValid() {
    return bigNumberIsValid(this.lastBurnedTokenId, { optional: true });
  }

  /**
   * Is this Range instance's owner field valid?
   * Must be a eip55 compliant Ethereum address
   * @returns {boolean}
   */
  ownerIsValid() {
    return addressIsValid(this.owner);
  }

  /**
   * Is this Range instance valid?
   * @returns {boolean}
   */
  isValid() {
    return this.startIsValid() && this.lengthIsValid() && this.mintedIsValid() && this.lastBurnedTokenIdIsValid();
  }
}

// Export
module.exports = Range;
