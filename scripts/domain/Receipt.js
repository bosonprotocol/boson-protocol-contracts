const Exchange = require("./Exchange.js");
const Dispute = require("./Dispute.js");
const Offer = require("./Offer.js");
const TwinReceipt = require("./TwinReceipt.js");

/**
 * Boson Protocol Domain Entity: Receipt
 *
 * See: {BosonTypes.Receipt}
 */
class Receipt {
  /*
        struct Receipt {
            Exchange exchange,
            Offer offer,
            Dispute dispute,
            TwinReceipt twinReceipts;
          }
*/

  constructor(exchange, offer, dispute, twinReceipts) {
    this.exchange = exchange;
    this.offer = offer;
    this.dispute = dispute ?? new Dispute("0", "", 0, "0");
    this.twinReceipts = twinReceipts ?? [];
  }

  /**
   * Get a new Receipt instance from a pojo representation
   * @param o
   * @returns {Receipt}
   */
  static fromObject(o) {
    const { exchange, offer, dispute, twinReceipts } = o;
    return new Receipt(exchange, offer, dispute, twinReceipts);
  }

  /**
   * Get a new Receipt instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    // destructure struct
    let [exchange, offer, dispute, twinReceipts] = struct;
    return Receipt.fromObject({
      exchange: Exchange.fromStruct(exchange),
      offer: Offer.fromStruct(offer),
      dispute: Dispute.fromStruct(dispute),
      twinReceipts: twinReceipts.map((twinReceipt) => TwinReceipt.fromStruct(twinReceipt)),
    });
  }

  /**
   * Get a database representation of this Receipt instance
   * @returns {object}
   */
  toObject() {
    return JSON.parse(this.toString());
  }

  /**
   * Get a string representation of this Receipt instance
   * @returns {string}
   */
  toString() {
    return JSON.stringify(this);
  }

  /**
   * Get a struct representation of this Receipt instance
   * @returns {string}
   */
  toStruct() {
    return [
      this.exchange.toStruct(),
      this.offer.toStruct(),
      this.dispute.toStruct(),
      this.twinReceipts.map((twinReceipt) => twinReceipt.toStruct()),
    ];
  }

  /**
   * Clone this Receipt
   * @returns {Receipt}
   */
  clone() {
    return Receipt.fromObject(this.toObject());
  }

  /**
   * Is this Receipt instance's exchange field valid?
   * If present, must be a valid Exchange instance
   * @returns {boolean}
   */
  exchangeIsValid() {
    let valid = false;
    let { exchange } = this;
    try {
      valid = typeof exchange === "object" && exchange.isValid();
    } catch (e) {}
    return valid;
  }

  /**
   * Is this Receipt instance's offer field valid?
   * If present, must be a valid Offer instance
   * @returns {boolean}
   */
  offerIsValid() {
    let valid = false;
    let { offer } = this;
    try {
      valid = typeof offer === "object" && offer.isValid();
    } catch (e) {}
    return valid;
  }

  /**
   * Is this Receipt instance's dispute field valid?
   * If present, must be a valid Dispute instance
   * @returns {boolean}
   */
  disputeIsValid() {
    let valid = false;
    let { dispute } = this;
    try {
      valid = dispute === null || dispute === undefined || (typeof dispute === "object" && dispute.isValid());
    } catch (e) {}
    return valid;
  }

  /**
   * Is this Receipt instance's twinReceipts field valid?
   * If present, must be a valid array of TwinReceipt instance
   * @returns {boolean}
   */
  twinReceiptsIsValid() {
    let valid = false;
    let { twinReceipts } = this;
    try {
      const twinReceiptsArray = Array.isArray(twinReceipts);
      if (twinReceiptsArray) {
        if (twinReceipts.length == 0) {
          valid = false;
        } else {
          twinReceipts.forEach((twinReceipt) => {
            valid = typeof twinReceipt === "object" && twinReceipt.isValid();
          });
        }
      }
    } catch (e) {}
    return valid;
  }

  /**
   * Is this Receipt instance valid?
   * @returns {boolean}
   */
  isValid() {
    return this.exchangeIsValid() && this.offerIsValid() && this.disputeIsValid() && this.twinReceiptsIsValid();
  }
}

// Export
module.exports = Receipt;
