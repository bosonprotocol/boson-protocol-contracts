const ethers = require("ethers");

/**
 * Boson Protocol Domain Entity: MetaTxDisputeDetails
 *
 * See: {BosonTypes.MetaTxDisputeDetails}
 */
class MetaTxDisputeDetails {
  /*
      struct MetaTxDisputeDetails {
          uint256 exchangeId;
          string complaint;
      }
  */

  constructor(exchangeId, complaint) {
    this.exchangeId = exchangeId;
    this.complaint = complaint;
  }

  /**
   * Get a new MetaTxDisputeDetails instance from a pojo representation
   * @param o
   * @returns {MetaTxDisputeDetails}
   */
  static fromObject(o) {
    const { exchangeId, complaint } = o;
    return new MetaTxDisputeDetails(exchangeId, complaint);
  }

  /**
   * Get a new MetaTxDisputeDetails instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    let exchangeId, complaint;

    // destructure struct
    [exchangeId, complaint] = struct;

    return MetaTxDisputeDetails.fromObject({
      exchangeId,
      complaint,
    });
  }

  /**
   * Get a database representation of this MetaTxDisputeDetails instance
   * @returns {object}
   */
  toObject() {
    return JSON.parse(this.toString());
  }

  /**
   * Get a string representation of this MetaTxDisputeDetails instance
   * @returns {string}
   */
  toString() {
    return JSON.stringify(this);
  }

  /**
   * Get a struct representation of this MetaTxDisputeDetails instance
   * @returns {string}
   */
  toStruct() {
    return [this.exchangeId, this.complaint];
  }

  /**
   * Clone this MetaTxDisputeDetails
   * @returns {MetaTxDisputeDetails}
   */
  clone() {
    return MetaTxDisputeDetails.fromObject(this.toObject());
  }

  /**
   * Is this MetaTxDisputeDetails instance's exchangeId valid?
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
   * Is this MetaTxDisputeDetails instance's complaint field valid?
   * Must be a string
   * @returns {boolean}
   */
  complaintIsValid() {
    let valid = false;
    let { complaint } = this;
    try {
      valid = typeof complaint === "string";
    } catch (e) {}
    return valid;
  }

  /**
   * Is this MetaTxDisputeDetails instance valid?
   * @returns {boolean}
   */
  isValid() {
    return this.exchangeIdIsValid() && this.complaintIsValid();
  }
}

// Export
module.exports = MetaTxDisputeDetails;
