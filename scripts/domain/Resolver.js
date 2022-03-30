const ethers = require("ethers");
const eip55 = require("eip55");

/**
 * Boson Protocol Domain Entity: Resolver
 *
 * See: {BosonTypes.Resolver}
 */
class Resolver {
  /*
        struct Resolver {
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
   * Get a new Resolver instance from a pojo representation
   * @param o
   * @returns {Resolver}
   */
  static fromObject(o) {
    const { id, wallet, active } = o;
    return new Resolver(id, wallet, active);
  }

  /**
   * Get a new Resolver instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    let id, wallet, active;

    // destructure struct
    [id, wallet, active] = struct;

    return Resolver.fromObject({
      id: id.toString(),
      wallet,
      active,
    });
  }

  /**
   * Get a database representation of this Resolver instance
   * @returns {object}
   */
  toObject() {
    return JSON.parse(this.toString());
  }

  /**
   * Get a string representation of this Resolver instance
   * @returns {string}
   */
  toString() {
    return JSON.stringify(this);
  }

  /**
   * Get a struct representation of this Resolver instance
   * @returns {string}
   */
  toStruct() {
    return [this.id, this.wallet, this.active];
  }

  /**
   * Clone this Resolver
   * @returns {Resolver}
   */
  clone() {
    return Resolver.fromObject(this.toObject());
  }

  /**
   * Is this Resolver instance's id field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  idIsValid() {
    let valid = false;
    let { id } = this;
    try {
      valid = typeof id === "string" && typeof ethers.BigNumber.from(id) === "object";
    } catch (e) {}
    return valid;
  }

  /**
   * Is this Resolver instance's wallet field valid?
   * Must be a eip55 compliant Ethereum address
   * @returns {boolean}
   */
  walletIsValid() {
    let valid = false;
    let { wallet } = this;
    try {
      valid = eip55.verify(eip55.encode(wallet));
    } catch (e) {}
    return valid;
  }

  /**
   * Is this Resolver instance's active field valid?
   * @returns {boolean}
   */
  activeIsValid() {
    let valid = false;
    let { active } = this;
    try {
      valid = typeof active === "boolean";
    } catch (e) {}
    return valid;
  }

  /**
   * Is this Resolver instance valid?
   * @returns {boolean}
   */
  isValid() {
    return this.idIsValid() && this.walletIsValid() && this.activeIsValid();
  }
}

// Export
module.exports = Resolver;
