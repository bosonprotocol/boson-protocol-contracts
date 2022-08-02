const TokenType = require("./TokenType");
/**
 * Boson Protocol Domain Entity: TwinReceipt
 *
 * See: {BosonTypes.TwinReceipt}
 */
class TwinReceipt {
  /*
      struct TwinReceipt {
          uint256 id;
          uint256 tokenId; // only for ERC721 and ERC1155
          uint256 amount; // only for ERC1155 and ERC20
          address tokenAddress;
          TokenType tokenType;
        }
*/

  constructor(id, tokenId, amount, tokenAddress, tokenType) {
    this.id = id;
    this.tokenId = tokenId;
    this.amount = amount;
    this.tokenAddress = tokenAddress;
    this.tokenType = tokenType;
  }

  /**
   * Get a new TwinReceipt instance from a pojo representation
   * @param o
   * @returns {TwinReceipt}
   */
  static fromObject(o) {
    const { id, tokenId, amount, tokenAddress, tokenType } = o;
    return new TwinReceipt(id, tokenId, amount, tokenAddress, tokenType);
  }

  /**
   * Get a new TwinReceipt instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    // destructure struct
    let [id, tokenId, amount, tokenAddress, tokenType] = struct;

    return TwinReceipt.fromObject({
      id,
      tokenId,
      amount,
      tokenAddress,
      tokenType,
    });
  }

  /**
   * Get a database representation of this TwinReceipt instance
   * @returns {object}
   */
  toObject() {
    return JSON.parse(this.toString());
  }

  /**
   * Get a string representation of this TwinReceipt instance
   * @returns {string}
   */
  toString() {
    return JSON.stringify(this);
  }

  /**
   * Get a struct representation of this TwinReceipt instance
   * @returns {string}
   */
  toStruct() {
    return [this.id, this.tokenId, this.amount, this.tokenAddress, this.tokenType];
  }

  /**
   * Clone this TwinReceipt
   * @returns {TwinReceipt}
   */
  clone() {
    return TwinReceipt.fromObject(this.toObject());
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
}

// Export
module.exports = TwinReceipt;
