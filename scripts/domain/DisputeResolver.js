const { bigNumberIsValid, stringIsValid, booleanIsValid, addressIsValid } = require("../util/validations.js");

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
            address assistant;
            address admin;
            address clerk; // NB: deprecated, kept for backwards compatibility
            address payable treasury;
            string metadataUri;
            bool active;
       }
      */

  constructor(id, escalationResponsePeriod, assistant, admin, clerk, treasury, metadataUri, active) {
    this.id = id;
    this.escalationResponsePeriod = escalationResponsePeriod;
    this.assistant = assistant;
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
    const { id, escalationResponsePeriod, assistant, admin, clerk, treasury, metadataUri, active } = o;
    return new DisputeResolver(id, escalationResponsePeriod, assistant, admin, clerk, treasury, metadataUri, active);
  }

  /**
   * Get a new DisputeResolver instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    let id, escalationResponsePeriod, assistant, admin, clerk, treasury, metadataUri, active;

    // destructure struct
    [id, escalationResponsePeriod, assistant, admin, clerk, treasury, metadataUri, active] = struct;

    return DisputeResolver.fromObject({
      id: id.toString(),
      escalationResponsePeriod: escalationResponsePeriod.toString(),
      assistant,
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
      this.assistant,
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
    return bigNumberIsValid(this.id);
  }

  /**
   * Is this DisputeResolver instance's escalationResponsePeriod field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  escalationResponsePeriodIsValid() {
    return bigNumberIsValid(this.escalationResponsePeriod);
  }

  /**
   * Is this DisputeResolver instance's assistant field valid?
   * Must be a eip55 compliant Ethereum address
   * @returns {boolean}
   */
  assistantIsValid() {
    return addressIsValid(this.assistant);
  }

  /**
   * Is this DisputeResolver instance's admin field valid?
   * Must be a eip55 compliant Ethereum address
   * @returns {boolean}
   */
  adminIsValid() {
    return addressIsValid(this.admin);
  }

  /**
   * Is this DisputeResolver instance's clerk field valid?
   * Must be a eip55 compliant Ethereum address
   * @returns {boolean}
   */
  clerkIsValid() {
    return addressIsValid(this.clerk);
  }

  /**
   * Is this DisputeResolver instance's treasury field valid?
   * Must be a eip55 compliant Ethereum address
   * @returns {boolean}
   */
  treasuryIsValid() {
    return addressIsValid(this.treasury);
  }

  /**
   * Is this DisputeResolver instance's metadataUri field valid?
   * Always present, must be a string
   *
   * @returns {boolean}
   */
  metadataUriIsValid() {
    return stringIsValid(this.metadataUri);
  }

  /**
   * Is this DisputeResolver instance's active field valid?
   * @returns {boolean}
   */
  activeIsValid() {
    return booleanIsValid(this.active);
  }

  /**
   * Is this DisputeResolver instance valid?
   * @returns {boolean}
   */
  isValid() {
    return (
      this.idIsValid() &&
      this.escalationResponsePeriodIsValid() &&
      this.assistantIsValid() &&
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
