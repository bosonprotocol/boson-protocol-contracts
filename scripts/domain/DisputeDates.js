const ethers = require("ethers");
const DisputeDate = require("./DisputeDate");

/**
 * Boson Protocol Domain Entity: DisputeDates
 *
 * This is not really a separate entity, but is returned as a part of dispute
 */
class DisputeDates {
  /*
      uint256[]
  */

  constructor(disputed, escalated, finalized, timeout) {
    this.disputed = disputed;
    this.escalated = escalated;
    this.finalized = finalized;
    this.timeout = timeout;
  }

  /**
   * Get a new DisputeDates instance from a pojo representation
   * @param o
   * @returns {DisputeDates}
   */
  static fromObject(o) {
    const { disputed, escalated, finalized, timeout } = o;
    return new DisputeDates(disputed, escalated, finalized, timeout);
  }

  /**
   * Get a new DisputeDates instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    const o = {
      disputed: struct[DisputeDate.Disputed].toString(),
      escalated: struct[DisputeDate.Escalated].toString(),
      finalized: struct[DisputeDate.Finalized].toString(),
      timeout: struct[DisputeDate.Timeout].toString(),
    };

    return DisputeDates.fromObject(o);
  }

  /**
   * Get a database representation of this DisputeDates instance
   * @returns {object}
   */
  toObject() {
    return JSON.parse(this.toString());
  }

  /**
   * Get a string representation of this DisputeDates instance
   * @returns {string}
   */
  toString() {
    return JSON.stringify(this);
  }

  /**
   * Get a struct representation of this DisputeDates instance
   * @returns {string}
   */
  toStruct() {
    let s = [];
    for (const dateMode of DisputeDate.Modes) {
      s.push(this[dateMode] || "0");
    }

    return s;
  }

  /**
   * Clone this DisputeDates
   * @returns {DisputeDates}
   */
  clone() {
    return DisputeDates.fromObject(this.toObject());
  }

  /**
   * Is this DisputeDates instance's disputed field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  disputedIsValid() {
    let valid = false;
    let { disputed } = this;
    try {
      valid = typeof disputed === "string" && typeof ethers.BigNumber.from(disputed) === "object";
    } catch (e) {}
    return valid;
  }

  /**
   * Is this DisputeDates instance's escalated field valid?
   * If present, must be a string representation of a big number
   * @returns {boolean}
   */
  escalatedIsValid() {
    let valid = false;
    let { escalated } = this;
    try {
      valid =
        escalated === null ||
        escalated === undefined ||
        (typeof escalated === "string" && typeof ethers.BigNumber.from(escalated) === "object");
    } catch (e) {}
    return valid;
  }

  /**
   * Is this DisputeDates instance's finalized field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  finalizedIsValid() {
    let valid = false;
    let { finalized } = this;
    try {
      valid =
        finalized === null ||
        finalized === undefined ||
        (typeof finalized === "string" && typeof ethers.BigNumber.from(finalized) === "object");
    } catch (e) {}
    return valid;
  }

  /**
   * Is this DisputeDates instance's timeout field valid?
   * If present, must be a string representation of a big number
   * @returns {boolean}
   */
  timeoutIsValid() {
    let valid = false;
    let { timeout } = this;
    try {
      valid = typeof timeout === "string" && typeof ethers.BigNumber.from(timeout) === "object";
    } catch (e) {}
    return valid;
  }

  /**
   * Is this DisputeDates instance valid?
   * @returns {boolean}
   */
  isValid() {
    return this.disputedIsValid() && this.escalatedIsValid() && this.finalizedIsValid() && this.timeoutIsValid();
  }
}

// Export
module.exports = DisputeDates;
