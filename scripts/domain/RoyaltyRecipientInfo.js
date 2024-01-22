const { bigNumberIsValid, addressIsValid } = require("../util/validations.js");

/**
 * Boson Protocol Domain Entity: RoyaltyRecipientInfo
 *
 * See: {BosonTypes.RoyaltyRecipientInfo}
 */
class RoyaltyRecipientInfo {
  /*
    struct RoyaltyRecipientInfo {
        address wallet;
        uint256 minRoyaltyPercentage;
    }
    */

  constructor(wallet, minRoyaltyPercentage) {
    this.wallet = wallet;
    this.minRoyaltyPercentage = minRoyaltyPercentage;
  }

  /**
   * Get a new RoyaltyRecipientInfo instance from a pojo representation
   * @param o
   * @returns {RoyaltyRecipientInfo}
   */
  static fromObject(o) {
    const { wallet, minRoyaltyPercentage } = o;
    return new RoyaltyRecipientInfo(wallet, minRoyaltyPercentage);
  }

  /**
   * Get a new RoyaltyRecipientInfo instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    let wallet, minRoyaltyPercentage;

    // destructure struct
    [wallet, minRoyaltyPercentage] = struct;

    return RoyaltyRecipientInfo.fromObject({
      wallet,
      minRoyaltyPercentage: minRoyaltyPercentage.toString(),
    });
  }

  /**
   * Get a database representation of this RoyaltyRecipientInfo instance
   * @returns {object}
   */
  toObject() {
    return JSON.parse(this.toString());
  }

  /**
   * Get a string representation of this RoyaltyRecipientInfo instance
   * @returns {string}
   */
  toString() {
    return JSON.stringify(this);
  }

  /**
   * Get a struct representation of this RoyaltyRecipientInfo instance
   * @returns {string}
   */
  toStruct() {
    return [this.wallet, this.minRoyaltyPercentage];
  }

  /**
   * Clone this RoyaltyRecipientInfo
   * @returns {RoyaltyRecipientInfo}
   */
  clone() {
    return RoyaltyRecipientInfo.fromObject(this.toObject());
  }

  /**
   * Is this RoyaltyRecipientInfo instance's wallet field valid?
   * Must be a eip55 compliant Ethereum address
   * @returns {boolean}
   */
  walletIsValid() {
    return addressIsValid(this.wallet);
  }

  /**
   * Is this RoyaltyRecipientInfo instance's minRoyaltyPercentage field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  minRoyaltyPercentageIsValid() {
    return bigNumberIsValid(this.minRoyaltyPercentage);
  }

  /**
   * Is this RoyaltyRecipientInfo instance valid?
   * @returns {boolean}
   */
  isValid() {
    return this.walletIsValid() && this.minRoyaltyPercentageIsValid();
  }
}

/**
 * Boson Protocol Domain Entity: Collection of RoyaltyRecipientInfo
 *
 * See: {BosonTypes.RoyaltyRecipientInfo}
 */
class RoyaltyRecipientInfoList {
  constructor(royaltyRecipientInfos) {
    this.royaltyRecipientInfos = royaltyRecipientInfos;
  }

  /**
   * Get a new RoyaltyRecipientInfoList instance from a pojo representation
   * @param o
   * @returns {RoyaltyRecipientInfoList}
   */
  static fromObject(o) {
    const { royaltyRecipientInfos } = o;
    return new RoyaltyRecipientInfoList(royaltyRecipientInfos.map((f) => RoyaltyRecipientInfo.fromObject(f)));
  }

  /**
   * Get a new RoyaltyRecipientInfoList instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    return RoyaltyRecipientInfoList.fromObject({
      royaltyRecipientInfos: struct.map((royaltyRecipientInfo) =>
        RoyaltyRecipientInfo.fromStruct(royaltyRecipientInfo)
      ),
    });
  }

  /**
   * Get a database representation of this RoyaltyRecipientInfoList instance
   * @returns {object}
   */
  toObject() {
    return JSON.parse(this.toString());
  }

  /**
   * Get a string representation of this RoyaltyRecipientInfoList instance
   * @returns {string}
   */
  toString() {
    return JSON.stringify(this.royaltyRecipientInfos);
  }

  /**
   * Get a struct representation of this RoyaltyRecipientInfoList instance
   * @returns {string}
   */
  toStruct() {
    return this.royaltyRecipientInfos.map((f) => f.toStruct());
  }

  /**
   * Clone this RoyaltyRecipientInfoList
   * @returns {RoyaltyRecipientInfoList}
   */
  clone() {
    return RoyaltyRecipientInfoList.fromObject(this.toObject());
  }

  /**
   * Is this RoyaltyRecipientInfoList instance's royaltyRecipientInfo field valid?
   * Must be a list of RoyaltyRecipientInfo instances
   * @returns {boolean}
   */
  royaltyRecipientInfoIsValid() {
    let valid = false;
    let { royaltyRecipientInfos } = this;
    try {
      valid =
        Array.isArray(royaltyRecipientInfos) &&
        royaltyRecipientInfos.reduce(
          (previousRoyaltyRecipientInfo, currentRoyaltyRecipientInfo) =>
            previousRoyaltyRecipientInfo && currentRoyaltyRecipientInfo.isValid(),
          true
        );
    } catch (e) {}
    return valid;
  }

  /**
   * Is this RoyaltyRecipientInfoList instance valid?
   * @returns {boolean}
   */
  isValid() {
    return this.royaltyRecipientInfoIsValid();
  }
}

// Export
exports.RoyaltyRecipientInfo = RoyaltyRecipientInfo;
exports.RoyaltyRecipientInfoList = RoyaltyRecipientInfoList;
