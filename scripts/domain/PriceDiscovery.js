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
      address priceDiscoveryContract;
      bytes priceDiscoveryData;
      Side side;
      }
  */

  constructor(price, priceDiscoveryContract, priceDiscoveryData, side) {
    this.price = price;
    this.priceDiscoveryContract = priceDiscoveryContract;
    this.priceDiscoveryData = priceDiscoveryData;
    this.side = side;
  }

  /**
   * Get a new PriceDiscovery instance from a pojo representation
   * @param o
   * @returns {PriceDiscovery}
   */
  static fromObject(o) {
    const { price, priceDiscoveryContract, priceDiscoveryData, side } = o;
    return new PriceDiscovery(price, priceDiscoveryContract, priceDiscoveryData, side);
  }

  /**
   * Get a new PriceDiscovery instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    let price, priceDiscoveryContract, priceDiscoveryData, side;

    // destructure struct
    [price, priceDiscoveryContract, priceDiscoveryData, side] = struct;

    return PriceDiscovery.fromObject({
      price: price.toString(),
      priceDiscoveryContract: priceDiscoveryContract,
      priceDiscoveryData: priceDiscoveryData,
      side: side,
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
    return [this.price, this.priceDiscoveryContract, this.priceDiscoveryData, this.side];
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
   * Is this PriceDiscovery instance's priceDiscoveryContract field valid?
   * Must be a eip55 compliant Ethereum address
   * @returns {boolean}
   */
  priceDiscoveryContractIsValid() {
    return addressIsValid(this.priceDiscoveryContract);
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
   * Is this PriceDiscovery instance's side field valid?
   * Must be a number belonging to the Side enum
   * @returns {boolean}
   */
  sideIsValid() {
    return enumIsValid(this.side, Side.Types);
  }

  /**
   * Is this PriceDiscovery instance valid?
   * @returns {boolean}
   */
  isValid() {
    return (
      this.priceIsValid() &&
      this.priceDiscoveryContractIsValid() &&
      this.priceDiscoveryDataIsValid() &&
      this.sideIsValid()
    );
  }
}

// Export
module.exports = PriceDiscovery;
