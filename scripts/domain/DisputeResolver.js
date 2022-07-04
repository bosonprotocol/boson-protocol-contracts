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
          uint256 escalationResponsePeriod;
          address operator;
          address admin;
          address clerk;
          address payable treasury;
          string metadataUri;
          bool active;
     }
    */

  constructor(id, escalationResponsePeriod, operator, admin, clerk, treasury, metadataUri, active) {
    this.id = id;
    this.escalationResponsePeriod = escalationResponsePeriod;
    this.operator = operator;
    this.admin = admin;
    this.clerk = clerk;
    this.treasury = treasury;
    this.metadataUri = metadataUri;
    this.active = active;
  }

  /**
   * Get a new DisputeResolver instance from a pojo representation
   * @param o
   * @returns {DisputeResolver}
   */
  static fromObject(o) {
    const { id, escalationResponsePeriod, operator, admin, clerk, treasury, metadataUri, active } = o;
    return new DisputeResolver(id, escalationResponsePeriod, operator, admin, clerk, treasury, metadataUri, active);
  }

  /**
   * Get a new DisputeResolver instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    let id, escalationResponsePeriod, operator, admin, clerk, treasury, metadataUri, active;

    // destructure struct
    [id, escalationResponsePeriod, operator, admin, clerk, treasury, metadataUri, active] = struct;

    return DisputeResolver.fromObject({
      id: id.toString(),
      escalationResponsePeriod: escalationResponsePeriod.toString(),
      operator,
      admin,
      clerk,
      treasury,
      metadataUri,
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
    return [
      this.id,
      this.escalationResponsePeriod,
      this.operator,
      this.admin,
      this.clerk,
      this.treasury,
      this.metadataUri,
      this.active,
    ];
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
   * Is this DisputeResolver instance's escalationResponsePeriod field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  escalationResponsePeriodIsValid() {
    let valid = false;
    let { escalationResponsePeriod } = this;
    try {
      valid =
        typeof escalationResponsePeriod === "string" &&
        typeof ethers.BigNumber.from(escalationResponsePeriod) === "object";
    } catch (e) {}
    return valid;
  }

  /**
   * Is this DisputeResolver instance's operator field valid?
   * Must be a eip55 compliant Ethereum address
   * @returns {boolean}
   */
  operatorIsValid() {
    let valid = false;
    let { operator } = this;
    try {
      valid = eip55.verify(eip55.encode(operator));
    } catch (e) {}
    return valid;
  }

  /**
   * Is this DisputeResolver instance's admin field valid?
   * Must be a eip55 compliant Ethereum address
   * @returns {boolean}
   */
  adminIsValid() {
    let valid = false;
    let { admin } = this;
    try {
      valid = eip55.verify(eip55.encode(admin));
    } catch (e) {}
    return valid;
  }

  /**
   * Is this DisputeResolver instance's clerk field valid?
   * Must be a eip55 compliant Ethereum address
   * @returns {boolean}
   */
  clerkIsValid() {
    let valid = false;
    let { clerk } = this;
    try {
      valid = eip55.verify(eip55.encode(clerk));
    } catch (e) {}
    return valid;
  }

  /**
   * Is this DisputeResolver instance's treasury field valid?
   * Must be a eip55 compliant Ethereum address
   * @returns {boolean}
   */
  treasuryIsValid() {
    let valid = false;
    let { treasury } = this;
    try {
      valid = eip55.verify(eip55.encode(treasury));
    } catch (e) {}
    return valid;
  }

  /**
   * Is this DisputeResolver instance's metadataUri field valid?
   * Always present, must be a string
   *
   * @returns {boolean}
   */
  metadataUriIsValid() {
    let valid = false;
    let { metadataUri } = this;
    try {
      valid = typeof metadataUri === "string";
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
    return (
      this.idIsValid() &&
      this.escalationResponsePeriodIsValid() &&
      this.operatorIsValid() &&
      this.adminIsValid() &&
      this.clerkIsValid() &&
      this.treasuryIsValid() &&
      this.activeIsValid() &&
      this.metadataUriIsValid()
    );
  }
}

// Export
module.exports = DisputeResolver;
