const hre = require("hardhat");
const ethers = hre.ethers;
const OfferFees = require("./OfferFees.js");
const TwinReceipt = require("./TwinReceipt.js");
const Condition = require("./Condition.js");
const {
  bigNumberIsValid,
  bigNumberNonZeroIsValid,
  enumIsValid,
  booleanIsValid,
  addressIsValid,
} = require("../util/validations.js");

/**
 * Boson Protocol Domain Entity: Receipt
 *
 * See: {BosonTypes.Receipt}
 */
class Receipt {
  /*
    struct Receipt {
      uint256 exchangeId;
      uint256 offerId;
      uint256 buyerId;
      address buyerAddress;
      uint256 sellerId;
      address sellerOperatorAddress; 
      uint256 price;
      uint256 sellerDeposit;
      uint256 buyerCancelPenalty;
      OfferFees offerFees; // protocol and agent fee
      uint256 agentId;
      address agentAddress;
      address exchangeToken;
      uint256 finalizedDate;
      Condition condition;
      uint256 committedDate;
      uint256 redeemedDate;
      bool voucherExpired;
      uint256 disputeResolverId;
      address disputeResolverOperatorAddress;
      uint256 disputedDate; // DisputeDates.disputed
      uint256 escalatedDate; // DisputeDate.escalated
      DisputeState disputeState;
      TwinReceipt[] twinReceipts;
    }
  */

  constructor(
    exchangeId,
    offerId,
    buyerId,
    buyerAddress,
    sellerId,
    sellerOperatorAddress,
    price,
    sellerDeposit,
    buyerCancelPenalty,
    offerFees,
    agentId,
    agentAddress,
    exchangeToken,
    finalizedDate,
    condition,
    committedDate,
    redeemedDate,
    voucherExpired,
    disputeResolverId,
    disputeResolverOperatorAddress,
    disputedDate,
    escalatedDate,
    disputeState,
    twinReceipts
  ) {
    this.exchangeId = exchangeId;
    this.offerId = offerId;
    this.buyerId = buyerId;
    this.buyerAddress = buyerAddress;
    this.sellerId = sellerId;
    this.sellerOperatorAddress = sellerOperatorAddress;
    this.price = price;
    this.sellerDeposit = sellerDeposit;
    this.buyerCancelPenalty = buyerCancelPenalty;
    this.offerFees = offerFees;
    this.agentId = agentId ?? "0";
    this.agentAddress = agentAddress ?? ethers.constants.AddressZero;
    this.exchangeToken = exchangeToken;
    this.finalizedDate = finalizedDate;
    this.condition = condition ?? new Condition(0, 0, ethers.constants.AddressZero, "0", "0", "0");
    this.committedDate = committedDate;
    this.redeemedDate = redeemedDate;
    this.voucherExpired = voucherExpired;
    this.disputeResolverId = disputeResolverId ?? "0";
    this.disputeResolverOperatorAddress = disputeResolverOperatorAddress ?? ethers.constants.AddressZero;
    this.disputedDate = disputedDate ?? "0";
    this.escalatedDate = escalatedDate ?? "0";
    // solidity default value is 0 but it doesn't mean it is in resolving state, it's necessary to check disputedDate to know if a dispute was raised
    this.disputeState = disputeState ?? 0;
    this.twinReceipts = twinReceipts ?? [];
  }

  /**
   * Get a new Receipt instance from a pojo representation
   * @param o
   * @returns {Receipt}
   */
  static fromObject(o) {
    return new Receipt(...Object.values(o));
  }

  /**
   * Get a new Receipt instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    // destructure struct
    let [
      exchangeId,
      offerId,
      buyerId,
      buyerAddress,
      sellerId,
      sellerOperatorAddress,
      price,
      sellerDeposit,
      buyerCancelPenalty,
      offerFees,
      agentId,
      agentAddress,
      exchangeToken,
      finalizedDate,
      condition,
      comittedDate,
      redeemedDate,
      voucherExpired,
      disputeResolverId,
      disputeResolverOperatorAddress,
      disputedDate,
      escalatedDate,
      disputeState,
      twinReceipts,
    ] = struct;

    return Receipt.fromObject({
      exchangeId: exchangeId.toString(),
      offerId: offerId.toString(),
      buyerId: buyerId.toString(),
      buyerAddress,
      sellerId: sellerId.toString(),
      sellerOperatorAddress,
      price: price.toString(),
      sellerDeposit: sellerDeposit.toString(),
      buyerCancelPenalty: buyerCancelPenalty.toString(),
      offerFees: OfferFees.fromStruct(offerFees),
      agentId: agentId.toString(),
      agentAddress,
      exchangeToken,
      finalizedDate: finalizedDate.toString(),
      condition: Condition.fromStruct(condition),
      comittedDate: comittedDate.toString(),
      redeemedDate: redeemedDate.toString(),
      voucherExpired,
      disputeResolverId: disputeResolverId.toString(),
      disputeResolverOperatorAddress,
      disputedDate: disputedDate.toString(),
      escalatedDate: escalatedDate.toString(),
      disputeState,
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
      this.exchangeId.toString(),
      this.offerId.toString(),
      this.buyerId.toString(),
      this.buyerAddress,
      this.sellerId.toString(),
      this.sellerOperatorAddress,
      this.price.toString(),
      this.sellerDeposit.toString(),
      this.buyerCancelPenalty.toString(),
      this.offerFees.toStruct(),
      this.agentId.toString(),
      this.agentAddress,
      this.exchangeToken,
      this.finalizedDate.toString(),
      this.condition.toStruct(),
      this.committedDate.toString(),
      this.redeemedDate.toString(),
      this.voucherExpired,
      this.disputeResolverId.toString(),
      this.disputeResolverOperatorAddress,
      this.disputedDate.toString(),
      this.escalatedDate.toString(),
      this.disputeState,
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
   * Is this Receipt instance's exchangeId field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  exchangeIdIsValid() {
    return bigNumberNonZeroIsValid(this.exchangeId);
  }

  /**
   * Is this Receipt instance's offerId field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  offerIdIsValid() {
    return bigNumberNonZeroIsValid(this.offerId);
  }

  /**
   * Is this Receipt instance's buyerId field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  buyerIdIsValid() {
    return bigNumberNonZeroIsValid(this.buyerId);
  }

  /**
   * Is this Receipt instance's buyerAddress field valid?
   * Must be a eip55 compliant Ethereum address
   * @returns {boolean}
   */
  buyerAddressIsValid() {
    return addressIsValid(this.buyerAddress);
  }

  /**
   * Is this Receipt instance's sellerId field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  sellerIdIsValid() {
    return bigNumberNonZeroIsValid(this.sellerId);
  }

  /**
   * Is this Receipt instance's sellerOperatorAddress field valid?
   * Must be a eip55 compliant Ethereum address
   * @returns {boolean}
   */
  sellerOperatorAddressIsValid() {
    return addressIsValid(this.sellerOperatorAddress);
  }

  /**
   * Is this Receipt instance's price field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  priceIsValid() {
    return bigNumberIsValid(this.price);
  }

  /**
   * Is this Receipt instance's sellerDeposit field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  sellerDepositIsValid() {
    return bigNumberIsValid(this.sellerDeposit);
  }

  /**
   * Is this Receipt instance's buyerCancelPenalty field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  buyerCancelPenaltyIsValid() {
    return bigNumberIsValid(this.buyerCancelPenalty);
  }

  /**
   * Is this Receipt instance's offerFees field valid?
   * Must be a valid OfferFees instance
   * @returns {boolean}
   */
  offerFeesIsValid() {
    let valid = false;
    let { offerFees } = this;
    try {
      valid = typeof offerFees == "object" && offerFees.isValid();
    } catch (e) {}
    return valid;
  }

  /**
   * Is this Receipt instance's agentId field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  agentIdIsValid() {
    return bigNumberIsValid(this.agentId);
  }

  /**
   * Is this Receipt instance's agentAddress field valid?
   * Must be a eip55 compliant Ethereum address
   * @returns {boolean}
   */
  agentAddressIsValid() {
    return addressIsValid(this.agentAddress);
  }

  /**
   * Is this Receipt instance's exchangeToken field valid?
   * Must be a eip55 compliant Ethereum address
   * @returns {boolean}
   */
  exchangeTokenIsValid() {
    return addressIsValid(this.exchangeToken);
  }

  /**
   * Is this Receipt instance's finalizedDate field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  finalizedDateIsValid() {
    return bigNumberIsValid(this.finalizedDate);
  }

  /**
   * Is this Receipt instance's condition field valid?
   * Must be a valid Condition instance
   * @returns {boolean}
   */
  conditionIsValid() {
    let valid = false;
    let { condition } = this;
    try {
      valid = typeof condition == "object" && condition.isValid();
    } catch (e) {}
    return valid;
  }

  /**
   * Is this Receipt instance's committedDate field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  committedDateIsValid() {
    return bigNumberNonZeroIsValid(this.committedDate);
  }

  /**
   * Is this Receipt instance's redeemedDate field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  redeemedDateIsValid() {
    return bigNumberIsValid(this.redeemedDate);
  }

  /**
   * Is this Exchange instance's voucherExpired field valid?
   * @returns {boolean}
   */
  voucherExpiredIsValid() {
    return booleanIsValid(this.voucherExpired);
  }

  /**
   * Is this Receipt instance's disputeResolverId field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  disputeResolverIdIsValid() {
    return bigNumberIsValid(this.disputeResolverId);
  }

  /**
   * Is this Receipt instance's disputeResolverOperator field valid?
   * Must be a eip55 compliant Ethereum address
   * @returns {boolean}
   */
  disputeResolverOperatorAddressIsValid() {
    return addressIsValid(this.disputeResolverOperatorAddress);
  }

  /**
   * Is this Receipt instance's disputedDate field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  disputedDateIsValid() {
    return bigNumberIsValid(this.disputedDate);
  }

  /**
   * Is this Receipt instance's escaltedDate field valid?
   * Must be a string representation of a big number
   * @returns {boolean}
   */
  escalatedDateIsValid() {
    return bigNumberIsValid(this.escalatedDate);
  }

  /**
   * Is this Receipt instance's disputeState field valid?
   * Must be a number representation of a big number
   * @returns {boolean}
   */
  disputeStateIsValid() {
    return enumIsValid(this.disputeState);
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
          valid = true;
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
    return (
      this.exchangeIdIsValid() &&
      this.offerIdIsValid() &&
      this.buyerIdIsValid() &&
      this.buyerAddressIsValid() &&
      this.sellerIdIsValid() &&
      this.sellerOperatorAddressIsValid() &&
      this.priceIsValid() &&
      this.sellerDepositIsValid() &&
      this.buyerCancelPenaltyIsValid() &&
      this.offerFeesIsValid() &&
      this.agentIdIsValid() &&
      this.agentAddressIsValid() &&
      this.exchangeTokenIsValid() &&
      this.finalizedDateIsValid() &&
      this.conditionIsValid() &&
      this.committedDateIsValid() &&
      this.redeemedDateIsValid() &&
      this.voucherExpiredIsValid() &&
      this.disputeResolverIdIsValid() &&
      this.disputeResolverOperatorAddressIsValid() &&
      this.disputedDateIsValid() &&
      this.escalatedDateIsValid() &&
      this.disputeStateIsValid() &&
      this.twinReceiptsIsValid()
    );
  }
}

// Export
module.exports = Receipt;
