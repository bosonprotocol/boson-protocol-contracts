const { FacetCutAction } = require("../util/diamond-utils.js");
const { bigNumberIsValid, booleanIsValid, addressIsValid, enumIsValid } = require("../util/validations.js");

/**
 * Boson Protocol Domain Entity: FacetCut
 *
 * See: {BosonTypes.FacetCut}
 */
class FacetCut {
  /*
        struct FacetCut {
        address facetAddress;
        FacetCutAction action;
        bytes4 functionSelectors;
    }
    */

  constructor(facetAddress, action, functionSelectors) {
    this.facetAddress = facetAddress;
    this.action = action;
    this.functionSelectors = functionSelectors;
  }

  /**
   * Get a new FacetCut instance from a pojo representation
   * @param o
   * @returns {FacetCut}
   */
  static fromObject(o) {
    const { facetAddress, action, functionSelectors } = o;
    return new FacetCut(facetAddress, action, functionSelectors);
  }

  /**
   * Get a new FacetCut instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    let facetAddress, action, functionSelectors;

    // destructure struct
    [facetAddress, action, functionSelectors] = struct;

    return FacetCut.fromObject({
      facetAddress: facetAddress.toString(),
      action: action.toString(),
      functionSelectors,
    });
  }

  /**
   * Get a database representation of this FacetCut instance
   * @returns {object}
   */
  toObject() {
    return JSON.parse(this.toString());
  }

  /**
   * Get a string representation of this FacetCut instance
   * @returns {string}
   */
  toString() {
    return JSON.stringify(this);
  }

  /**
   * Get a struct representation of this FacetCut instance
   * @returns {string}
   */
  toStruct() {
    return [this.facetAddress, this.action, this.functionSelectors];
  }

  /**
   * Clone this FacetCut
   * @returns {FacetCut}
   */
  clone() {
    return FacetCut.fromObject(this.toObject());
  }

  /**
   * Is this FacetCut instance's facetAddress field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  facetAddressIsValid() {
    return addressIsValid(this.functionSelectors);
  }

  /**
   * Is this FacetCut instance's action field valid?
   * Must be a number belonging to the FacetCutAction enum
   * @returns {boolean}
   */
  actionIsValid() {
    return enumIsValid(this.action, FacetCutAction.Types);
  }

  /**
   * Is this Facet instance's functionSelectors field valid?
   * Must be an array of strings representing bytes4 values
   * @returns {boolean}
   */
  functionSelectorsIsValid() {
    return bytes4ArrayIsValid(this.functionSelectors);
  }

  /**
   * Is this FacetCut instance valid?
   * @returns {boolean}
   */
  isValid() {
    return this.facetAddressIsValid() && this.actionIsValid() && this.functionSelectors();
  }
}

// Export
module.exports = FacetCut;
