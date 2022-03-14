const NODE = (typeof module !== 'undefined' && typeof module.exports !== 'undefined');
const ethers = require("ethers");

/**
 * Boson Protocol Domain Entity: Dispute
 *
 * See: {BosonTypes.Dispute}
 */
class Dispute {

    constructor (exchangeId, complaint, state) {
        this.exchangeId = exchangeId;
        this.complaint = complaint;
        this.state = state;
    }

    /**
     * Get a new Dispute instance from a pojo representation
     * @param o
     * @returns {Dispute}
     */
    static fromObject(o) {
        const {exchangeId, complaint, state} = o;
        return new Dispute(exchangeId, complaint, state);
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
     * Is this Dispute instance's complaint field valid?
     * Must be a string
     * @returns {boolean}
     */
    complaintIsValid() {
        let valid = false;
        let {complaint} = this;
        try {
            valid = (
                typeof complaint === "string"
            )
        } catch(e){}
        return valid;
    }

    /**
     * Is this Dispute instance's state field valid?
     * Must be a number representation of a big number
     * @returns {boolean}
     */
    stateIsValid() {
        let valid = false;
        let {state} = this;
        try {
            valid = (
                typeof state === "number" &&
                typeof ethers.BigNumber.from(state) === "object"
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
            this.exchangeIdIsValid() &&
            this.complaintIsValid() &&
            this.stateIsValid() // &&
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
