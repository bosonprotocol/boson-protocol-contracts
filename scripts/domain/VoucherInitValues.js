const { bigNumberIsValid, stringIsValid, bytes32IsValid } = require("../util/validations.js");

/**
 * Boson Protocol Domain Entity: VoucherInitValues
 *
 * See: {BosonTypes.VoucherInitValues}
 */
class VoucherInitValues {
  /*
      struct VoucherInitValues {
          string contractURI;
          uint256 royaltyPercentage;
          bytes32 collectionSalt
      }
  */

  constructor(contractURI, royaltyPercentage, collectionSalt) {
    this.contractURI = contractURI;
    this.royaltyPercentage = royaltyPercentage;
    this.collectionSalt = collectionSalt;
  }

  /**
   * Get a new VoucherInitValues instance from a pojo representation
   * @param o
   * @returns {VoucherInitValues}
   */
  static fromObject(o) {
    const { contractURI, royaltyPercentage, collectionSalt } = o;
    return new VoucherInitValues(contractURI, royaltyPercentage, collectionSalt);
  }

  /**
   * Get a new VoucherInitValues instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    let contractURI, royaltyPercentage, collectionSalt;

    // destructure struct
    [contractURI, royaltyPercentage, collectionSalt] = struct;

    return VoucherInitValues.fromObject({
      contractURI,
      royaltyPercentage: royaltyPercentage.toString(),
      collectionSalt,
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
    return [this.contractURI, this.royaltyPercentage, this.collectionSalt];
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
    return stringIsValid(this.contractURI);
  }

  /**
   * Is this VoucherInitValues instance's royaltyPercentage valid?
   * Must be a string representation of a big number less than or equal to 10000, i.e. <= 100%
   * @returns {boolean}
   */
  royaltyPercentageIsValid() {
    return bigNumberIsValid(this.royaltyPercentage, { lte: 10000 });
  }

  /**
   * Is this VoucherInitValues instance's collectionSalt valid?
   * Must be a bytes32 value
   * @returns {boolean}
   */
  collectionSaltIsValid() {
    return bytes32IsValid(this.collectionSalt);
  }

  /**
   * Is this VoucherInitValues instance valid?
   * @returns {boolean}
   */
  isValid() {
    return this.contractURIIsValid() && this.royaltyPercentageIsValid() && this.collectionSaltIsValid();
  }
}

// Export
module.exports = VoucherInitValues;
