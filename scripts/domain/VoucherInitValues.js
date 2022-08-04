const ethers = require("ethers");

/**
 * Boson Protocol Domain Entity: VoucherInitValues
 *
 * See: {BosonTypes.VoucherInitValues}
 */
class VoucherInitValues {
  /*
      struct VoucherInitValues {
          string contractURI;
          uint96 royaltyPercentage;
      }
  */

  constructor(contractURI, royaltyPercentage) {
    this.contractURI = contractURI;
    this.royaltyPercentage = royaltyPercentage;
  }

  /**
   * Get a new VoucherInitValues instance from a pojo representation
   * @param o
   * @returns {VoucherInitValues}
   */
  static fromObject(o) {
    const { contractURI, royaltyPercentage } = o;
    return new VoucherInitValues(contractURI, royaltyPercentage);
  }

  /**
   * Get a new VoucherInitValues instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    let contractURI, royaltyPercentage;

    // destructure struct
    [contractURI, royaltyPercentage] = struct;

    return VoucherInitValues.fromObject({
      contractURI,
      royaltyPercentage: royaltyPercentage.toString(),
    });
  }

  /**
   * Get a database representation of this VoucherInitValues instance
   * @returns {object}
   */
  toObject() {
    return JSON.parse(this.toString());
  }

  /**
   * Get a string representation of this VoucherInitValues instance
   * @returns {string}
   */
  toString() {
    return JSON.stringify(this);
  }

  /**
   * Get a struct representation of this VoucherInitValues instance
   * @returns {string}
   */
  toStruct() {
    return [this.contractURI, this.royaltyPercentage];
  }

  /**
   * Clone this VoucherInitValues
   * @returns {VoucherInitValues}
   */
  clone() {
    return VoucherInitValues.fromObject(this.toObject());
  }

  /**
   * Is this VoucherInitValues instance's contractURI field valid?
   * Always present, must be a string
   * @returns {boolean}
   */
  contractURIIsValid() {
    let valid = false;
    let { contractURI } = this;
    try {
      valid = typeof contractURI === "string";
    } catch (e) {}
    return valid;
  }

  /**
   * Is this VoucherInitValues instance's royaltyPercentage valid?
   * Must be a string representation of a big number less than or equal to 10000, i.e. <= 100%
   * @returns {boolean}
   */
  royaltyPercentageIsValid() {
    let valid = false;
    let { royaltyPercentage } = this;
    try {
      valid =
        typeof royaltyPercentage === "string" &&
        typeof ethers.BigNumber.from(royaltyPercentage) === "object" &&
        ethers.BigNumber.from(royaltyPercentage).lte(ethers.BigNumber.from("10000"));
    } catch (e) {}
    return valid;
  }

  /**
   * Is this VoucherInitValues instance valid?
   * @returns {boolean}
   */
  isValid() {
    return this.contractURIIsValid() && this.royaltyPercentageIsValid();
  }
}

// Export
module.exports = VoucherInitValues;
