const NODE = (typeof module !== 'undefined' && typeof module.exports !== 'undefined');
const ethers = require("ethers");

/**
 * Boson Protocol Domain Entity: Dispute
 *
 * See: {BosonTypes.Dispute}
 */
class Dispute {

    constructor (exchangeId) {
        this.exchangeId = exchangeId;
    }

    /**
     * Get a new Dispute instance from a pojo representation
     * @param o
     * @returns {Dispute}
     */
    static fromObject(o) {
        const {exchangeId} = o;
        return new Dispute(exchangeId);
    }

    /**
     * Get a database representation of this Dispute instance
     * @returns {object}
     */
    toObject() {
        return JSON.parse(this.toString());
    }

    /**
     * Get a string representation of this Dispute instance
     * @returns {string}
     */
    toString() {
        return JSON.stringify(this);
    }

    /**
     * Clone this Dispute
     * @returns {Dispute}
     */
    clone () {
        return Dispute.fromObject(this.toObject());
    }

    /**
     * Is this Dispute instance's exchangeId field valid?
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
     * Is this Dispute instance valid?
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
    module.exports = Dispute;
} else {
    // Namespace the export in browsers
    if (window) {
        if (!window.Boson) window.Boson = {};
        window.Boson.Dispute = Dispute;
    }
}