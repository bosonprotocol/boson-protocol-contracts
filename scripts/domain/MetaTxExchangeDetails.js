const ethers = require("ethers");

/**
 * Boson Protocol Domain Entity: MetaTxExchangeDetails
 *
 * See: {BosonTypes.MetaTxExchangeDetails}
 */
class MetaTxExchangeDetails {
  /*
        struct MetaTxExchangeDetails {
            uint256 exchangeId;
        }
  */

  constructor(exchangeId) {
    this.exchangeId = exchangeId;
  }

  /**
   * Get a new MetaTxExchangeDetails instance from a pojo representation
   * @param o
   * @returns {MetaTxExchangeDetails}
   */
  static fromObject(o) {
    const { exchangeId } = o;

    return new MetaTxExchangeDetails(exchangeId);
  }

  /**
   * Get a new MetaTxExchangeDetails instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    let exchangeId;

    // destructure struct
    [exchangeId] = struct;

    return MetaTxExchangeDetails.fromObject({
      exchangeId: exchangeId.toString(),
    });
  }

  /**
   * Get a database representation of this MetaTxExchangeDetails instance
   * @returns {object}
   */
  toObject() {
    return JSON.parse(this.toString());
  }

  /**
   * Get a string representation of this MetaTxExchangeDetails instance
   * @returns {string}
   */
  toString() {
    return JSON.stringify(this);
  }

  /**
   * Get a struct representation of this MetaTxExchangeDetails instance
   * @returns {string}
   */
  toStruct() {
    return [this.exchangeId];
  }

  /**
   * Clone this MetaTxExchangeDetails
   * @returns {MetaTxExchangeDetails}
   */
  clone() {
    return MetaTxExchangeDetails.fromObject(this.toObject());
  }

  /**
   * Is this MetaTxExchangeDetails instance's exchangeId field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  exchangeIdIsValid() {
    let valid = false;
    let { exchangeId } = this;
    try {
      valid = typeof exchangeId === "string" && typeof ethers.BigNumber.from(exchangeId) === "object";
    } catch (e) {}
    return valid;
  }

  /**
   * Is this MetaTxExchangeDetails instance valid?
   * @returns {boolean}
   */
  isValid() {
    return this.exchangeIdIsValid();
  }
}

// Export
module.exports = MetaTxExchangeDetails;
