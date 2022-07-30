const ethers = require("ethers");
const eip55 = require("eip55");

/**
 * Boson Protocol Domain Entity: VoucherInitValues
 *
 * See: {BosonTypes.VoucherInitValues}
 */
class VoucherInitValues {
  /*
      struct VoucherInitValues {
          string contractURI;
          address payable royaltyReceiver;
          uint96 feeNumerator;
      }
  */

  constructor(contractURI, royaltyReceiver, feeNumerator) {
    this.contractURI = contractURI;
    this.royaltyReceiver = royaltyReceiver;
    this.feeNumerator = feeNumerator;
  }

  /**
   * Get a new VoucherInitValues instance from a pojo representation
   * @param o
   * @returns {VoucherInitValues}
   */
  static fromObject(o) {
    const { contractURI, royaltyReceiver, feeNumerator } = o;
    return new VoucherInitValues(contractURI, royaltyReceiver, feeNumerator);
  }

  /**
   * Get a new VoucherInitValues instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    let contractURI, royaltyReceiver, feeNumerator;

    // destructure struct
    [contractURI, royaltyReceiver, feeNumerator] = struct;

    return VoucherInitValues.fromObject({
      contractURI,
      royaltyReceiver,
      feeNumerator: feeNumerator.toString(),
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
    return [this.contractURI, this.royaltyReceiver, this.feeNumerator];
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
   * Is this VoucherInitValues instance's royaltyReceiver field valid?
   * Must be a eip55 compliant Ethereum address
   * @returns {boolean}
   */
  royaltyReceiverIsValid() {
    let valid = false;
    let { royaltyReceiver } = this;
    try {
      valid = eip55.verify(eip55.encode(royaltyReceiver));
    } catch (e) {}
    return valid;
  }

  /**
   * Is this VoucherInitValues instance's feeNumerator valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  feeNumeratorIsValid() {
    let valid = false;
    let { feeNumerator } = this;
    try {
      valid = typeof feeNumerator === "string" && typeof ethers.BigNumber.from(feeNumerator) === "object";
    } catch (e) {}
    return valid;
  }

  /**
   * Is this VoucherInitValues instance valid?
   * @returns {boolean}
   */
  isValid() {
    return this.contractURIIsValid() && this.royaltyReceiverIsValid() && this.feeNumeratorIsValid();
  }
}

// Export
module.exports = VoucherInitValues;
