const EvaluationMethod = require("./EvaluationMethod");
const TokenType = require("./TokenType");
const { bigNumberIsValid, addressIsValid, enumIsValid } = require("../util/validations.js");

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
      tokenId: tokenId.toString(),
      threshold: threshold.toString(),
      maxCommits: maxCommits.toString(),
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
   * Must be a number belonging to the EvaluationMethod enum
   * @returns {boolean}
   */
  methodIsValid() {
    return enumIsValid(this.method, EvaluationMethod.Types);
  }

  /**
   * Is this Condition instance's tokenType field valid?
   * Must be a number belonging to the TokenType enum
   * @returns {boolean}
   */
  tokenTypeIsValid() {
    return enumIsValid(this.tokenType, TokenType.Types);
  }

  /**
   * Is this Condition instance's tokenAddress field valid?
   * Must be a eip55 compliant Ethereum address
   * @returns {boolean}
   */
  tokenAddressIsValid() {
    return addressIsValid(this.tokenAddress);
  }

  /**
   * Is this Condition instance's tokenId field valid?
   * @returns {boolean}
   */
  tokenIdIsValid() {
    return bigNumberIsValid(this.tokenId);
  }

  /**
   * Is this Condition instance's threshold field valid?
   * @returns {boolean}
   */
  thresholdIsValid() {
    return bigNumberIsValid(this.threshold);
  }

  /**
   * Is this Condition instance's maxCommits field valid?
   * @returns {boolean}
   */
  maxCommitsIsValid() {
    return bigNumberIsValid(this.maxCommits);
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
