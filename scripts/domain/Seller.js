const { bigNumberIsValid, booleanIsValid, addressIsValid } = require("../util/validations.js");

/**
 * Boson Protocol Domain Entity: Seller
 *
 * See: {BosonTypes.Seller}
 */
class Seller {
  /*
        struct Seller {
            uint256 id;
            address assistant;
            address admin;
            address clerk;
            address payable treasury;
            bool active;
        }
    */

  constructor(id, assistant, admin, clerk, treasury, active) {
    this.id = id;
    this.assistant = assistant;
    this.admin = admin;
    this.clerk = clerk;
    this.treasury = treasury;
    this.active = active;
  }

  /**
   * Get a new Seller instance from a pojo representation
   * @param o
   * @returns {Seller}
   */
  static fromObject(o) {
    const { id, assistant, admin, clerk, treasury, active } = o;
    return new Seller(id, assistant, admin, clerk, treasury, active);
  }

  /**
   * Get a new Seller instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    let id, assistant, admin, clerk, treasury, active;

    // destructure struct
    [id, assistant, admin, clerk, treasury, active] = struct;

    return Seller.fromObject({
      id: id.toString(),
      assistant,
      admin,
      clerk,
      treasury,
      active,
    });
  }

  /**
   * Get a database representation of this Seller instance
   * @returns {object}
   */
  toObject() {
    return JSON.parse(this.toString());
  }

  /**
   * Get a string representation of this Seller instance
   * @returns {string}
   */
  toString() {
    return JSON.stringify(this);
  }

  /**
   * Get a struct representation of this Seller instance
   * @returns {string}
   */
  toStruct() {
    return [this.id, this.assistant, this.admin, this.clerk, this.treasury, this.active];
  }

  /**
   * Clone this Seller
   * @returns {Seller}
   */
  clone() {
    return Seller.fromObject(this.toObject());
  }

  /**
   * Is this Seller instance's id field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  idIsValid() {
    return bigNumberIsValid(this.id);
  }

  /**
   * Is this Seller instance's assistant field valid?
   * Must be a eip55 compliant Ethereum address
   * @returns {boolean}
   */
  assistantIsValid() {
    return addressIsValid(this.assistant);
  }

  /**
   * Is this Seller instance's admin field valid?
   * Must be a eip55 compliant Ethereum address
   * @returns {boolean}
   */
  adminIsValid() {
    return addressIsValid(this.admin);
  }

  /**
   * Is this Seller instance's clerk field valid?
   * Must be a eip55 compliant Ethereum address
   * @returns {boolean}
   */
  clerkIsValid() {
    return addressIsValid(this.clerk);
  }

  /**
   * Is this Seller instance's treasury field valid?
   * Must be a eip55 compliant Ethereum address
   * @returns {boolean}
   */
  treasuryIsValid() {
    return addressIsValid(this.treasury);
  }

  /**
   * Is this Seller instance's active field valid?
   * @returns {boolean}
   */
  activeIsValid() {
    return booleanIsValid(this.active);
  }

  /**
   * Is this Seller instance valid?
   * @returns {boolean}
   */
  isValid() {
    return (
      this.idIsValid() &&
      this.assistantIsValid() &&
      this.adminIsValid() &&
      this.clerkIsValid() &&
      this.treasuryIsValid() &&
      this.activeIsValid()
    );
  }
}

// Export
module.exports = Seller;
