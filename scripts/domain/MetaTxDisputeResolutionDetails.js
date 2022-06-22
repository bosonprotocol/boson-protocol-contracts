const ethers = require("ethers");

/**
 * Boson Protocol Domain Entity: MetaTxDisputeResolutionDetails
 *
 * See: {BosonTypes.MetaTxDisputeResolutionDetails}
 */
class MetaTxDisputeResolutionDetails {
  /*
      struct MetaTxDisputeResolutionDetails {
          uint256 exchangeId;
          uint256 buyerPercent;
          bytes32 sigR;
          bytes32 sigS;
          uint8 sigV;
      }
  */

  constructor(exchangeId, buyerPercent, sigR, sigS, sigV) {
    this.exchangeId = exchangeId;
    this.buyerPercent = buyerPercent;
    this.sigR = sigR;
    this.sigS = sigS;
    this.sigV = sigV;
  }

  /**
   * Get a new MetaTxDisputeResolutionDetails instance from a pojo representation
   * @param o
   * @returns {MetaTxDisputeResolutionDetails}
   */
  static fromObject(o) {
    const { exchangeId, buyerPercent, sigR, sigS, sigV } = o;
    return new MetaTxDisputeResolutionDetails(exchangeId, buyerPercent, sigR, sigS, sigV);
  }

  /**
   * Get a new MetaTxDisputeResolutionDetails instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    let exchangeId, buyerPercent, sigR, sigS, sigV;

    // destructure struct
    [exchangeId, buyerPercent, sigR, sigS, sigV] = struct;

    return MetaTxDisputeResolutionDetails.fromObject({
      exchangeId,
      buyerPercent,
      sigR,
      sigS,
      sigV,
    });
  }

  /**
   * Get a database representation of this MetaTxDisputeResolutionDetails instance
   * @returns {object}
   */
  toObject() {
    return JSON.parse(this.toString());
  }

  /**
   * Get a string representation of this MetaTxDisputeResolutionDetails instance
   * @returns {string}
   */
  toString() {
    return JSON.stringify(this);
  }

  /**
   * Get a struct representation of this MetaTxDisputeResolutionDetails instance
   * @returns {string}
   */
  toStruct() {
    return [this.exchangeId, this.buyerPercent, this.sigR, this.sigS, this.sigV];
  }

  /**
   * Clone this MetaTxDisputeResolutionDetails
   * @returns {MetaTxDisputeResolutionDetails}
   */
  clone() {
    return MetaTxDisputeResolutionDetails.fromObject(this.toObject());
  }

  /**
   * Is this MetaTxDisputeResolutionDetails instance's exchangeId valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  exchangeIdIsValid() {
    let valid = false;
    let { exchangeId } = this;
    try {
      valid = typeof exchangeId === "string" && typeof ethers.BigNumber.from(exchangeId) === "object";
    } catch (e) {}
    return valid;
  }

  /**
   * Is this MetaTxDisputeResolutionDetails instance's buyerPercent valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  buyerPercentIsValid() {
    let valid = false;
    let { buyerPercent } = this;
    try {
      valid = typeof buyerPercent === "string" && typeof ethers.BigNumber.from(buyerPercent) === "object";
    } catch (e) {}
    return valid;
  }

  /**
   * Is this MetaTxDisputeResolutionDetails instance's sigR field valid?
   * Must be a bytes32
   * @returns {boolean}
   */
  sigRIsValid() {
    let valid = false;
    let { sigR } = this;
    try {
      valid = typeof sigR === "string" && ethers.utils.isHexString(sigR, 32);
    } catch (e) {}
    return valid;
  }

  /**
   * Is this MetaTxDisputeResolutionDetails instance's sigS field valid?
   * Must be a bytes32
   * @returns {boolean}
   */
  sigSIsValid() {
    let valid = false;
    let { sigS } = this;
    try {
      valid = typeof sigS === "string" && ethers.utils.isHexString(sigS, 32);
    } catch (e) {}
    return valid;
  }

  /**
   * Is this MetaTxDisputeResolutionDetails instance's sigV valid?
   * Must be a string representation of a big number and lies between 0 - 255
   * @returns {boolean}
   */
  sigVIsValid() {
    let valid = false;
    let { sigV } = this;
    let withinRange = parseInt(sigV) >= 0 && parseInt(sigV) <= 255;
    try {
      valid = typeof sigV === "string" && typeof ethers.BigNumber.from(sigV) === "object" && withinRange;
    } catch (e) {}
    return valid;
  }

  /**
   * Is this MetaTxDisputeResolutionDetails instance valid?
   * @returns {boolean}
   */
  isValid() {
    return (
      this.exchangeIdIsValid() &&
      this.buyerPercentIsValid() &&
      this.sigRIsValid() &&
      this.sigSIsValid() &&
      this.sigVIsValid()
    );
  }
}

// Export
module.exports = MetaTxDisputeResolutionDetails;
