const DisputeState = require("./DisputeState");
const { bigNumberIsValid, enumIsValid } = require("../util/validations.js");

/**
 * Boson Protocol Domain Entity: Dispute
 *
 * See: {BosonTypes.Dispute}
 */
class Dispute {
  /*
    struct Dispute {
        uint256 exchangeId;
        DisputeState state;
        uint256 buyerPercent;
    }
    */

  constructor(exchangeId, state, buyerPercent) {
    this.exchangeId = exchangeId;
    this.state = state;
    this.buyerPercent = buyerPercent;
  }

  /**
   * Get a new Dispute instance from a pojo representation
   * @param o
   * @returns {Dispute}
   */
  static fromObject(o) {
    const { exchangeId, state, buyerPercent } = o;
    return new Dispute(exchangeId, state, buyerPercent);
  }

  /**
   * Get a new Dispute instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    let exchangeId, state, buyerPercent;

    // destructure struct
    [exchangeId, state, buyerPercent] = struct;

    return Dispute.fromObject({
      exchangeId: exchangeId.toString(),
      state,
      buyerPercent: buyerPercent.toString(),
    });
  }

  /**
   * Get a database representation of this Dispute instance
   * @returns {object}
   */
  toObject() {
    return JSON.parse(this.toString());
  }

  /**
   * Get a string representation of this Dispute instance
   * @returns {string}
   */
  toString() {
    return JSON.stringify(this);
  }

  /**
   * Get a struct representation of this Dispute instance
   * @returns {string}
   */
  toStruct() {
    return [this.exchangeId, this.state, this.buyerPercent];
  }

  /**
   * Clone this Dispute
   * @returns {Dispute}
   */
  clone() {
    return Dispute.fromObject(this.toObject());
  }

  /**
   * Is this Dispute instance's exchangeId field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  exchangeIdIsValid() {
    return bigNumberIsValid(this.exchangeId);
  }

  /**
   * Is this Dispute instance's state field valid?
   * Must be a number belonging to the DisputeState enum
   * @returns {boolean}
   */
  stateIsValid() {
    return enumIsValid(this.state, DisputeState.Types);
  }

  /**
   * Is this Dispute instance's buyerPercent field valid?
   * Must be an array of numbers
   * @returns {boolean}
   */
  buyerPercentIsValid() {
    return bigNumberIsValid(this.buyerPercent, {
      lte: "10000",
    });
  }

  /**
   * Is this Dispute instance valid?
   * @returns {boolean}
   */
  isValid() {
    return this.exchangeIdIsValid() && this.stateIsValid() && this.buyerPercentIsValid();
  }
}

// Export
module.exports = Dispute;
