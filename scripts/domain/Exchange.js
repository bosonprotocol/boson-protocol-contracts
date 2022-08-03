const ethers = require("ethers");
const Voucher = require("./Voucher");
const ExchangeState = require("./ExchangeState");

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
            Voucher voucher;
            ExchangeState state;
      }
   */

  constructor(id, offerId, buyerId, finalizedDate, voucher, state) {
    this.id = id;
    this.offerId = offerId;
    this.buyerId = buyerId;
    this.finalizedDate = finalizedDate;
    this.voucher = voucher;
    this.state = state;
  }

  /**
   * Get a new Exchange instance from a pojo representation
   * @param o
   * @returns {Exchange}
   */
  static fromObject(o) {
    const { id, offerId, buyerId, finalizedDate, state } = o;
    const voucher = Voucher.fromObject(o.voucher);
    return new Exchange(id, offerId, buyerId, finalizedDate, voucher, state);
  }

  /**
   * Get a new Exchange instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    let id, offerId, buyerId, finalizedDate, voucher, state;

    // destructure struct
    [id, offerId, buyerId, finalizedDate, voucher, state] = struct;

    return Exchange.fromObject({
      id: id.toString(),
      offerId: offerId.toString(),
      buyerId: buyerId.toString(),
      finalizedDate: finalizedDate.toString(),
      voucher: Voucher.fromStruct(voucher),
      state,
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
    return [this.id, this.offerId, this.buyerId, this.finalizedDate, this.voucher.toStruct(), this.state];
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
    let valid = false;
    let { id } = this;
    try {
      valid = typeof id === "string" && ethers.BigNumber.from(id).gt(0);
    } catch (e) {}
    return valid;
  }

  /**
   * Is this Exchange instance's offerId field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  offerIdIsValid() {
    let valid = false;
    let { offerId } = this;
    try {
      valid = typeof offerId === "string" && ethers.BigNumber.from(offerId).gt(0);
    } catch (e) {}
    return valid;
  }

  /**
   * Is this Exchange instance's buyerId field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  buyerIdIsValid() {
    let valid = false;
    let { buyerId } = this;
    try {
      valid = typeof buyerId === "string" && ethers.BigNumber.from(buyerId).gt(0);
    } catch (e) {}
    return valid;
  }

  /**
   * Is this Exchange instance's finalizedDate field valid?
   * If present, must be a string representation of a big number
   * @returns {boolean}
   */
  finalizedDateIsValid() {
    let valid = false;
    let { finalizedDate } = this;
    try {
      valid =
        finalizedDate === null ||
        finalizedDate === undefined ||
        (typeof finalizedDate === "string" && ethers.BigNumber.from(finalizedDate).gt(0));
    } catch (e) {}
    return valid;
  }

  /**
   * Is this Exchange instance's voucher field valid?
   * If present, must be a valid Voucher instance
   * @returns {boolean}
   */
  voucherIsValid() {
    let valid = false;
    let { voucher } = this;
    try {
      valid = voucher === null || voucher === undefined || (typeof voucher === "object" && voucher.isValid());
    } catch (e) {}
    return valid;
  }

  /**
   * Is this Exchange instance's state field valid?
   * @returns {boolean}
   */
  stateIsValid() {
    let valid = false;
    let { state } = this;
    try {
      valid = ExchangeState.Types.includes(state);
    } catch (e) {}
    return valid;
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
      this.voucherIsValid() &&
      this.stateIsValid()
    );
  }
}

// Export
module.exports = Exchange;
