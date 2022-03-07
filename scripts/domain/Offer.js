const NODE = (typeof module !== 'undefined' && typeof module.exports !== 'undefined');
const ethers = require("ethers");
const eip55 = require("eip55");

/**
 * Boson Protocol Domain Entity: Offer
 *
 * See: {BosonTypes.Offer}
 */
class Offer {

    /*
        struct Offer {
            uint256 id;
            uint256 price;
            uint256 deposit;
            uint256 penalty;
            uint256 quantity;
            uint256 validFromDate;
            uint256 validUntilDate;
            uint256 redeemableDate;
            uint256 fulfillmentPeriodDuration;
            uint256 voucherValidDuration;
            address payable seller;
            address exchangeToken;
            string metadataUri;
            string metadataHash;
            bool voided;
        }
    */

    constructor (
            id,
            price,
            deposit,
            penalty,
            quantity,
            validFromDate,
            validUntilDate,
            redeemableDate,
            fulfillmentPeriodDuration,
            voucherValidDuration,
            seller,
            exchangeToken,
            metadataUri,
            metadataHash,
            voided
        ) {
        this.id = id;
        this.price = price;
        this.deposit = deposit;
        this.penalty = penalty;
        this.quantity = quantity;
        this.validFromDate = validFromDate;
        this.validUntilDate = validUntilDate;
        this.redeemableDate = redeemableDate;
        this.voucherValidDuration = voucherValidDuration;
        this.fulfillmentPeriodDuration = fulfillmentPeriodDuration;
        this.seller = seller;
        this.exchangeToken = exchangeToken;
        this.metadataUri = metadataUri;
        this.metadataHash = metadataHash;
        this.voided = voided;
    }

    /**
     * Get a new Offer instance from a pojo representation
     * @param o
     * @returns {Offer}
     */
    static fromObject(o) {
        const {
            id,
            price,
            deposit,
            penalty,
            quantity,
            validFromDate,
            validUntilDate,
            redeemableDate,
            fulfillmentPeriodDuration,
            voucherValidDuration,
            seller,
            exchangeToken,
            metadataUri,
            metadataHash,
            voided
        } = o;

        return new Offer(
            id,
            price,
            deposit,
            penalty,
            quantity,
            validFromDate,
            validUntilDate,
            redeemableDate,
            fulfillmentPeriodDuration,
            voucherValidDuration,
            seller,
            exchangeToken,
            metadataUri,
            metadataHash,
            voided
        );
    }

    /**
     * Get a new Offer instance from a returned struct representation
     * @param struct
     * @returns {*}
     */
    static fromStruct( struct ) {

        let id,
            price,
            deposit,
            penalty,
            quantity,
            validFromDate,
            validUntilDate,
            redeemableDate,
            fulfillmentPeriodDuration,
            voucherValidDuration,
            seller,
            exchangeToken,
            metadataUri,
            metadataHash,
            voided;

        // destructure struct
        [   id,
            price,
            deposit,
            penalty,
            quantity,
            validFromDate,
            validUntilDate,
            redeemableDate,
            fulfillmentPeriodDuration,
            voucherValidDuration,
            seller,
            exchangeToken,
            metadataUri,
            metadataHash,
            voided
        ] = struct;

        return Offer.fromObject(
            {
                id: id.toString(),
                price: price.toString(),
                deposit: deposit.toString(),
                penalty: penalty.toString(),
                quantity: quantity.toString(),
                validFromDate: validFromDate.toString(),
                validUntilDate: validUntilDate.toString(),
                redeemableDate: redeemableDate.toString(),
                fulfillmentPeriodDuration: fulfillmentPeriodDuration.toString(),
                voucherValidDuration: voucherValidDuration.toString(),
                seller,
                exchangeToken,
                metadataUri,
                metadataHash,
                voided
            }
        );

    }

    /**
     * Get a database representation of this Offer instance
     * @returns {object}
     */
    toObject() {
        return JSON.parse(this.toString());
    }

    /**
     * Get a string representation of this Offer instance
     * @returns {string}
     */
    toString() {
        return JSON.stringify(this);
    }

    /**
     * Get a struct representation of this Offer instance
     * @returns {string}
     */
    toStruct() {
        return[
            this.id,
            this.price,
            this.deposit,
            this.penalty,
            this.quantity,
            this.validFromDate,
            this.validUntilDate,
            this.redeemableDate,
            this.fulfillmentPeriodDuration,
            this.voucherValidDuration,
            this.seller,
            this.exchangeToken,
            this.metadataUri,
            this.metadataHash,
            this.voided
        ]



    }

    /**
     * Clone this Offer
     * @returns {Offer}
     */
    clone () {
        return Offer.fromObject(this.toObject());
    }

    /**
     * Is this Offer instance's id field valid?
     * Must be a string representation of a big number
     * @returns {boolean}
     */
    idIsValid() {
        let valid = false;
        let {id} = this;
        try {
            valid = (
                typeof id === "string" &&
                typeof ethers.BigNumber.from(id) === "object"
            )
        } catch(e){}
        return valid;
    }

    /**
     * Is this Offer instance's price field valid?
     * Must be a string representation of a big number
     * @returns {boolean}
     */
    priceIsValid() {
        let valid = false;
        let {price} = this;
        try {
            valid = (
                typeof price === "string" &&
                typeof ethers.BigNumber.from(price) === "object"
            )
        } catch(e){}
        return valid;
    }

    /**
     * Is this Offer instance's deposit field valid?
     * Must be a string representation of a big number
     * @returns {boolean}
     */
    depositIsValid() {
        let valid = false;
        let {deposit} = this;
        try {
            valid = (
                typeof deposit === "string" &&
                typeof ethers.BigNumber.from(deposit) === "object"
            )
        } catch(e){}
        return valid;
    }

    /**
     * Is this Offer instance's penalty field valid?
     * Must be a string representation of a big number
     * @returns {boolean}
     */
    penaltyIsValid() {
        let valid = false;
        let {penalty} = this;
        try {
            valid = (
                typeof penalty === "string" &&
                typeof ethers.BigNumber.from(penalty) === "object"
            )
        } catch(e){}
        return valid;
    }

    /**
     * Is this Offer instance's quantity field valid?
     * Must be a string representation of a big number
     * @returns {boolean}
     */
    quantityIsValid() {
        let valid = false;
        let {quantity} = this;
        try {
            valid = (
                typeof quantity === "string" &&
                typeof ethers.BigNumber.from(quantity) === "object"
            )
        } catch(e){}
        return valid;
    }

    /**
     * Is this Offer instance's validFromDate field valid?
     * Must be a string representation of a big number
     * TODO: make sure it's time within a reasonable range?
     * @returns {boolean}
     */
    validFromDateIsValid() {
        let valid = false;
        let {validFromDate} = this;
        try {
            valid = (
                typeof validFromDate === "string" &&
                typeof ethers.BigNumber.from(validFromDate) === "object"
            )
        } catch(e){}
        return valid;
    }

    /**
     * Is this Offer instance's validUntilDate field valid?
     * Must be a string representation of a big number
     * TODO: make sure it's time within a reasonable range?
     * @returns {boolean}
     */
    validUntilDateIsValid() {
        let valid = false;
        let {validUntilDate} = this;
        try {
            valid = (
                typeof validUntilDate === "string" &&
                typeof ethers.BigNumber.from(validUntilDate) === "object"
            )
        } catch(e){}
        return valid;
    }

    /**
     * Is this Offer instance's redeemableDate field valid?
     * Must be a string representation of a big number
     * TODO: make sure it's time within a reasonable range?
     * @returns {boolean}
     */
    redeemableDateIsValid() {
        let valid = false;
        let {redeemableDate} = this;
        try {
            valid = (
                typeof redeemableDate === "string" &&
                typeof ethers.BigNumber.from(redeemableDate) === "object"
            )
        } catch(e){}
        return valid;
    }

    /**
     * Is this Offer instance's fulfillmentPeriodDuration field valid?
     * Must be a string representation of a big number
     * @returns {boolean}
     */
    fulfillmentPeriodDurationIsValid() {
        let valid = false;
        let {fulfillmentPeriodDuration} = this;
        try {
            valid = (
                typeof fulfillmentPeriodDuration === "string" &&
                typeof ethers.BigNumber.from(fulfillmentPeriodDuration) === "object"
            )
        } catch(e){}
        return valid;
    }

    /**
     * Is this Offer instance's voucherValidDuration field valid?
     * Must be a string representation of a big number
     * TODO: make sure it's time within a reasonable range?
     * @returns {boolean}
     */
    voucherValidDurationIsValid() {
        let valid = false;
        let {voucherValidDuration} = this;
        try {
            valid = (
                typeof voucherValidDuration === "string" &&
                typeof ethers.BigNumber.from(voucherValidDuration) === "object"
            )
        } catch(e){}
        return valid;
    }

    /**
     * Is this Offer instance's seller field valid?
     * Must be a string repesenting an eip55 compliant Ethereum address
     * @returns {boolean}
     */
    sellerIsValid() {
        let valid = false;
        let {seller} = this;
        try {
            valid = (
                eip55.verify(eip55.encode(seller))
            )
        } catch(e){}
        return valid;
    }

    /**
     * Is this Offer instance's exchangeToken field valid?
     * Must be a eip55 compliant Ethereum address
     * Use "0x000.." for chain base currency, e.g., ETH
     *
     * @returns {boolean}
     */
    exchangeTokenIsValid() {
        let valid = false;
        let {exchangeToken} = this;
        try {
            valid = (
                eip55.verify(eip55.encode(exchangeToken))
            )
        } catch(e){}
        return valid;
    }

    /**
     * Is this Offer instance's metadataUri field valid?
     * Always present, must be a string
     *
     * @returns {boolean}
     */
    metadataUriIsValid() {
        let valid = false;
        let {metadataUri} = this;
        try {
            valid = (
                typeof metadataUri === "string"
            )
        } catch(e){}
        return valid;
    }

    /**
     * Is this Offer instance's metadataHash field valid?
     * Always present, must be a string
     *
     * @returns {boolean}
     */
    metadataHashIsValid() {
        let valid = false;
        let {metadataHash} = this;
        try {
            valid = (
                typeof metadataHash === "string"
            )
        } catch(e){}
        return valid;
    }

    /**
     * Is this Offer instance's voided field valid?
     * @returns {boolean}
     */
    voidedIsValid() {
        let valid = false;
        let {voided} = this;
        try {
            valid = (
                typeof voided === "boolean"
            );
        } catch (e) {}
        return valid;
    }

    /**
     * Is this Offer instance valid?
     * @returns {boolean}
     */
    isValid() {
        return (
            this.idIsValid() &&
            this.priceIsValid() &&
            this.depositIsValid() &&
            this.penaltyIsValid() &&
            this.quantityIsValid() &&
            this.validFromDateIsValid() &&
            this.validUntilDateIsValid() &&
            this.redeemableDateIsValid() &&
            this.fulfillmentPeriodDurationIsValid() &&
            this.voucherValidDurationIsValid() &&
            this.sellerIsValid() &&
            this.exchangeTokenIsValid() &&
            this.metadataUriIsValid() &&
            this.metadataHashIsValid() &&
            this.voidedIsValid()
        );
    };

}

// Export
if (NODE) {
    module.exports = Offer;
} else {
    // Namespace the export in browsers
    if (window) {
        if (!window.Boson) window.Boson = {};
        window.Boson.Offer = Offer;
    }
}