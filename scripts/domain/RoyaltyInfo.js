const { addressArrayIsValid, bigNumberArrayIsValid } = require("../util/validations.js");

/**
 * Boson Protocol Domain Entity: RoyaltyInfo
 *
 * See: {BosonTypes.RoyaltyInfo}
 */
class RoyaltyInfo {
  /*
    struct RoyaltyInfo {
        address payable[] recipients;
        uint256[] bps;
    }
    */

  constructor(recipients, bps) {
    this.recipients = recipients;
    this.bps = bps;
  }

  /**
   * Get a new RoyaltyInfo instance from a pojo representation
   * @param o
   * @returns {RoyaltyInfo}
   */
  static fromObject(o) {
    const { recipients, bps } = o;
    return new RoyaltyInfo(recipients, bps);
  }

  /**
   * Get a new RoyaltyInfo instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    // destructure struct
    let [recipients, bps] = struct;

    return RoyaltyInfo.fromObject({
      recipients,
      bps: bps.map((bp) => bp.toString()),
    });
  }

  /**
   * Get a database representation of this RoyaltyInfo instance
   * @returns {object}
   */
  toObject() {
    return JSON.parse(this.toString());
  }

  /**
   * Get a string representation of this RoyaltyInfo instance
   * @returns {string}
   */
  toString() {
    return JSON.stringify(this);
  }

  /**
   * Get a struct representation of this RoyaltyInfo instance
   * @returns {string}
   */
  toStruct() {
    return [this.recipients, this.bps];
  }

  /**
   * Clone this RoyaltyInfo
   * @returns {RoyaltyInfo}
   */
  clone() {
    return RoyaltyInfo.fromObject(this.toObject());
  }

  /**
   * Is this RoyaltyInfo instance's recipients field valid?
   * Must be an array of eip55 compliant Ethereum addresses
   * @returns {boolean}
   */
  recipientsIsValid() {
    return addressArrayIsValid(this.recipients);
  }

  /**
   * Is this RoyaltyInfo instance's bps field valid?
   * Must be an array of numbers
   * @returns {boolean}
   */
  bpsIsValid() {
    return bigNumberArrayIsValid(this.bps);
  }

  /**
   * Is this RoyaltyInfo instance valid?
   * @returns {boolean}
   */
  isValid() {
    return this.recipientsIsValid() && this.bpsIsValid();
  }
}

module.exports = RoyaltyInfo;
