const { bigNumberIsValid } = require("../util/validations.js");

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
      uint256 feeAmount;
      uint256 buyerEscalationDeposit;
    }
  */

  constructor(disputeResolverId, escalationResponsePeriod, feeAmount, buyerEscalationDeposit) {
    this.disputeResolverId = disputeResolverId;
    this.escalationResponsePeriod = escalationResponsePeriod;
    this.feeAmount = feeAmount;
    this.buyerEscalationDeposit = buyerEscalationDeposit;
  }

  /**
   * Get a new DisputeResolutionTerms instance from a pojo representation
   * @param o
   * @returns {DisputeResolutionTerms}
   */
  static fromObject(o) {
    const { disputeResolverId, escalationResponsePeriod, feeAmount, buyerEscalationDeposit } = o;
    return new DisputeResolutionTerms(disputeResolverId, escalationResponsePeriod, feeAmount, buyerEscalationDeposit);
  }

  /**
   * Get a new DisputeResolutionTerms instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    let disputeResolverId, escalationResponsePeriod, feeAmount, buyerEscalationDeposit;

    // destructure struct
    [disputeResolverId, escalationResponsePeriod, feeAmount, buyerEscalationDeposit] = struct;

    return DisputeResolutionTerms.fromObject({
      disputeResolverId: disputeResolverId.toString(),
      escalationResponsePeriod: escalationResponsePeriod.toString(),
      feeAmount: feeAmount.toString(),
      buyerEscalationDeposit: buyerEscalationDeposit.toString(),
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
    return [this.disputeResolverId, this.escalationResponsePeriod, this.feeAmount, this.buyerEscalationDeposit];
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
    return bigNumberIsValid(this.disputeResolverId);
  }

  /**
   * Is this DisputeResolutionTerms instance's escalationResponsePeriod field valid?
   * If present, must be a string representation of a big number
   * @returns {boolean}
   */
  escalationResponsePeriodIsValid() {
    return bigNumberIsValid(this.escalationResponsePeriod);
  }

  /**
   * Is this DisputeResolutionTerms instance's feeAmount field valid?
   * If present, must be a string representation of a big number, less than or equalt to 10000
   * @returns {boolean}
   */
  feeAmountIsValid() {
    const { feeAmount } = this;
    return bigNumberIsValid(feeAmount, { lte: "10000" });
  }

  /**
   * Is this DisputeResolutionTerms instance's buyerEscalationDeposit field valid?
   * If present, must be a string representation of a big number
   * @returns {boolean}
   */
  buyerEscalationDepositIsValid() {
    return bigNumberIsValid(this.buyerEscalationDeposit);
  }

  /**
   * Is this DisputeResolutionTerms instance valid?
   * @returns {boolean}
   */
  isValid() {
    return (
      this.disputeResolverIdIsValid() &&
      this.escalationResponsePeriodIsValid() &&
      this.feeAmountIsValid() &&
      this.buyerEscalationDepositIsValid()
    );
  }
}

// Export
module.exports = DisputeResolutionTerms;
