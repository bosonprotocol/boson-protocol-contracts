const ethers = require("ethers");
const eip55 = require("eip55");
const EvaluationMethod = require("./EvaluationMethod");
const TokenType = require("./TokenType");

/**
 * Boson Protocol Domain Entity: Condition
 *
 * See: {BosonTypes.Condition}
 */
class Condition {
  /*
        struct Condition {
            EvaluationMethod method;
            TokenType tokenType;
            address tokenAddress;
            uint256 tokenId;
            uint256 threshold;
            uint256 maxCommits;
        }
    */

  constructor(method, tokenType, tokenAddress, tokenId, threshold, maxCommits) {
    this.method = method;
    this.tokenType = tokenType;
    this.tokenAddress = tokenAddress;
    this.tokenId = tokenId;
    this.threshold = threshold;
    this.maxCommits = maxCommits;
  }

  /**
   * Get a new Condition instance from a pojo representation
   * @param o
   * @returns {Condition}
   */
  static fromObject(o) {
    const { method, tokenType, tokenAddress, tokenId, threshold, maxCommits } = o;
    return new Condition(method, tokenType, tokenAddress, tokenId, threshold, maxCommits);
  }

  /**
   * Get a new Condition instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    let method, tokenType, tokenAddress, tokenId, threshold, maxCommits;

    // destructure struct
    [method, tokenType, tokenAddress, tokenId, threshold, maxCommits] = struct;

    return Condition.fromObject({
      method: parseInt(method),
      tokenType,
      tokenAddress,
      tokenId,
      threshold,
      maxCommits,
    });
  }

  /**
   * Get a database representation of this Condition instance
   * @returns {object}
   */
  toObject() {
    return JSON.parse(this.toString());
  }

  /**
   * Get a string representation of this Condition instance
   * @returns {string}
   */
  toString() {
    let tmp = { ...this };
    tmp.tokenId = tmp.tokenId.toString();
    tmp.threshold = tmp.threshold.toString();
    tmp.maxCommits = tmp.maxCommits.toString();
    return JSON.stringify(tmp);
  }

  /**
   * Get a struct representation of this Condition instance
   * @returns {string}
   */
  toStruct() {
    return [this.method, this.tokenType, this.tokenAddress, this.tokenId, this.threshold, this.maxCommits];
  }

  /**
   * Clone this Condition
   * @returns {Condition}
   */
  clone() {
    return Condition.fromObject(this.toObject());
  }

  /**
   * Is this Condition instance's method field valid?
   * Must be a number representation of a big number
   * @returns {boolean}
   */
  methodIsValid() {
    let valid = false;
    let { method } = this;
    try {
      valid = EvaluationMethod.Types.includes(method);
    } catch (e) {}
    return valid;
  }

  /**
   * Is this Condition instance's tokenType field valid?
   * Must be a valid
   * @returns {boolean}
   */
  tokenTypeIsValid() {
    let valid = false;
    let { tokenType } = this;
    try {
      valid = TokenType.Types.includes(tokenType);
    } catch (e) {}
    return valid;
  }

  /**
   * Is this Condition instance's tokenAddress field valid?
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
   * Is this Condition instance's tokenId field valid?
   * @returns {boolean}
   */
  tokenIdIsValid() {
    let valid = false;
    let { tokenId } = this;
    try {
      valid = typeof tokenId === "string" && typeof ethers.BigNumber.from(tokenId) === "object";
    } catch (e) {}
    return valid;
  }

  /**
   * Is this Condition instance's threshold field valid?
   * @returns {boolean}
   */
  thresholdIsValid() {
    let valid = false;
    let { threshold } = this;
    try {
      valid = typeof threshold === "string" && typeof ethers.BigNumber.from(threshold) === "object";
    } catch (e) {}
    return valid;
  }

  /**
   * Is this Condition instance's maxCommits field valid?
   * @returns {boolean}
   */
  maxCommitsIsValid() {
    let valid = false;
    let { maxCommits } = this;
    try {
      valid = typeof maxCommits === "string" && typeof ethers.BigNumber.from(maxCommits) === "object";
    } catch (e) {}
    return valid;
  }

  /**
   * Is this Condition instance valid?
   * @returns {boolean}
   */
  isValid() {
    return (
      this.methodIsValid() &&
      this.tokenTypeIsValid() &&
      this.tokenAddressIsValid() &&
      this.tokenIdIsValid() &&
      this.thresholdIsValid() &&
      this.maxCommitsIsValid()
    );
  }
}

// Export
module.exports = Condition;
