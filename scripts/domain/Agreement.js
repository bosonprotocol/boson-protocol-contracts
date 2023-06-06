const { bigNumberIsValid, addressIsValid, booleanIsValid } = require("../util/validations.js");

/**
 * DR Fee Mutualizer Entity: Agreement
 *
 * See: {DRFeeMutualizer.Agreement}
 */
class Agreement {
  /*
      struct Agreement {
        address sellerAddress;
        address token;
        uint256 maxMutualizedAmountPerTransaction;
        uint256 maxTotalMutualizedAmount;
        uint256 premium;
        uint128 startTimestamp;
        uint128 endTimestamp;
        bool refundOnCancel;
    }
    */

  constructor(
    sellerAddress,
    token,
    maxMutualizedAmountPerTransaction,
    maxTotalMutualizedAmount,
    premium,
    startTimestamp,
    endTimestamp,
    refundOnCancel
  ) {
    this.sellerAddress = sellerAddress;
    this.token = token;
    this.maxMutualizedAmountPerTransaction = maxMutualizedAmountPerTransaction;
    this.maxTotalMutualizedAmount = maxTotalMutualizedAmount;
    this.premium = premium;
    this.startTimestamp = startTimestamp;
    this.endTimestamp = endTimestamp;
    this.refundOnCancel = refundOnCancel;
  }

  /**
   * Get a new Agreement instance from a pojo representation
   * @param o
   * @returns {Agreement}
   */
  static fromObject(o) {
    const {
      sellerAddress,
      token,
      maxMutualizedAmountPerTransaction,
      maxTotalMutualizedAmount,
      premium,
      startTimestamp,
      endTimestamp,
      refundOnCancel,
    } = o;

    return new Agreement(
      sellerAddress,
      token,
      maxMutualizedAmountPerTransaction,
      maxTotalMutualizedAmount,
      premium,
      startTimestamp,
      endTimestamp,
      refundOnCancel
    );
  }

  /**
   * Get a new Agreement instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    let sellerAddress,
      token,
      maxMutualizedAmountPerTransaction,
      maxTotalMutualizedAmount,
      premium,
      startTimestamp,
      endTimestamp,
      refundOnCancel;

    // destructure struct
    [
      sellerAddress,
      token,
      maxMutualizedAmountPerTransaction,
      maxTotalMutualizedAmount,
      premium,
      startTimestamp,
      endTimestamp,
      refundOnCancel,
    ] = struct;

    return Agreement.fromObject({
      sellerAddress,
      token,
      maxMutualizedAmountPerTransaction: maxMutualizedAmountPerTransaction.toString(),
      maxTotalMutualizedAmount: maxTotalMutualizedAmount.toString(),
      premium: premium.toString(),
      startTimestamp: startTimestamp.toString(),
      endTimestamp: endTimestamp.toString(),
      refundOnCancel,
    });
  }

  /**
   * Get a database representation of this Agreement instance
   * @returns {object}
   */
  toObject() {
    return JSON.parse(this.toString());
  }

  /**
   * Get a string representation of this Agreement instance
   * @returns {string}
   */
  toString() {
    return JSON.stringify(this);
  }

  /**
   * Get a struct representation of this Agreement instance
   * @returns {string}
   */
  toStruct() {
    return [
      this.sellerAddress,
      this.token,
      this.maxMutualizedAmountPerTransaction,
      this.maxTotalMutualizedAmount,
      this.premium,
      this.startTimestamp,
      this.endTimestamp,
      this.refundOnCancel,
    ];
  }

  /**
   * Clone this Agreement
   * @returns {Agreement}
   */
  clone() {
    return Agreement.fromObject(this.toObject());
  }

  /**
   * Is this Agreement instance's sellerAddress field valid?
   * Must be a eip55 compliant Ethereum address
   * @returns {boolean}
   */
  sellerAddressIsValid() {
    return addressIsValid(this.sellerAddress);
  }

  /**
   * Is this Agreement instance's token field valid?
   * Must be a eip55 compliant Ethereum address
   * @returns {boolean}
   */
  tokenIsValid() {
    return addressIsValid(this.token);
  }

  /**
   * Is this Agreement instance's maxMutualizedAmountPerTransaction field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  maxMutualizedAmountPerTransactionIsValid() {
    return bigNumberIsValid(this.maxMutualizedAmountPerTransaction);
  }

  /**
   * Is this Agreement instance's maxTotalMutualizedAmount field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  maxTotalMutualizedAmountIsValid() {
    return bigNumberIsValid(this.maxTotalMutualizedAmount);
  }

  /**
   * Is this Agreement instance's premium field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  premiumIsValid() {
    return bigNumberIsValid(this.premium);
  }

  /**
   * Is this Agreement instance's startTimestamp field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  startTimestampIsValid() {
    return bigNumberIsValid(this.startTimestamp);
  }

  /**
   * Is this Agreement instance's endTimestamp field valid?
   * Must be a string representation of a big number
   *
   * @returns {boolean}
   */
  endTimestampIsValid() {
    return bigNumberIsValid(this.endTimestamp);
  }

  /**
   * Is this Agreement instance's refundOnCancel field valid?
   * Always present, must be a boolean
   *
   * @returns {boolean}
   */
  refundOnCancelIsValid() {
    return booleanIsValid(this.refundOnCancel);
  }

  /**
   * Is this Agreement instance valid?
   * @returns {boolean}
   */
  isValid() {
    return (
      this.sellerAddressIsValid() &&
      this.tokenIsValid() &&
      this.maxMutualizedAmountPerTransactionIsValid() &&
      this.maxTotalMutualizedAmountIsValid() &&
      this.premiumIsValid() &&
      this.startTimestampIsValid() &&
      this.endTimestampIsValid() &&
      this.refundOnCancelIsValid()
    );
  }
}

// Export
module.exports = Agreement;
