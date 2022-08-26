const ethers = require("ethers");
const {
  bigNumberIsValid,
  booleanIsValid,
  addressIsValid,
  bigNumberArrayIsValid
} = require("../util/validations.js");

/**
 * Boson Protocol Domain Entity: Bundle
 *
 * See: {BosonTypes.Bundle}
 */
class Bundle {
  /*
        struct Bundle {
            uint256 id;
            uint256 sellerId;
            uint256[] offerIds;
            uint256[] twinIds;
        }
    */

  constructor(id, sellerId, offerIds, twinIds) {
    this.id = id;
    this.sellerId = sellerId;
    this.offerIds = offerIds;
    this.twinIds = twinIds;
  }

  /**
   * Get a new Bundle instance from a pojo representation
   * @param o
   * @returns {Bundle}
   */
  static fromObject(o) {
    const { id, sellerId, offerIds, twinIds } = o;
    return new Bundle(id, sellerId, offerIds, twinIds);
  }

  /**
   * Get a new Bundle instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    let id, sellerId, offerIds, twinIds;

    // destructure struct
    [id, sellerId, offerIds, twinIds] = struct;

    return Bundle.fromObject({
      id: id.toString(),
      sellerId: sellerId.toString(),
      offerIds: offerIds.map((offerId) => offerId.toString()),
      twinIds: twinIds.map((twinId) => twinId.toString()),
    });
  }

  /**
   * Get a database representation of this Bundle instance
   * @returns {object}
   */
  toObject() {
    return JSON.parse(this.toString());
  }

  /**
   * Get a string representation of this Bundle instance
   * @returns {string}
   */
  toString() {
    return JSON.stringify(this);
  }

  /**
   * Get a struct representation of this Bundle instance
   * @returns {string}
   */
  toStruct() {
    return [this.id, this.sellerId, this.offerIds, this.twinIds];
  }

  /**
   * Clone this Bundle
   * @returns {Bundle}
   */
  clone() {
    return Bundle.fromObject(this.toObject());
  }

  /**
   * Is this Bundle instance's id field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  idIsValid() {
    return bigNumberIsValid(this.id);
  }

  /**
   * Is this Bundle instance's sellerId field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  sellerIdIsValid() {
    return bigNumberIsValid(this.sellerId);
  }

  /**
   * Is this Bundle instance's offerIds field valid?
   * Must be an array of numbers
   * @returns {boolean}
   */
  offerIdsIsValid() {
    return bigNumberArrayIsValid(this.offerIds);
  }

  /**
   * Is this Bundle instance's twinIds field valid?
   * Must be an array of numbers
   * @returns {boolean}
   */
  twinIdsIsValid() {
    return bigNumberArrayIsValid(this.twinIds);
  }

  /**
   * Is this Bundle instance valid?
   * @returns {boolean}
   */
  isValid() {
    return this.idIsValid() && this.sellerIdIsValid() && this.offerIdsIsValid() && this.twinIdsIsValid();
  }
}

module.exports = Bundle;
