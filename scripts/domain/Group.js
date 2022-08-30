const { bigNumberIsValid, bigNumberArrayIsValid } = require("../util/validations.js");

/**
 * Boson Protocol Domain Entity: Group
 *
 * See: {BosonTypes.Group}
 */
class Group {
  /*
        struct Group {
            uint256 id;
            uint256 sellerId;
            Offer[] offerIds;
        }
    */

  constructor(id, sellerId, offerIds) {
    this.id = id;
    this.sellerId = sellerId;
    this.offerIds = offerIds;
  }

  /**
   * Get a new Group instance from a pojo representation
   * @param o
   * @returns {Group}
   */
  static fromObject(o) {
    const { id, sellerId, offerIds } = o;
    return new Group(id, sellerId, offerIds);
  }

  /**
   * Get a new Group instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    let id, sellerId, offerIds;

    // destructure struct
    [id, sellerId, offerIds] = struct;

    return Group.fromObject({
      id: id.toString(),
      sellerId: sellerId.toString(),
      offerIds: offerIds.map((offerId) => offerId.toString()),
    });
  }

  /**
   * Get a database representation of this Group instance
   * @returns {object}
   */
  toObject() {
    return JSON.parse(this.toString());
  }

  /**
   * Get a string representation of this Group instance
   * @returns {string}
   */
  toString() {
    return JSON.stringify(this);
  }

  /**
   * Get a struct representation of this Group instance
   * @returns {string}
   */
  toStruct() {
    return [this.id, this.sellerId, this.offerIds];
  }

  /**
   * Clone this Group
   * @returns {Group}
   */
  clone() {
    return Group.fromObject(this.toObject());
  }

  /**
   * Is this Group instance's id field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  idIsValid() {
    return bigNumberIsValid(this.id);
  }

  /**
   * Is this Group instance's sellerId field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  sellerIdIsValid() {
    return bigNumberIsValid(this.sellerId);
  }

  /**
   * Is this Group instance's offerIds field valid?
   * Must be an array of numbers
   * @returns {boolean}
   */
  offerIdsIsValid() {
    return bigNumberArrayIsValid(this.offerIds);
  }

  /**
   * Is this Group instance valid?
   * @returns {boolean}
   */
  isValid() {
    return this.idIsValid() && this.sellerIdIsValid() && this.offerIdsIsValid();
  }
}

// Export
module.exports = Group;
