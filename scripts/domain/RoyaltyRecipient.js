const { bigNumberIsValid, stringIsValid, addressIsValid } = require("../util/validations.js");

/**
 * Boson Protocol Domain Entity: RoyaltyRecipient
 *
 * See: {BosonTypes.RoyaltyRecipient}
 */
class RoyaltyRecipient {
  /*
    struct RoyaltyRecipient {
        address wallet;
        uint256 minRoyaltyPercentage;
        string externalId;
    }
    */

  constructor(wallet, minRoyaltyPercentage, externalId) {
    this.wallet = wallet;
    this.minRoyaltyPercentage = minRoyaltyPercentage;
    this.externalId = externalId;
  }

  /**
   * Get a new RoyaltyRecipient instance from a pojo representation
   * @param o
   * @returns {RoyaltyRecipient}
   */
  static fromObject(o) {
    const { wallet, minRoyaltyPercentage, externalId } = o;
    return new RoyaltyRecipient(wallet, minRoyaltyPercentage, externalId);
  }

  /**
   * Get a new RoyaltyRecipient instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    let wallet, minRoyaltyPercentage, externalId;

    // destructure struct
    [wallet, minRoyaltyPercentage, externalId] = struct;

    return RoyaltyRecipient.fromObject({
      wallet,
      minRoyaltyPercentage: minRoyaltyPercentage.toString(),
      externalId,
    });
  }

  /**
   * Get a database representation of this RoyaltyRecipient instance
   * @returns {object}
   */
  toObject() {
    return JSON.parse(this.toString());
  }

  /**
   * Get a string representation of this RoyaltyRecipient instance
   * @returns {string}
   */
  toString() {
    return JSON.stringify(this);
  }

  /**
   * Get a struct representation of this RoyaltyRecipient instance
   * @returns {string}
   */
  toStruct() {
    return [this.wallet, this.minRoyaltyPercentage, this.externalId];
  }

  /**
   * Clone this RoyaltyRecipient
   * @returns {RoyaltyRecipient}
   */
  clone() {
    return RoyaltyRecipient.fromObject(this.toObject());
  }

  /**
   * Is this RoyaltyRecipient instance's wallet field valid?
   * Must be a eip55 compliant Ethereum address
   * @returns {boolean}
   */
  walletIsValid() {
    return addressIsValid(this.wallet);
  }

  /**
   * Is this RoyaltyRecipient instance's minRoyaltyPercentage field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  minRoyaltyPercentageIsValid() {
    return bigNumberIsValid(this.minRoyaltyPercentage);
  }

  /**
   * Is this RoyaltyRecipient instance's externalId field valid?
   * Always present, must be a string
   *
   * @returns {boolean}
   */
  externalIdIsValid() {
    return stringIsValid(this.externalId);
  }

  /**
   * Is this RoyaltyRecipient instance valid?
   * @returns {boolean}
   */
  isValid() {
    return this.walletIsValid() && this.idIsValid() && this.externalIdIsValid();
  }
}

/**
 * Boson Protocol Domain Entity: Collection of RoyaltyRecipient
 *
 * See: {BosonTypes.RoyaltyRecipient}
 */
class RoyaltyRecipientList {
  constructor(royaltyRecipients) {
    this.royaltyRecipients = royaltyRecipients;
  }

  /**
   * Get a new RoyaltyRecipientList instance from a pojo representation
   * @param o
   * @returns {RoyaltyRecipientList}
   */
  static fromObject(o) {
    const { royaltyRecipients } = o;
    return new RoyaltyRecipientList(royaltyRecipients.map((f) => RoyaltyRecipient.fromObject(f)));
  }

  /**
   * Get a new RoyaltyRecipientList instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    return RoyaltyRecipientList.fromObject({
      royaltyRecipients: struct.map((royaltyRecipient) => RoyaltyRecipient.fromStruct(royaltyRecipient)),
    });
  }

  /**
   * Get a database representation of this RoyaltyRecipientList instance
   * @returns {object}
   */
  toObject() {
    return JSON.parse(this.toString());
  }

  /**
   * Get a string representation of this RoyaltyRecipientList instance
   * @returns {string}
   */
  toString() {
    return JSON.stringify(this.royaltyRecipients);
  }

  /**
   * Get a struct representation of this RoyaltyRecipientList instance
   * @returns {string}
   */
  toStruct() {
    return this.royaltyRecipients.map((f) => f.toStruct());
  }

  /**
   * Clone this RoyaltyRecipientList
   * @returns {RoyaltyRecipientList}
   */
  clone() {
    return RoyaltyRecipientList.fromObject(this.toObject());
  }

  /**
   * Is this RoyaltyRecipientList instance's royaltyRecipient field valid?
   * Must be a list of RoyaltyRecipient instances
   * @returns {boolean}
   */
  royaltyRecipientIsValid() {
    let valid = false;
    let { royaltyRecipients } = this;
    try {
      valid =
        Array.isArray(royaltyRecipients) &&
        royaltyRecipients.reduce(
          (previousRoyaltyRecipient, currentRoyaltyRecipient) =>
            previousRoyaltyRecipient && currentRoyaltyRecipient.isValid(),
          true
        );
    } catch (e) {}
    return valid;
  }

  /**
   * Is this RoyaltyRecipientList instance valid?
   * @returns {boolean}
   */
  isValid() {
    return this.royaltyRecipientIsValid();
  }
}

// Export
exports.RoyaltyRecipient = RoyaltyRecipient;
exports.RoyaltyRecipientList = RoyaltyRecipientList;
