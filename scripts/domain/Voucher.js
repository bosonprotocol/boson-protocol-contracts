const NODE = (typeof module !== 'undefined' && typeof module.exports !== 'undefined');
const ethers = require("ethers");

/**
 * Boson Protocol Domain Entity: Voucher
 *
 * See: {BosonTypes.Voucher}
 */
class Voucher {

    constructor (exchangeId, committedDate, redeemedDate) {
        this.exchangeId = exchangeId;
        this.committedDate = committedDate;
        this.redeemedDate = redeemedDate;
    }

    /**
     * Get a new Voucher instance from a pojo representation
     * @param o
     * @returns {Voucher}
     */
    static fromObject(o) {
        const {exchangeId, committedDate, redeemedDate} = o;
        return new Voucher(exchangeId, committedDate, redeemedDate);
    }

    /**
     * Get a new Voucher instance from a returned struct representation
     * @param struct
     * @returns {*}
     */
    static fromStruct( struct ) {

        let exchangeId,
            committedDate,
            redeemedDate;

        // destructure struct
        [   exchangeId,
            committedDate,
            redeemedDate
        ] = struct;

        return Voucher.fromObject(
            {
                exchangeId: exchangeId.toString(),
                committedDate: committedDate.toString(),
                redeemedDate: redeemedDate.toString()
            }
        );
    }

    /**
     * Get a database representation of this Voucher instance
     * @returns {object}
     */
    toObject() {
        return JSON.parse(this.toString());
    }

    /**
     * Get a string representation of this Voucher instance
     * @returns {string}
     */
    toString() {
        return JSON.stringify(this);
    }

    /**
     * Get a struct representation of this Voucher instance
     * @returns {string}
     */
    toStruct() {
        return [
            this.exchangeId,
            this.committedDate,
            this.redeemedDate
        ]
    }

    /**
     * Clone this Voucher
     * @returns {Voucher}
     */
    clone () {
        return Voucher.fromObject(this.toObject());
    }

    /**
     * Is this Voucher instance's exchangeId field valid?
     * Must be a string representation of a big number
     * @returns {boolean}
     */
    exchangeIdIsValid() {
        let valid = false;
        let {exchangeId} = this;
        try {
            valid = (
                typeof exchangeId === "string" &&
                typeof ethers.BigNumber.from(exchangeId) === "object"
            )
        } catch(e){}
        return valid;
    }

    /**
     * Is this Voucher instance's committedDate field valid?
     * Must be a string representation of a big number
     * @returns {boolean}
     */
    committedDateIsValid() {
        let valid = false;
        let {committedDate} = this;
        try {
            valid = (
                typeof committedDate === "string" &&
                typeof ethers.BigNumber.from(committedDate) === "object"
            )
        } catch(e){}
        return valid;
    }

    /**
     * Is this Voucher instance's redeemedDate field valid?
     * Must be a string representation of a big number
     * @returns {boolean}
     */
    redeemedDateIsValid() {
        let valid = false;
        let {redeemedDate} = this;
        try {
            valid = (
                typeof redeemedDate === "string" &&
                typeof ethers.BigNumber.from(redeemedDate) === "object"
            )
        } catch(e){}
        return valid;
    }

    /**
     * Is this Voucher instance valid?
     * @returns {boolean}
     */
    isValid() {
        return (
            this.exchangeIdIsValid() &&
            this.committedDateIsValid() &&
            this.redeemedDateIsValid()
        );
    };

}

// Export
if (NODE) {
    module.exports = Voucher;
} else {
    // Namespace the export in browsers
    if (window) {
        if (!window.Boson) window.Boson = {};
        window.Boson.Voucher = Voucher;
    }
}
