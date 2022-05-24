const ethers = require("ethers");
const Resolution = require("./Resolution");

/**
 * Boson Protocol Domain Entity: Dispute
 *
 * See: {BosonTypes.Dispute}
 */
class Dispute {
  /*
    struct Dispute {
        uint256 exchangeId;
        uint256 disputedDate;
        uint256 finalizedDate;
        string complaint;
        DisputeState state;
        Resolution resolution;
    }
    */

  constructor(exchangeId, disputedDate, finalizedDate, complaint, state, resolution) {
    this.exchangeId = exchangeId;
    this.disputedDate = disputedDate;
    this.finalizedDate = finalizedDate;
    this.complaint = complaint;
    this.state = state;
    this.resolution = resolution;
  }

  /**
   * Get a new Dispute instance from a pojo representation
   * @param o
   * @returns {Dispute}
   */
  static fromObject(o) {
    const { exchangeId, disputedDate, finalizedDate, complaint, state, resolution } = o;
    const r = Resolution.fromObject(resolution);
    return new Dispute(exchangeId, disputedDate, finalizedDate, complaint, state, r);
  }

  /**
   * Get a new Dispute instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    let exchangeId, disputedDate, finalizedDate, complaint, state, resolution;

    // destructure struct
    [exchangeId, disputedDate, finalizedDate, complaint, state, resolution] = struct;

    return Dispute.fromObject({
      exchangeId: exchangeId.toString(),
      disputedDate: disputedDate.toString(),
      finalizedDate: finalizedDate.toString(),
      complaint,
      state,
      resolution: Resolution.fromStruct(resolution).toObject(),
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
    return [
      this.exchangeId,
      this.disputedDate,
      this.finalizedDate,
      this.complaint,
      this.state,
      this.resolution.toStruct(),
    ];
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
   * Is this Dispute instance's disputedDate field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  disputedDateIsValid() {
    let valid = false;
    let { disputedDate } = this;
    try {
      valid = typeof disputedDate === "string" && typeof ethers.BigNumber.from(disputedDate) === "object";
    } catch (e) {}
    return valid;
  }

  /**
   * Is this Dispute instance's disputedDate field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  finalizedDateIsValid() {
    let valid = false;
    let { finalizedDate } = this;
    try {
      valid = typeof finalizedDate === "string" && typeof ethers.BigNumber.from(finalizedDate) === "object";
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
   * Is this Dispute instance's resolution field valid?
   * Must be an array of numbers
   * @returns {boolean}
   */
  resolutionIsValid() {
    let valid = false;
    let { resolution } = this;
    try {
      valid = typeof resolution === "object" && resolution.constructor.name === "Resolution" && resolution.isValid();
    } catch (e) {}
    return valid;
  }

  /**
   * Is this Dispute instance valid?
   * @returns {boolean}
   */
  isValid() {
    return (
      this.exchangeIdIsValid() &&
      this.disputedDateIsValid() &&
      this.finalizedDateIsValid() &&
      this.complaintIsValid() &&
      this.stateIsValid() &&
      this.resolutionIsValid()
    );
  }
}

// Export
module.exports = Dispute;
