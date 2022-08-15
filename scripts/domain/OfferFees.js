const ethers = require("ethers");

/**
 * Boson Protocol Domain Entity: OfferFees
 *
 * See: {BosonTypes.OfferFees}
 */
class OfferFees {
  /*
        struct OfferFees {
            uint256 protocolFee;
            uint256 agentFee;
        }
    */

  constructor(protocolFee, agentFee) {
    this.protocolFee = protocolFee;
    this.agentFee = agentFee;
  }

  /**
   * Get a new OfferFees instance from a pojo representation
   * @param o
   * @returns {OfferFees}
   */
  static fromObject(o) {
    const { protocolFee, agentFee } = o;

    return new OfferFees(protocolFee, agentFee);
  }

  /**
   * Get a new OfferFees instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    // destructure struct
    let [protocolFee, agentFee] = struct;

    return OfferFees.fromObject({
      protocolFee: protocolFee.toString(),
      agentFee: agentFee.toString(),
    });
  }

  /**
   * Get a database representation of this OfferFees instance
   * @returns {object}
   */
  toObject() {
    return JSON.parse(this.toString());
  }

  /**
   * Get a string representation of this OfferFees instance
   * @returns {string}
   */
  toString() {
    return JSON.stringify(this);
  }

  /**
   * Get a struct representation of this OfferFees instance
   * @returns {string}
   */
  toStruct() {
    return [this.protocolFee, this.agentFee];
  }

  /**
   * Clone this OfferFees
   * @returns {OfferFees}
   */
  clone() {
    return OfferFees.fromObject(this.toObject());
  }

  /**
   * Is this OfferFees instance's protocolFee field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  protocolFeeIsValid() {
    let valid = false;
    let { protocolFee } = this;
    try {
      valid = typeof protocolFee === "string" && typeof ethers.BigNumber.from(protocolFee) === "object";
    } catch (e) {}
    return valid;
  }

  /**
   * Is this OfferFees instance's agentFee field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  agentFeeIsValid() {
    let valid = false;
    let { agentFee } = this;
    try {
      valid = typeof agentFee === "string" && typeof ethers.BigNumber.from(agentFee) === "object";
    } catch (e) {}
    return valid;
  }

  /**
   * Is this OfferFees instance valid?
   * @returns {boolean}
   */
  isValid() {
    return this.protocolFeeIsValid() && this.agentFeeIsValid();
  }
}

// Export
module.exports = OfferFees;
