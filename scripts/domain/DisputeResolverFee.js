const ethers = require("ethers");
const eip55 = require("eip55");
const { bigNumberIsValid, stringIsValid, addressIsValid } = require("../util/validations.js");

/**
 * Boson Protocol Domain Entity: DisputeResolverFee
 *
 * See: {BosonTypes.DisputeResolverFee}
 */
class DisputeResolverFee {
  /*
      struct DisputeResolverFee {
        address tokenAddress;
        string tokenName;
        uint256 feeAmount;
    }
  */

  constructor(tokenAddress, tokenName, feeAmount) {
    this.tokenAddress = tokenAddress;
    this.tokenName = tokenName;
    this.feeAmount = feeAmount;
  }

  /**
   * Get a new DisputeResolverFee instance from a pojo representation
   * @param o
   * @returns {DisputeResolverFee}
   */
  static fromObject(o) {
    const { tokenAddress, tokenName, feeAmount } = o;
    return new DisputeResolverFee(tokenAddress, tokenName, feeAmount);
  }

  /**
   * Get a new DisputeResolverFee instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    let tokenAddress, tokenName, feeAmount;

    // destructure struct
    [tokenAddress, tokenName, feeAmount] = struct;

    return DisputeResolverFee.fromObject({
      tokenAddress,
      tokenName,
      feeAmount: feeAmount.toString(),
    });
  }

  /**
   * Get a database representation of this DisputeResolverFee instance
   * @returns {object}
   */
  toObject() {
    return JSON.parse(this.toString());
  }

  /**
   * Get a string representation of this DisputeResolverFee instance
   * @returns {string}
   */
  toString() {
    return JSON.stringify(this);
  }

  /**
   * Get a struct representation of this DisputeResolverFee instance
   * @returns {string}
   */
  toStruct() {
    return [this.tokenAddress, this.tokenName, this.feeAmount];
  }

  /**
   * Clone this DisputeResolverFee
   * @returns {DisputeResolverFee}
   */
  clone() {
    return DisputeResolverFee.fromObject(this.toObject());
  }

  /**
   * Is this DisputeResolverFee instance's tokenAddress field valid?
   * Must be a eip55 compliant Ethereum address
   * @returns {boolean}
   */
  tokenAddressIsValid() {
    return addressIsValid(this.tokenAddress);
  }

  /**
   * Is this DisputeResolverFee instance's tokenName field valid?
   * Always present, must be a string
   * @returns {boolean}
   */
  tokenNameIsValid() {
    return stringIsValid(this.tokenName);
  }

  /**
   * Is this DisputeResolverFee instance's feeAmount valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  feeAmountIsValid() {
    return bigNumberIsValid(this.feeAmount);
  }

  /**
   * Is this DisputeResolverFee instance valid?
   * @returns {boolean}
   */
  isValid() {
    return this.tokenAddressIsValid() && this.tokenNameIsValid() && this.feeAmountIsValid();
  }
}

/**
 * Boson Protocol Domain Entity: Collection of DisputeResolverFee
 *
 * See: {BosonTypes.DisputeResolverFee}
 */
class DisputeResolverFeeList {
  constructor(disputeResolverFees) {
    this.disputeResolverFees = disputeResolverFees;
  }

  /**
   * Get a new DisputeResolverFeeList instance from a pojo representation
   * @param o
   * @returns {DisputeResolverFeeList}
   */
  static fromObject(o) {
    const { disputeResolverFees } = o;
    return new DisputeResolverFeeList(disputeResolverFees.map((d) => DisputeResolverFee.fromObject(d)));
  }

  /**
   * Get a new DisputeResolverFeeList instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    return DisputeResolverFeeList.fromObject({
      disputeResolverFees: struct.map((disputeResolverFees) => DisputeResolverFee.fromStruct(disputeResolverFees)),
    });
  }

  /**
   * Get a database representation of this DisputeResolverFeeList instance
   * @returns {object}
   */
  toObject() {
    return JSON.parse(this.toString());
  }

  /**
   * Get a string representation of this DisputeResolverFeeList instance
   * @returns {string}
   */
  toString() {
    return JSON.stringify(this);
  }

  /**
   * Get a struct representation of this DisputeResolverFeeList instance
   * @returns {string}
   */
  toStruct() {
    return this.disputeResolverFees.map((d) => d.toStruct());
  }

  /**
   * Clone this DisputeResolverFeeList
   * @returns {DisputeResolverFeeList}
   */
  clone() {
    return DisputeResolverFeeList.fromObject(this.toObject());
  }

  /**
   * Is this DisputeResolverFeeList instance's disputeResolverFee field valid?
   * Must be a list of DisputeResolverFee instances
   * @returns {boolean}
   */
  disputeResolverFeeIsValid() {
    let valid = false;
    let { disputeResolverFees } = this;
    try {
      valid =
        Array.isArray(disputeResolverFees) &&
        disputeResolverFees.reduce(
          (previousDisputeResolverFees, currentDisputeResolverFees) =>
            previousDisputeResolverFees && currentDisputeResolverFees.isValid(),
          true
        );
    } catch (e) { }
    return valid;
  }

  /**
   * Is this DisputeResolverFeeList instance valid?
   * @returns {boolean}
   */
  isValid() {
    return this.disputeResolverFeeIsValid();
  }
}

// Export
exports.DisputeResolverFee = DisputeResolverFee;
exports.DisputeResolverFeeList = DisputeResolverFeeList;
