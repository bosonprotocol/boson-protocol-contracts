const TokenType = require("./TokenType");
const { bigNumberIsValid, addressIsValid } = require("../util/validations.js");

/**
 * Boson Protocol Domain Entity: Twin
 *
 * See: {BosonTypes.Twin}
 */
class Twin {
  /*
        struct Twin {
            uint256 id;
            uint256 sellerId;
            uint256 amount; // ERC1155 / ERC20
            uint256 supplyAvailable; // ERC721 (the last token id of the ERC721 available range)
            uint256 tokenId; // ERC1155 / ERC721 (must be initialized with the initial pointer position of the ERC721 ids available range)
            address tokenAddress;  // all
            TokenType tokenType
        }
    */

  constructor(id, sellerId, amount, supplyAvailable, tokenId, tokenAddress, tokenType) {
    this.id = id;
    this.sellerId = sellerId;
    this.amount = amount;
    this.supplyAvailable = supplyAvailable;
    this.tokenId = tokenId;
    this.tokenAddress = tokenAddress;
    this.tokenType = tokenType;
  }

  /**
   * Get a new Twin instance from a pojo representation
   * @param o
   * @returns {Twin}
   */
  static fromObject(o) {
    const { id, sellerId, amount, supplyAvailable, tokenId, tokenAddress, tokenType } = o;
    return new Twin(id, sellerId, amount, supplyAvailable, tokenId, tokenAddress, tokenType);
  }

  /**
   * Get a new Twin instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    let id, sellerId, amount, supplyAvailable, tokenId, tokenAddress, tokenType;

    // destructure struct
    [id, sellerId, amount, supplyAvailable, tokenId, tokenAddress, tokenType] = struct;

    return Twin.fromObject({
      id: id.toString(),
      sellerId: sellerId.toString(),
      amount: amount.toString(),
      supplyAvailable: supplyAvailable ? supplyAvailable.toString() : "",
      tokenId: tokenId ? tokenId.toString() : "",
      tokenAddress,
      tokenType,
    });
  }

  /**
   * Get a database representation of this Twin instance
   * @returns {object}
   */
  toObject() {
    return JSON.parse(this.toString());
  }

  /**
   * Get a string representation of this Twin instance
   * @returns {string}
   */
  toString() {
    return JSON.stringify(this);
  }

  /**
   * Get a struct representation of this Twin instance
   * @returns {string}
   */
  toStruct() {
    return [this.id, this.sellerId, this.amount, this.supplyAvailable, this.tokenId, this.tokenAddress, this.tokenType];
  }

  /**
   * Clone this Twin
   * @returns {Twin}
   */
  clone() {
    return Twin.fromObject(this.toObject());
  }

  /**
   * Is this Twin instance's id field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  idIsValid() {
    return bigNumberIsValid(this.id);
  }

  /**
   * Is this Twin instance's sellerId field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  sellerIdIsValid() {
    return bigNumberIsValid(this.sellerId);
  }

  /**
   * Is this Twin instance's amount field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  amountIsValid() {
    return bigNumberIsValid(this.amount);
  }

  /**
   * Is this Twin instance's supplyAvailable field valid?
   * Must be an empty string or a string representation of a big number
   * @returns {boolean}
   */
  supplyAvailableIsValid() {
    return bigNumberIsValid(this.supplyAvailable, { empty: true });
  }

  /**
   * Is this Twin instance's tokenId field valid?
   * Must be an empty string or a string representation of a big number
   * @returns {boolean}
   */
  tokenIdIsValid() {
    return bigNumberIsValid(this.tokenId, { empty: true });
  }

  /**
   * Is this Twin instance's tokenAddress field valid?
   * Must be a eip55 compliant Ethereum address
   * @returns {boolean}
   */
  tokenAddressIsValid() {
    return addressIsValid(this.tokenAddress);
  }

  /**
   * Is this Twin instance's tokenType field valid?
   * @returns {boolean}
   */
  tokenTypeIsValid() {
    let valid = false;
    let { tokenType } = this;
    try {
      valid = TokenType.Types.includes(tokenType);
    } catch (e) {}
    return valid;
  }

  /**
   * Is this Twin instance valid?
   * @returns {boolean}
   */
  isValid() {
    return (
      this.idIsValid() &&
      this.sellerIdIsValid() &&
      this.amountIsValid() &&
      this.supplyAvailableIsValid() &&
      this.tokenIdIsValid() &&
      this.tokenAddressIsValid() &&
      this.tokenTypeIsValid()
    );
  }
}

// Export
module.exports = Twin;
