const AuthTokenType = require("./AuthTokenType");
const { bigNumberIsValid, enumIsValid } = require("../util/validations.js");

/**
 * Boson Protocol Domain Entity: AuthToken
 *
 * See: {BosonTypes.AuthToken}
 */
class AuthToken {
  /*
        struct AuthToken {
            uint256 tokenId;
            AuthTokenType tokenType;
        }
    */

  constructor(tokenId, tokenType) {
    this.tokenId = tokenId;
    this.tokenType = tokenType;
  }

  /**
   * Get a new AuthToken instance from a pojo representation
   * @param o
   * @returns {AuthToken}
   */
  static fromObject(o) {
    const { tokenId, tokenType } = o;
    return new AuthToken(tokenId, tokenType);
  }

  /**
   * Get a new AuthToken instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    let tokenId, tokenType;

    // destructure struct
    [tokenId, tokenType] = struct;

    return AuthToken.fromObject({
      tokenId: tokenId.toString(),
      tokenType: tokenType,
    });
  }

  /**
   * Get a database representation of this AuthToken instance
   * @returns {object}
   */
  toObject() {
    return JSON.parse(this.toString());
  }

  /**
   * Get a string representation of this AuthToken instance
   * @returns {string}
   */
  toString() {
    return JSON.stringify(this);
  }

  /**
   * Get a struct representation of this AuthToken instance
   * @returns {string}
   */
  toStruct() {
    return [this.tokenId, this.tokenType];
  }

  /**
   * Clone this AuthToken
   * @returns {AuthToken}
   */
  clone() {
    return AuthToken.fromObject(this.toObject());
  }

  /**
   * Is this AuthToken instance's tokenId field valid?
   * @returns {boolean}
   */
  tokenIdIsValid() {
    return bigNumberIsValid(this.tokenId);
  }

  /**
   * Is this AuthTokenType instance's state field valid?
   * Must be a number belonging to the AuthTokenType enum
   * @returns {boolean}
   */
  tokenTypeIsValid() {
    return enumIsValid(this.tokenType, AuthTokenType.Types);
  }

  /**
   * Is this AuthToken instance valid?
   * @returns {boolean}
   */
  isValid() {
    return this.tokenIdIsValid() && this.tokenTypeIsValid();
  }
}

// Export
module.exports = AuthToken;
