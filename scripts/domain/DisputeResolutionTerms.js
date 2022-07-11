const ethers = require("ethers");

/**
 * Boson Protocol Domain Entity: DisputeResolutionTerms
 *
 * See: {BosonTypes.DisputeResolutionTerms}
 */
class DisputeResolutionTerms {
  /*
    struct DisputeResolutionTerms {
      uint256 disputeResolverId;
      uint256 escalationResponsePeriod;
    }
  */

  constructor(disputeResolverId, escalationResponsePeriod) {
    this.disputeResolverId = disputeResolverId;
    this.escalationResponsePeriod = escalationResponsePeriod;
  }

  /**
   * Get a new DisputeResolutionTerms instance from a pojo representation
   * @param o
   * @returns {DisputeResolutionTerms}
   */
  static fromObject(o) {
    const { disputeResolverId, escalationResponsePeriod } = o;
    return new DisputeResolutionTerms(disputeResolverId, escalationResponsePeriod);
  }

  /**
   * Get a new DisputeResolutionTerms instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    let disputeResolverId, escalationResponsePeriod;

    // destructure struct
    [disputeResolverId, escalationResponsePeriod] = struct;

    return DisputeResolutionTerms.fromObject({
      disputeResolverId: disputeResolverId.toString(),
      escalationResponsePeriod: escalationResponsePeriod.toString(),
    });
  }

  /**
   * Get a database representation of this DisputeResolutionTerms instance
   * @returns {object}
   */
  toObject() {
    return JSON.parse(this.toString());
  }

  /**
   * Get a string representation of this DisputeResolutionTerms instance
   * @returns {string}
   */
  toString() {
    return JSON.stringify(this);
  }

  /**
   * Get a struct representation of this DisputeResolutionTerms instance
   * @returns {string}
   */
  toStruct() {
    return [this.disputeResolverId, this.escalationResponsePeriod];
  }

  /**
   * Clone this DisputeResolutionTerms
   * @returns {DisputeResolutionTerms}
   */
  clone() {
    return DisputeResolutionTerms.fromObject(this.toObject());
  }

  /**
   * Is this DisputeResolutionTerms instance's disputeResolverId field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  disputeResolverIdIsValid() {
    let valid = false;
    let { disputeResolverId } = this;
    try {
      valid = typeof disputeResolverId === "string" && typeof ethers.BigNumber.from(disputeResolverId) === "object";
    } catch (e) {}
    return valid;
  }

  /**
   * Is this DisputeResolutionTerms instance's escalationResponsePeriod field valid?
   * If present, must be a string representation of a big number
   * @returns {boolean}
   */
  escalationResponsePeriodIsValid() {
    let valid = false;
    let { escalationResponsePeriod } = this;
    try {
      valid =
        typeof escalationResponsePeriod === "string" &&
        typeof ethers.BigNumber.from(escalationResponsePeriod) === "object";
    } catch (e) {}
    return valid;
  }

  /**
   * Is this DisputeResolutionTerms instance valid?
   * @returns {boolean}
   */
  isValid() {
    return this.disputeResolverIdIsValid() && this.escalationResponsePeriodIsValid();
  }
}

// Export
module.exports = DisputeResolutionTerms;
