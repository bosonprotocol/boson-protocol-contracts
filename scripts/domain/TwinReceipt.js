const ethers = require("ethers");
const eip55 = require("eip55");
const TokenType = require("./TokenType");

/**
 * Boson Protocol Domain Entity: TwinReceipt
 *
 * See: {BosonTypes.TwinReceipt}
 */
class TwinReceipt {
  /*
      struct TwinReceipt {
          uint256 twinId;
          uint256 tokenId; // only for ERC721 and ERC1155
          uint256 amount; // only for ERC1155 and ERC20
          address tokenAddress;
          TokenType tokenType;
        }
*/

  constructor(twinId, tokenId, amount, tokenAddress, tokenType) {
    this.twinId = twinId;
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
    const { twinId, tokenId, amount, tokenAddress, tokenType } = o;
    return new TwinReceipt(twinId, tokenId, amount, tokenAddress, tokenType);
  }

  /**
   * Get a new TwinReceipt instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    // destructure struct
    let [twinId, tokenId, amount, tokenAddress, tokenType] = struct;

    return TwinReceipt.fromObject({
      twinId: twinId.toString(),
      tokenId: tokenId.toString(),
      amount: amount.toString(),
      tokenAddress: tokenAddress.toString(),
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
    return [this.twinId, this.tokenId, this.amount, this.tokenAddress, this.tokenType];
  }

  /**
   * Clone this TwinReceipt
   * @returns {TwinReceipt}
   */
  clone() {
    return TwinReceipt.fromObject(this.toObject());
  }

  /**
   * Is this TwinReceipt instance's twinId field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  twinIdIsValid() {
    let valid = false;
    let { twinId } = this;
    try {
      valid = typeof twinId === "string" && typeof ethers.BigNumber.from(twinId) === "object";
    } catch (e) {}
    return valid;
  }

  /**
   * Is this TwinReceipt instance's tokenId field valid?
   * Must be an empty string or a string representation of a big number
   * @returns {boolean}
   */
  tokenIdIsValid() {
    let valid = false;
    let { tokenId } = this;
    try {
      valid = typeof tokenId === "string" && (tokenId === "" || typeof ethers.BigNumber.from(tokenId) === "object");
    } catch (e) {}
    return valid;
  }

  /**
   * Is this TwinReceipt instance's amount field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  amountIsValid() {
    let valid = false;
    let { amount } = this;
    try {
      valid = typeof amount === "string" && typeof ethers.BigNumber.from(amount) === "object";
    } catch (e) {}
    return valid;
  }

  /**
   * Is this TwinReceipt instance's tokenAddress field valid?
   * Must be a eip55 compliant Ethereum address
   * @returns {boolean}
   */
  tokenAddressIsValid() {
    let valid = false;
    let { tokenAddress } = this;
    try {
      valid = eip55.verify(eip55.encode(tokenAddress));
    } catch (e) {}
    return valid;
  }

  /**
   * Is this TwinReceipt instance's tokenType field valid?
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
   * Is this TwinReceipt instance valid?
   * @returns {boolean}
   */
  isValid() {
    return (
      this.twinIdIsValid() &&
      this.amountIsValid() &&
      this.tokenIdIsValid() &&
      this.tokenAddressIsValid() &&
      this.tokenTypeIsValid()
    );
  }
}

// Export
module.exports = TwinReceipt;
