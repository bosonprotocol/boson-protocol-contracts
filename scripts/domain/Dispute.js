const ethers = require("ethers");

/**
 * Boson Protocol Domain Entity: Dispute
 *
 * See: {BosonTypes.Dispute}
 */
class Dispute {
  /*
    struct Dispute {
        uint256 exchangeId;
        string complaint;
        DisputeState state;
        uint256 buyerPercent;
    }
    */

  constructor(exchangeId, complaint, state, buyerPercent) {
    this.exchangeId = exchangeId;
    this.complaint = complaint;
    this.state = state;
    this.buyerPercent = buyerPercent;
  }

  /**
   * Get a new Dispute instance from a pojo representation
   * @param o
   * @returns {Dispute}
   */
  static fromObject(o) {
    const { exchangeId, complaint, state, buyerPercent } = o;
    return new Dispute(exchangeId, complaint, state, buyerPercent);
  }

  /**
   * Get a new Dispute instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    let exchangeId, complaint, state, buyerPercent;

    // destructure struct
    [exchangeId, complaint, state, buyerPercent] = struct;

    return Dispute.fromObject({
      exchangeId: exchangeId.toString(),
      complaint,
      state,
      resolution: buyerPercent.toString(),
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
    return [this.exchangeId, this.complaint, this.state, this.buyerPercent];
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
    let valid = false;
    let { exchangeId } = this;
    try {
      valid = typeof exchangeId === "string" && typeof ethers.BigNumber.from(exchangeId) === "object";
    } catch (e) {}
    return valid;
  }

  /**
   * Is this Dispute instance's complaint field valid?
   * Must be a string
   * @returns {boolean}
   */
  complaintIsValid() {
    let valid = false;
    let { complaint } = this;
    try {
      valid = typeof complaint === "string";
    } catch (e) {}
    return valid;
  }

  /**
   * Is this Dispute instance's state field valid?
   * Must be a number representation of a big number
   * @returns {boolean}
   */
  stateIsValid() {
    let valid = false;
    let { state } = this;
    try {
      valid = typeof state === "number" && typeof ethers.BigNumber.from(state) === "object";
    } catch (e) {}
    return valid;
  }

  /**
   * Is this Dispute instance's buyerPercent field valid?
   * Must be an array of numbers
   * @returns {boolean}
   */
  buyerPercentIsValid() {
    let valid = false;
    let { buyerPercent } = this;
    try {
      valid = typeof buyerPercent === "string" && typeof ethers.BigNumber.from(buyerPercent) === "object";
    } catch (e) {}
    return valid;
  }

  /**
   * Is this Dispute instance valid?
   * @returns {boolean}
   */
  isValid() {
    return this.exchangeIdIsValid() && this.complaintIsValid() && this.stateIsValid() && this.buyerPercentIsValid();
  }
}

// Export
module.exports = Dispute;
