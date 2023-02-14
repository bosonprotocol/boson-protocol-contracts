const Direction = require("./Direction");
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
      Direction direction;
      }
  */

  constructor(price, priceDiscoveryContract, priceDiscoveryData, direction) {
    this.price = price;
    this.priceDiscoveryContract = priceDiscoveryContract;
    this.priceDiscoveryData = priceDiscoveryData;
    this.direction = direction;
  }

  /**
   * Get a new PriceDiscovery instance from a pojo representation
   * @param o
   * @returns {PriceDiscovery}
   */
  static fromObject(o) {
    const { price, priceDiscoveryContract, priceDiscoveryData, direction } = o;
    return new PriceDiscovery(price, priceDiscoveryContract, priceDiscoveryData, direction);
  }

  /**
   * Get a new PriceDiscovery instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    let price, priceDiscoveryContract, priceDiscoveryData, direction;

    // destructure struct
    [price, priceDiscoveryContract, priceDiscoveryData, direction] = struct;

    return PriceDiscovery.fromObject({
      price: price.toString(),
      priceDiscoveryContract: priceDiscoveryContract,
      priceDiscoveryData: priceDiscoveryData,
      direction: direction,
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
    return [this.price, this.priceDiscoveryContract, this.priceDiscoveryData, this.direction];
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
   * Is this PriceDiscovery instance's direction field valid?
   * Must be a number belonging to the Direction enum
   * @returns {boolean}
   */
  directionIsValid() {
    return enumIsValid(this.direction, Direction.Types);
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
      this.directionIsValid()
    );
  }
}

// Export
module.exports = PriceDiscovery;
