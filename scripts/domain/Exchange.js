const ExchangeState = require("./ExchangeState");
const { bigNumberIsValid, enumIsValid } = require("../util/validations.js");

/**
 * Boson Protocol Domain Entity: Exchange
 *
 * See: {BosonTypes.Exchange}
 */
class Exchange {
  /*
      struct Exchange {
            uint256 id;
            uint256 offerId;
            uint256 buyerId;
            uint256 finalizedDate;
            ExchangeState state;
            address payable mutualizerAddress;
            uint256 requestedDRFeeAmount;
      }
   */

  constructor(id, offerId, buyerId, finalizedDate, state, mutualizerAddress, requestedDRFeeAmount) {
    this.id = id;
    this.offerId = offerId;
    this.buyerId = buyerId;
    this.finalizedDate = finalizedDate;
    this.state = state;
    this.mutualizerAddress = mutualizerAddress;
    this.requestedDRFeeAmount = requestedDRFeeAmount;
  }

  /**
   * Get a new Exchange instance from a pojo representation
   * @param o
   * @returns {Exchange}
   */
  static fromObject(o) {
    const { id, offerId, buyerId, finalizedDate, state, mutualizerAddress, requestedDRFeeAmount } = o;
    return new Exchange(id, offerId, buyerId, finalizedDate, state, mutualizerAddress, requestedDRFeeAmount);
  }

  /**
   * Get a new Exchange instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    let id, offerId, buyerId, finalizedDate, state, mutualizerAddress, requestedDRFeeAmount;

    // destructure struct
    [id, offerId, buyerId, finalizedDate, state, mutualizerAddress, requestedDRFeeAmount] = struct;

    return Exchange.fromObject({
      id: id.toString(),
      offerId: offerId.toString(),
      buyerId: buyerId.toString(),
      finalizedDate: finalizedDate.toString(),
      state: Number(state),
      mutualizerAddress: mutualizerAddress,
      requestedDRFeeAmount: requestedDRFeeAmount.toString(),
    });
  }

  /**
   * Get a database representation of this Exchange instance
   * @returns {object}
   */
  toObject() {
    return JSON.parse(this.toString());
  }

  /**
   * Get a string representation of this Exchange instance
   * @returns {string}
   */
  toString() {
    return JSON.stringify(this);
  }

  /**
   * Get a struct representation of this Exchange instance
   * @returns {string}
   */
  toStruct() {
    return [
      this.id,
      this.offerId,
      this.buyerId,
      this.finalizedDate,
      this.state,
      this.mutualizerAddress,
      this.requestedDRFeeAmount,
    ];
  }

  /**
   * Clone this Exchange
   * @returns {Exchange}
   */
  clone() {
    return Exchange.fromObject(this.toObject());
  }

  /**
   * Is this Exchange instance's id field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  idIsValid() {
    return bigNumberIsValid(this.id, { gt: 0 });
  }

  /**
   * Is this Exchange instance's offerId field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  offerIdIsValid() {
    return bigNumberIsValid(this.offerId, { gt: 0 });
  }

  /**
   * Is this Exchange instance's buyerId field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  buyerIdIsValid() {
    return bigNumberIsValid(this.buyerId, { gt: 0 });
  }

  /**
   * Is this Exchange instance's finalizedDate field valid?
   * If present, must be a string representation of a big number
   * @returns {boolean}
   */
  finalizedDateIsValid() {
    return bigNumberIsValid(this.finalizedDate, { gt: 0, optional: true });
  }

  /**
   * Is this Exchange instance's state field valid?
   * Must be a number belonging to the ExchangeState enum
   * @returns {boolean}
   */
  stateIsValid() {
    return enumIsValid(this.state, ExchangeState.Types);
  }

  /**
   * Is this Exchange instance's mutualizerAddress field valid?
   * Must be a valid ethereum address
   * @returns {boolean}
   */
  mutualizerAddressIsValid() {
    const { isAddress } = require("@ethersproject/address");
    return isAddress(this.mutualizerAddress);
  }

  /**
   * Is this Exchange instance's requestedDRFeeAmount field valid?
   * Must be a string representation of a big number >= 0
   * @returns {boolean}
   */
  requestedDRFeeAmountIsValid() {
    return bigNumberIsValid(this.requestedDRFeeAmount, { gt: -1 });
  }

  /**
   * Is this Exchange instance valid?
   * @returns {boolean}
   */
  isValid() {
    return (
      this.idIsValid() &&
      this.offerIdIsValid() &&
      this.buyerIdIsValid() &&
      this.finalizedDateIsValid() &&
      this.stateIsValid() &&
      this.mutualizerAddressIsValid() &&
      this.requestedDRFeeAmountIsValid()
    );
  }
}

// Export
module.exports = Exchange;
