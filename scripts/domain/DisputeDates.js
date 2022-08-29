const { bigNumberIsValid } = require("../util/validations.js");

/**
 * Boson Protocol Domain Entity: DisputeDates
 *
 * See: {BosonTypes.DisputeDates}
 */
class DisputeDates {
  /*
    struct DisputeDates {
      uint256 disputed;
      uint256 escalated;
      uint256 finalized;
      uint256 timeout;
      }
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
    let disputed, escalated, finalized, timeout;

    // destructure struct
    [disputed, escalated, finalized, timeout] = struct;

    return DisputeDates.fromObject({
      disputed: disputed.toString(),
      escalated: escalated.toString(),
      finalized: finalized.toString(),
      timeout: timeout.toString(),
    });
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
    return [this.disputed, this.escalated, this.finalized, this.timeout];
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
    return bigNumberIsValid(this.disputed);
  }

  /**
   * Is this DisputeDates instance's escalated field valid?
   * If present, must be a string representation of a big number
   * @returns {boolean}
   */
  escalatedIsValid() {
    return bigNumberIsValid(this.escalated, { optional: true });
  }

  /**
   * Is this DisputeDates instance's finalized field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  finalizedIsValid() {
    return bigNumberIsValid(this.finalized, { optional: true });
  }

  /**
   * Is this DisputeDates instance's timeout field valid?
   * If present, must be a string representation of a big number
   * @returns {boolean}
   */
  timeoutIsValid() {
    return bigNumberIsValid(this.timeout);
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
