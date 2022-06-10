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
    this.tokenList = tokenList;
    this.tokenAmounts = tokenAmounts;
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
      tokenList: tokenList,
      tokenAmounts: tokenAmounts.map((amount) => amount.toString()),
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
   * Must be an array of numbers
   * @returns {boolean}
   */
  tokenListIsValid() {
    let valid = false;
    let { tokenList } = this;
    try {
      const tokenListIsArray = Array.isArray(tokenList);
      if (tokenListIsArray) {
        tokenList.forEach((tokenAddress) => {
          valid = eip55.verify(eip55.encode(tokenAddress));
        });
      }
    } catch (e) {}
    return valid;
  }

  /**
   * Is this MetaTxFundDetails instance's tokenAmounts field valid?
   * Must be an array of numbers
   * @returns {boolean}
   */
  tokenAmountsIsValid() {
    let valid = false;
    let { tokenAmounts } = this;
    try {
      const tokenAmountsIsArray = Array.isArray(tokenAmounts);
      if (tokenAmountsIsArray) {
        tokenAmounts.forEach((amount) => {
          valid = typeof amount === "string" && typeof ethers.BigNumber.from(amount) === "object";
        });
      }
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
