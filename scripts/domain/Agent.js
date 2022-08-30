const { bigNumberIsValid, booleanIsValid, addressIsValid } = require("../util/validations.js");

/**
 * Boson Protocol Domain Entity: Agent
 *
 * See: {BosonTypes.Agent}
 */
class Agent {
  /*
        struct Agent {
        uint256 id;
        uint256 feePercentage;
        address payable wallet;
        bool active;
    }
    */

  constructor(id, feePercentage, wallet, active) {
    this.id = id;
    this.feePercentage = feePercentage;
    this.wallet = wallet;
    this.active = active;
  }

  /**
   * Get a new Agent instance from a pojo representation
   * @param o
   * @returns {Agent}
   */
  static fromObject(o) {
    const { id, feePercentage, wallet, active } = o;
    return new Agent(id, feePercentage, wallet, active);
  }

  /**
   * Get a new Agent instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    let id, feePercentage, wallet, active;

    // destructure struct
    [id, feePercentage, wallet, active] = struct;

    return Agent.fromObject({
      id: id.toString(),
      feePercentage: feePercentage.toString(),
      wallet,
      active,
    });
  }

  /**
   * Get a database representation of this Agent instance
   * @returns {object}
   */
  toObject() {
    return JSON.parse(this.toString());
  }

  /**
   * Get a string representation of this Agent instance
   * @returns {string}
   */
  toString() {
    return JSON.stringify(this);
  }

  /**
   * Get a struct representation of this Agent instance
   * @returns {string}
   */
  toStruct() {
    return [this.id, this.feePercentage, this.wallet, this.active];
  }

  /**
   * Clone this Agent
   * @returns {Agent}
   */
  clone() {
    return Agent.fromObject(this.toObject());
  }

  /**
   * Is this Agent instance's id field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  idIsValid() {
    return bigNumberIsValid(this.id);
  }

  /**
   * Is this Agent instance's feePercentage field valid?
   * Must be a string representation of a big number less than or equal to 10000, i.e. <= 100%
   * @returns {boolean}
   */
  feePercentageIsValid() {
    const { feePercentage } = this;
    return bigNumberIsValid(feePercentage, { lte: "10000" });
  }

  /**
   * Is this Agent instance's wallet field valid?
   * Must be a eip55 compliant Ethereum address
   * @returns {boolean}
   */
  walletIsValid() {
    return addressIsValid(this.wallet);
  }

  /**
   * Is this Agent instance's active field valid?
   * @returns {boolean}
   */
  activeIsValid() {
    return booleanIsValid(this.active);
  }

  /**
   * Is this Agent instance valid?
   * @returns {boolean}
   */
  isValid() {
    return this.idIsValid() && this.feePercentageIsValid() && this.walletIsValid() && this.activeIsValid();
  }
}

// Export
module.exports = Agent;
