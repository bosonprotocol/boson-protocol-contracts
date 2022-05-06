const ethers = require("ethers");
const eip55 = require("eip55");

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
    this.availableAmount = availableAmount;
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
    let valid = false;
    let { tokenAddress } = this;
    try {
      valid = eip55.verify(eip55.encode(tokenAddress));
    } catch (e) {}
    return valid;
  }

  /**
   * Is this Funds instance's tokenName field valid?
   * Always present, must be a string
   * @returns {boolean}
   */
  tokenNameIsValid() {
    let valid = false;
    let { tokenName } = this;
    try {
      valid = typeof tokenName === "string";
    } catch (e) {}
    return valid;
  }

  /**
   * Is this Funds instance's availableAmount valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  availableAmountIsValid() {
    let valid = false;
    let { availableAmount } = this;
    try {
      valid = typeof availableAmount === "string" && typeof ethers.BigNumber.from(availableAmount) === "object";
    } catch (e) {}
    return valid;
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
