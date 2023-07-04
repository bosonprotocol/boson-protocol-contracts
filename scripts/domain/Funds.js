const { addressIsValid, stringIsValid, bigNumberIsValid } = require("../util/validations.js");

/**
 * Boson Protocol Domain Entity: Funds
 *
 * See: {BosonTypes.Funds}
 */
class Funds {
  /*
      struct Funds {
          address tokenAddress;
          string tokenName;
          uint256 availableAmount;
      }
  */

  constructor(tokenAddress, tokenName, availableAmount) {
    this.tokenAddress = tokenAddress;
    this.tokenName = tokenName;
    this.availableAmount = availableAmount.toString();
  }

  /**
   * Get a new Funds instance from a pojo representation
   * @param o
   * @returns {Funds}
   */
  static fromObject(o) {
    const { tokenAddress, tokenName, availableAmount } = o;
    return new Funds(tokenAddress, tokenName, availableAmount);
  }

  /**
   * Get a new Funds instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    let tokenAddress, tokenName, availableAmount;

    // destructure struct
    [tokenAddress, tokenName, availableAmount] = struct;

    return Funds.fromObject({
      tokenAddress,
      tokenName,
      availableAmount: availableAmount.toString(),
    });
  }

  /**
   * Get a database representation of this Funds instance
   * @returns {object}
   */
  toObject() {
    return JSON.parse(this.toString());
  }

  /**
   * Get a string representation of this Funds instance
   * @returns {string}
   */
  toString() {
    return JSON.stringify(this);
  }

  /**
   * Get a struct representation of this Funds instance
   * @returns {string}
   */
  toStruct() {
    return [this.tokenAddress, this.tokenName, this.availableAmount];
  }

  /**
   * Clone this Funds
   * @returns {Funds}
   */
  clone() {
    return Funds.fromObject(this.toObject());
  }

  /**
   * Is this Funds instance's tokenAddress field valid?
   * Must be a eip55 compliant Ethereum address
   * @returns {boolean}
   */
  tokenAddressIsValid() {
    return addressIsValid(this.tokenAddress);
  }

  /**
   * Is this Funds instance's tokenName field valid?
   * Always present, must be a string
   * @returns {boolean}
   */
  tokenNameIsValid() {
    return stringIsValid(this.tokenName);
  }

  /**
   * Is this Funds instance's availableAmount valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  availableAmountIsValid() {
    return bigNumberIsValid(this.availableAmount);
  }

  /**
   * Is this Funds instance valid?
   * @returns {boolean}
   */
  isValid() {
    return this.tokenAddressIsValid() && this.tokenNameIsValid() && this.availableAmountIsValid();
  }
}

/**
 * Boson Protocol Domain Entity: Collection of Funds
 *
 * See: {BosonTypes.Funds}
 */
class FundsList {
  constructor(funds) {
    this.funds = funds;
  }

  /**
   * Get a new FundsList instance from a pojo representation
   * @param o
   * @returns {FundsList}
   */
  static fromObject(o) {
    const { funds } = o;
    return new FundsList(funds.map((f) => Funds.fromObject(f)));
  }

  /**
   * Get a new FundsList instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    return FundsList.fromObject({
      funds: struct.map((funds) => Funds.fromStruct(funds)),
    });
  }

  /**
   * Get a database representation of this FundsList instance
   * @returns {object}
   */
  toObject() {
    return JSON.parse(this.toString());
  }

  /**
   * Get a string representation of this FundsList instance
   * @returns {string}
   */
  toString() {
    return JSON.stringify(this);
  }

  /**
   * Get a struct representation of this FundsList instance
   * @returns {string}
   */
  toStruct() {
    return this.funds.map((f) => f.toStruct());
  }

  /**
   * Clone this FundsList
   * @returns {FundsList}
   */
  clone() {
    return FundsList.fromObject(this.toObject());
  }

  /**
   * Is this FundsList instance's funds field valid?
   * Must be a list of Funds instances
   * @returns {boolean}
   */
  fundsIsValid() {
    let valid = false;
    let { funds } = this;
    try {
      valid =
        Array.isArray(funds) &&
        funds.reduce((previousFunds, currentFunds) => previousFunds && currentFunds.isValid(), true);
    } catch (e) {}
    return valid;
  }

  /**
   * Is this FundsList instance valid?
   * @returns {boolean}
   */
  isValid() {
    return this.fundsIsValid();
  }
}

// Export
exports.Funds = Funds;
exports.FundsList = FundsList;
