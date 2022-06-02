const ethers = require("ethers");
const eip55 = require("eip55");

/**
 * Boson Protocol Domain Entity: DisputeResolver
 *
 * See: {BosonTypes.DisputeResolver}
 */
class DisputeResolver {
  /*
        struct DisputeResolver {
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
   * Get a new DisputeResolver instance from a pojo representation
   * @param o
   * @returns {DisputeResolver}
   */
  static fromObject(o) {
    const { id, wallet, active } = o;
    return new DisputeResolver(id, wallet, active);
  }

  /**
   * Get a new DisputeResolver instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    let id, wallet, active;

    // destructure struct
    [id, wallet, active] = struct;

    return DisputeResolver.fromObject({
      id: id.toString(),
      wallet,
      active,
    });
  }

  /**
   * Get a database representation of this DisputeResolver instance
   * @returns {object}
   */
  toObject() {
    return JSON.parse(this.toString());
  }

  /**
   * Get a string representation of this DisputeResolver instance
   * @returns {string}
   */
  toString() {
    return JSON.stringify(this);
  }

  /**
   * Get a struct representation of this DisputeResolver instance
   * @returns {string}
   */
  toStruct() {
    return [this.id, this.wallet, this.active];
  }

  /**
   * Clone this DisputeResolver
   * @returns {DisputeResolver}
   */
  clone() {
    return DisputeResolver.fromObject(this.toObject());
  }

  /**
   * Is this DisputeResolver instance's id field valid?
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
   * Is this DisputeResolver instance's wallet field valid?
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
   * Is this DisputeResolver instance's active field valid?
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
   * Is this DisputeResolver instance valid?
   * @returns {boolean}
   */
  isValid() {
    return this.idIsValid() && this.walletIsValid() && this.activeIsValid();
  }
}

// Export
module.exports = DisputeResolver;
