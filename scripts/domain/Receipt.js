const ethers = require("ethers");
const Exchange = require("./Exchange.js");
const Dispute = require("./Dispute.js");
const Offer = require("./Offer.js");
const TwinReceipt = require("./TwinReceipt.js");

const BIG_ZERO = ethers.BigNumber.from(0);
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
            TwinReceipt twinReceipt;
          }
*/

  constructor(exchange, offer, dispute, twinReceipt) {
    this.exchange = exchange;
    this.offer = offer;
    this.dispute = dispute ?? new Dispute("0", "", 0, "0");
    this.twinReceipt = twinReceipt ?? new TwinReceipt(BIG_ZERO, BIG_ZERO, BIG_ZERO, ethers.constants.AddressZero, 0);
  }

  /**
   * Get a new Receipt instance from a pojo representation
   * @param o
   * @returns {Receipt}
   */
  static fromObject(o) {
    const { exchange, offer, dispute, twinReceipt } = o;
    return new Receipt(exchange, offer, dispute, twinReceipt);
  }

  /**
   * Get a new Receipt instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    // destructure struct
    let [exchange, offer, dispute, twinReceipt] = struct;

    return Receipt.fromObject({
      exchange: Exchange.fromStruct(exchange),
      offer: Offer.fromStruct(offer),
      dispute: Dispute.fromStruct(dispute),
      twinReceipt: TwinReceipt.fromStruct(twinReceipt),
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
    return [this.exchange, this.offer, this.dispute, this.twinReceipt];
  }

  /**
   * Clone this Receipt
   * @returns {Receipt}
   */
  clone() {
    return Receipt.fromObject(this.toObject());
  }
}

// Export
module.exports = Receipt;
