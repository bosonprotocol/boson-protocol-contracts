const Side = require("./Side");
const { bigNumberIsValid, addressIsValid, bytesIsValid, enumIsValid } = require("../util/validations.js");

/**
 * Boson Client Entity: PriceDiscovery
 *
 * See: {BosonVoucher.PriceDiscovery}
 */
class PriceDiscovery {
  /*
    struct PriceDiscovery {
      uint256 price;
      Side side;
      address priceDiscoveryContract;
      address conduit;
      bytes priceDiscoveryData;
      }
  */

  constructor(price, side, priceDiscoveryContract, conduit, priceDiscoveryData) {
    this.price = price;
    this.side = side;
    this.priceDiscoveryContract = priceDiscoveryContract;
    this.priceDiscoveryData = priceDiscoveryData;
    this.conduit = conduit;
  }

  /**
   * Get a new PriceDiscovery instance from a pojo representation
   * @param o
   * @returns {PriceDiscovery}
   */
  static fromObject(o) {
    const { price, side, priceDiscoveryContract, conduit, priceDiscoveryData } = o;
    return new PriceDiscovery(price, side, priceDiscoveryContract, conduit, priceDiscoveryData);
  }

  /**
   * Get a new PriceDiscovery instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    let price, side, priceDiscoveryContract, conduit, priceDiscoveryData;

    // destructure struct
    [price, side, priceDiscoveryContract, conduit, priceDiscoveryData] = struct;

    return PriceDiscovery.fromObject({
      price: price.toString(),
      side,
      priceDiscoveryContract: priceDiscoveryContract,
      conduit,
      priceDiscoveryData: priceDiscoveryData,
    });
  }

  /**
   * Get a database representation of this PriceDiscovery instance
   * @returns {object}
   */
  toObject() {
    return JSON.parse(this.toString());
  }

  /**
   * Get a string representation of this PriceDiscovery instance
   * @returns {string}
   */
  toString() {
    return JSON.stringify(this);
  }

  /**
   * Get a struct representation of this PriceDiscovery instance
   * @returns {string}
   */
  toStruct() {
    return [this.price, this.side, this.priceDiscoveryContract, this.conduit, this.priceDiscoveryData];
  }

  /**
   * Clone this PriceDiscovery
   * @returns {PriceDiscovery}
   */
  clone() {
    return PriceDiscovery.fromObject(this.toObject());
  }

  /**
   * Is this PriceDiscovery instance's price field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  priceIsValid() {
    return bigNumberIsValid(this.price);
  }

  /**
   * Is this PriceDiscovery instance's side field valid?
   * Must be a number belonging to the Side enum
   * @returns {boolean}
   */
  sideIsValid() {
    return enumIsValid(this.side, Side.Types);
  }

  /**
   * Is this PriceDiscovery instance's priceDiscoveryContract field valid?
   * Must be a eip55 compliant Ethereum address
   * @returns {boolean}
   */
  priceDiscoveryContractIsValid() {
    return addressIsValid(this.priceDiscoveryContract);
  }

  /**
   * Is this PriceDiscovery instance's conduit field valid?
   * Must be a eip55 compliant Ethereum address
   * @returns {boolean}
   */
  conduitIsValid() {
    return addressIsValid(this.conduit);
  }

  /**
   * Is this PriceDiscovery instance's priceDiscoveryData field valid?
   * If present, must be a string representation of bytes
   * @returns {boolean}
   */
  priceDiscoveryDataIsValid() {
    return bytesIsValid(this.priceDiscoveryData);
  }

  /**
   * Is this PriceDiscovery instance valid?
   * @returns {boolean}
   */
  isValid() {
    return (
      this.priceIsValid() &&
      this.sideIsValid() &&
      this.priceDiscoveryContractIsValid() &&
      this.conduitIsValid() &&
      this.priceDiscoveryDataIsValid()
    );
  }
}

// Export
module.exports = PriceDiscovery;
