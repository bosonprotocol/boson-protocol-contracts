const ethers = require("ethers");
const eip55 = require("eip55");

/**
 * Boson Protocol Domain Entity: MetaTxFundDetails
 *
 * See: {BosonTypes.MetaTxFundDetails}
 */
class MetaTxFundDetails {
  /*
        struct MetaTxFundDetails {
            uint256 entityId;
            address[] tokenList;
            uint256[] tokenAmounts;
        }
  */

  constructor(entityId, tokenList, tokenAmounts) {
    this.entityId = entityId;
    this.tokenList = tokenList || [];
    this.tokenAmounts = tokenAmounts || [];
  }

  /**
   * Get a new MetaTxFundDetails instance from a pojo representation
   * @param o
   * @returns {MetaTxFundDetails}
   */
  static fromObject(o) {
    const { entityId, tokenList, tokenAmounts } = o;

    return new MetaTxFundDetails(entityId, tokenList, tokenAmounts);
  }

  /**
   * Get a new MetaTxFundDetails instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    let entityId, tokenList, tokenAmounts;

    // destructure struct
    [entityId, tokenList, tokenAmounts] = struct;

    return MetaTxFundDetails.fromObject({
      entityId: entityId.toString(),
      tokenList: tokenList ? tokenList : [],
      tokenAmounts: tokenAmounts ? tokenAmounts.map((amount) => amount.toString()) : [],
    });
  }

  /**
   * Get a database representation of this MetaTxFundDetails instance
   * @returns {object}
   */
  toObject() {
    return JSON.parse(this.toString());
  }

  /**
   * Get a string representation of this MetaTxFundDetails instance
   * @returns {string}
   */
  toString() {
    return JSON.stringify(this);
  }

  /**
   * Get a struct representation of this MetaTxFundDetails instance
   * @returns {string}
   */
  toStruct() {
    return [this.entityId, this.tokenList, this.tokenAmounts];
  }

  /**
   * Clone this MetaTxFundDetails
   * @returns {MetaTxFundDetails}
   */
  clone() {
    return MetaTxFundDetails.fromObject(this.toObject());
  }

  /**
   * Is this MetaTxFundDetails instance's entityId field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  entityIdIsValid() {
    let valid = false;
    let { entityId } = this;
    try {
      valid = typeof entityId === "string" && typeof ethers.BigNumber.from(entityId) === "object";
    } catch (e) {}
    return valid;
  }

  /**
   * Is this MetaTxFundDetails instance's tokenList field valid?
   * Must be an array, and if members are present, they must be a eip55 compliant Ethereum address.
   * @returns {boolean}
   */
  tokenListIsValid() {
    let valid = false;
    let { tokenList } = this;
    let validateMembers = (ok, tokenAddress) => ok && eip55.verify(eip55.encode(tokenAddress));
    try {
      valid = Array.isArray(tokenList) && (tokenList.length === 0 || tokenList.reduce(validateMembers, true));
    } catch (e) {}
    return valid;
  }

  /**
   * Is this MetaTxFundDetails instance's tokenAmounts field valid?
   * Must be an array, and if members are present, they must be string representations of BigNumbers
   * @returns {boolean}
   */
  tokenAmountsIsValid() {
    let valid = false;
    let { tokenAmounts } = this;
    let validateMembers = (ok, tokenAmount) =>
      ok && typeof tokenAmount === "string" && typeof ethers.BigNumber.from(tokenAmount) === "object";
    try {
      valid = Array.isArray(tokenAmounts) && (tokenAmounts.length === 0 || tokenAmounts.reduce(validateMembers, true));
    } catch (e) {}
    return valid;
  }

  /**
   * Is this MetaTxFundDetails instance valid?
   * @returns {boolean}
   */
  isValid() {
    return this.entityIdIsValid() && this.tokenListIsValid() && this.tokenAmountsIsValid();
  }
}

// Export
module.exports = MetaTxFundDetails;
