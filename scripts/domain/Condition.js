const EvaluationMethod = require("./EvaluationMethod");
const TokenType = require("./TokenType");
const GatingType = require("./GatingType");
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
            GatingType gating;
            uint256 minTokenId;
            uint256 threshold;
            uint256 maxCommits;
            uint256 maxTokenId;
        }
    */
  constructor(method, tokenType, tokenAddress, gating, minTokenId, threshold, maxCommits, maxTokenId) {
    this.method = method;
    this.tokenType = tokenType;
    this.tokenAddress = tokenAddress;
    this.gating = gating;
    this.minTokenId = minTokenId;
    this.threshold = threshold;
    this.maxCommits = maxCommits;
    this.maxTokenId = maxTokenId;
  }

  /**
   * Get a new Condition instance from a pojo representation
   * @param o
   * @returns {Condition}
   */
  static fromObject(o) {
    const { method, tokenType, tokenAddress, gating, minTokenId, threshold, maxCommits, maxTokenId } = o;
    return new Condition(method, tokenType, tokenAddress, gating, minTokenId, threshold, maxCommits, maxTokenId);
  }

  /**
   * Get a new Condition instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    let method, tokenType, tokenAddress, gating, minTokenId, threshold, maxCommits, maxTokenId;

    // destructure struct
    [method, tokenType, tokenAddress, gating, minTokenId, threshold, maxCommits, maxTokenId] = struct;

    return Condition.fromObject({
      method: parseInt(method),
      tokenType: Number(tokenType),
      tokenAddress,
      gating: Number(gating),
      minTokenId: minTokenId.toString(),
      threshold: threshold.toString(),
      maxCommits: maxCommits.toString(),
      maxTokenId: maxTokenId.toString(),
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
    tmp.minTokenId = tmp.minTokenId.toString();
    tmp.threshold = tmp.threshold.toString();
    tmp.maxCommits = tmp.maxCommits.toString();
    tmp.maxTokenId = tmp.maxTokenId.toString();
    return JSON.stringify(tmp);
  }

  /**
   * Get a struct representation of this Condition instance
   * @returns {string}
   */
  toStruct() {
    return [
      this.method,
      this.tokenType,
      this.tokenAddress,
      this.gating,
      this.minTokenId,
      this.threshold,
      this.maxCommits,
      this.maxTokenId,
    ];
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
   * Is this Condition instance's gating field valid?
   * Must be a number belonging to the GatingType enum
   * @returns {boolean}
   */
  gatingIsValid() {
    return enumIsValid(this.gating, GatingType.Types);
  }

  /**
   * Is this Condition instance's minTokenId field valid?
   * @returns {boolean}
   */
  minTokenIdIsValid() {
    return bigNumberIsValid(this.minTokenId);
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
   * Is this Condition instance's maxTokenId field valid?
   * @returns {boolean}
   */
  maxTokenIdIsValid() {
    return bigNumberIsValid(this.maxTokenId);
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
      this.gatingIsValid() &&
      this.minTokenIdIsValid() &&
      this.thresholdIsValid() &&
      this.maxCommitsIsValid() &&
      this.maxTokenIdIsValid()
    );
  }
}

// Export
module.exports = Condition;
