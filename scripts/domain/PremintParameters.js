const { bigNumberIsValid, addressIsValid } = require("../util/validations.js");

/**
 * Boson Protocol Domain Entity: PremintParameters
 *
 * See: {BosonTypes.PremintParameters}
 */
class PremintParameters {
  /*
        struct PremintParameters {
        uint256 reservedRangeLength;
        address to;
    }
    */

  constructor(reservedRangeLength, to) {
    this.reservedRangeLength = reservedRangeLength;
    this.to = to;
  }

  /**
   * Get a new PremintParameters instance from a pojo representation
   * @param o
   * @returns {PremintParameters}
   */
  static fromObject(o) {
    const { reservedRangeLength, to } = o;
    return new PremintParameters(reservedRangeLength, to);
  }

  /**
   * Get a new PremintParameters instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    let reservedRangeLength, to;

    // destructure struct
    [reservedRangeLength, to] = struct;

    return PremintParameters.fromObject({
      reservedRangeLength: reservedRangeLength.toString(),
      to,
    });
  }

  /**
   * Get a database representation of this PremintParameters instance
   * @returns {object}
   */
  toObject() {
    return JSON.parse(this.toString());
  }

  /**
   * Get a string representation of this PremintParameters instance
   * @returns {string}
   */
  toString() {
    return JSON.stringify(this);
  }

  /**
   * Get a struct representation of this PremintParameters instance
   * @returns {string}
   */
  toStruct() {
    return [this.reservedRangeLength, this.to];
  }

  /**
   * Clone this PremintParameters
   * @returns {PremintParameters}
   */
  clone() {
    return PremintParameters.fromObject(this.toObject());
  }

  /**
   * Is this PremintParameters instance's reservedRangeLength field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  reservedRangeLengthIsValid() {
    const { reservedRangeLength } = this;
    return bigNumberIsValid(reservedRangeLength);
  }

  /**
   * Is this PremintParameters instance's to field valid?
   * Must be a eip55 compliant Ethereum address
   * @returns {boolean}
   */
  toIsValid() {
    return addressIsValid(this.to);
  }

  /**
   * Is this PremintParameters instance valid?
   * @returns {boolean}
   */
  isValid() {
    return this.reservedRangeLengthIsValid() && this.toIsValid();
  }
}

// Export
module.exports = PremintParameters;
