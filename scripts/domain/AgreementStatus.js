const { bigNumberIsValid, booleanIsValid } = require("../util/validations.js");

/**
 * DR Fee Mutualizer Entity: AgreementStatus
 *
 * See: {DRFeeMutualizer.AgreementStatus}
 */
class AgreementStatus {
  /*
      struct AgreementStatus {
        bool confirmed;
        bool voided;
        uint256 outstandingExchanges;
        uint256 totalMutualizedAmount;
    }
    */

  constructor(confirmed, voided, outstandingExchanges, totalMutualizedAmount) {
    this.confirmed = confirmed;
    this.voided = voided;
    this.outstandingExchanges = outstandingExchanges;
    this.totalMutualizedAmount = totalMutualizedAmount;
  }

  /**
   * Get a new AgreementStatus instance from a pojo representation
   * @param o
   * @returns {AgreementStatus}
   */
  static fromObject(o) {
    const { confirmed, voided, outstandingExchanges, totalMutualizedAmount } = o;

    return new AgreementStatus(confirmed, voided, outstandingExchanges, totalMutualizedAmount);
  }

  /**
   * Get a new AgreementStatus instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    let confirmed, voided, outstandingExchanges, totalMutualizedAmount;

    // destructure struct
    [confirmed, voided, outstandingExchanges, totalMutualizedAmount] = struct;

    return AgreementStatus.fromObject({
      confirmed,
      voided,
      outstandingExchanges: outstandingExchanges.toString(),
      totalMutualizedAmount: totalMutualizedAmount.toString(),
    });
  }

  /**
   * Get a database representation of this AgreementStatus instance
   * @returns {object}
   */
  toObject() {
    return JSON.parse(this.toString());
  }

  /**
   * Get a string representation of this AgreementStatus instance
   * @returns {string}
   */
  toString() {
    return JSON.stringify(this);
  }

  /**
   * Get a struct representation of this AgreementStatus instance
   * @returns {string}
   */
  toStruct() {
    return [this.confirmed, this.voided, this.outstandingExchanges, this.totalMutualizedAmount];
  }

  /**
   * Clone this AgreementStatus
   * @returns {AgreementStatus}
   */
  clone() {
    return AgreementStatus.fromObject(this.toObject());
  }

  /**
   * Is this AgreementStatus instance's confirmed field valid?
   * Always present, must be a boolean
   * @returns {boolean}
   */
  confirmedIsValid() {
    return booleanIsValid(this.confirmed);
  }

  /**
   * Is this AgreementStatus instance's voided field valid?
   * Always present, must be a boolean
   * @returns {boolean}
   */
  voidedIsValid() {
    return booleanIsValid(this.voided);
  }

  /**
   * Is this AgreementStatus instance's outstandingExchanges field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  outstandingExchangesIsValid() {
    return bigNumberIsValid(this.outstandingExchanges);
  }

  /**
   * Is this AgreementStatus instance's totalMutualizedAmount field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  totalMutualizedAmountIsValid() {
    return bigNumberIsValid(this.totalMutualizedAmount);
  }

  /**
   * Is this AgreementStatus instance valid?
   * @returns {boolean}
   */
  isValid() {
    return (
      this.confirmedIsValid() &&
      this.voidedIsValid() &&
      this.outstandingExchangesIsValid() &&
      this.totalMutualizedAmountIsValid()
    );
  }
}

// Export
module.exports = AgreementStatus;
