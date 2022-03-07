const NODE = (typeof module !== 'undefined' && typeof module.exports !== 'undefined');
const ethers = require("ethers");

/**
 * Boson Protocol Domain Entity: Voucher
 *
 * See: {BosonTypes.Voucher}
 */
class Voucher {

    constructor (exchangeId) {
        this.exchangeId = exchangeId;
    }

    /**
     * Get a new Voucher instance from a pojo representation
     * @param o
     * @returns {Voucher}
     */
    static fromObject(o) {
        const {exchangeId} = o;
        return new Voucher(exchangeId);
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
     * Is this Voucher instance valid?
     * @returns {boolean}
     */
    isValid() {
        return (
            this.exchangeIdIsValid() // &&
            // ...
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