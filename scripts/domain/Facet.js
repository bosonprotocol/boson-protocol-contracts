const ethers = require("ethers");
const eip55 = require("eip55");

/**
 * Diamond Standard Domain Entity: Facet
 *
 * See: {IDiamondLoupe.Facet}
 */
class Facet {
  constructor(facetAddress, functionSelectors) {
    this.facetAddress = facetAddress;
    this.functionSelectors = functionSelectors;
  }

  /**
   * Get a new Facet instance from a database representation
   * @param o
   * @returns {Facet}
   */
  static fromObject(o) {
    const { facetAddress, functionSelectors } = o;
    return new Facet(facetAddress, functionSelectors);
  }

  /**
   * Get a database representation of this Facet instance
   * @returns {object}
   */
  toObject() {
    return JSON.parse(this.toString());
  }

  /**
   * Get a string representation of this Facet instance
   * @returns {string}
   */
  toString() {
    return JSON.stringify(this);
  }

  /**
   * Clone this Facet
   * @returns {Facet}
   */
  clone() {
    return Facet.fromObject(this.toObject());
  }

  /**
   * Is this Facet instance's facetAddress field valid?
   * Must be a eip55 compliant Ethereum address
   * @returns {boolean}
   */
  facetAddressIsValid() {
    let { facetAddress } = this;
    let valid = false;
    try {
      valid = eip55.verify(eip55.encode(facetAddress));
    } catch (e) {}
    return valid;
  }

  /**
   * Is this Facet instance's functionSelectors field valid?
   * Must be an array of strings representing bytes4 values
   * @returns {boolean}
   */
  functionSelectorsIsValid() {
    let { functionSelectors } = this;
    let valid = false;
    try {
      valid =
        Array.isArray(functionSelectors) &&
        functionSelectors.length > 0 &&
        functionSelectors.filter(
          (selector) =>
            ethers.BigNumber.from(selector).gte("0") && ethers.BigNumber.from(selector).lte("4294967295") // max bytes4 value
        ).length === functionSelectors.length;
    } catch (e) {}
    return valid;
  }

  /**
   * Is this Facet instance valid?
   * @returns {boolean}
   */
  isValid() {
    return this.facetAddressIsValid() && this.functionSelectorsIsValid();
  }
}

// Export
module.exports = Facet;
