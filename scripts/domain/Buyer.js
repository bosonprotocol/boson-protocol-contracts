const ethers = require("ethers");
const {
  bigNumberIsValid,
  booleanIsValid,
  addressIsValid,
} = require("../util/validations.js");

/**
 * Boson Protocol Domain Entity: Buyer
 *
 * See: {BosonTypes.Buyer}
 */
class Buyer {
  /*
        struct Buyer {
            uint256 id;
            address payable wallet;
            bool active;
        }
    */

  constructor(id, wallet, active) {
    this.id = id;
    this.wallet = wallet;
    this.active = active;
  }

  /**
   * Get a new Buyer instance from a pojo representation
   * @param o
   * @returns {Buyer}
   */
  static fromObject(o) {
    const { id, wallet, active } = o;
    return new Buyer(id, wallet, active);
  }

  /**
   * Get a new Buyer instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    let id, wallet, active;

    // destructure struct
    [id, wallet, active] = struct;

    return Buyer.fromObject({
      id: id.toString(),
      wallet,
      active,
    });
  }

  /**
   * Get a database representation of this Buyer instance
   * @returns {object}
   */
  toObject() {
    return JSON.parse(this.toString());
  }

  /**
   * Get a string representation of this Buyer instance
   * @returns {string}
   */
  toString() {
    return JSON.stringify(this);
  }

  /**
   * Get a struct representation of this Buyer instance
   * @returns {string}
   */
  toStruct() {
    return [this.id, this.wallet, this.active];
  }

  /**
   * Clone this Buyer
   * @returns {Buyer}
   */
  clone() {
    return Buyer.fromObject(this.toObject());
  }

  /**
   * Is this Buyer instance's id field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  idIsValid() {
    return bigNumberIsValid(this.id);
  }

  /**
   * Is this Buyer instance's wallet field valid?
   * Must be a eip55 compliant Ethereum address
   * @returns {boolean}
   */
  walletIsValid() {
    return addressIsValid(this.wallet);
  }

  /**
   * Is this Buyer instance's active field valid?
   * @returns {boolean}
   */
  activeIsValid() {
    return booleanIsValid(this.active);
  }

  /**
   * Is this Buyer instance valid?
   * @returns {boolean}
   */
  isValid() {
    return this.idIsValid() && this.walletIsValid() && this.activeIsValid();
  }
}

// Export
module.exports = Buyer;
