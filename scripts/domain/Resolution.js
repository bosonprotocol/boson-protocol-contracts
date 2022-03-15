const NODE = (typeof module !== 'undefined' && typeof module.exports !== 'undefined');
const ethers = require("ethers");

/**
 * Boson Protocol Domain Entity: Resolution
 *
 * See: {BosonTypes.Resolution}
 */
class Resolution {

    constructor (buyerPercent) {
        this.buyerPercent = buyerPercent;
    }

    /**
     * Get a new Resolution instance from a pojo representation
     * @param o
     * @returns {Resolution}
     */
    static fromObject(o) {
        const {buyerPercent} = o;
        return new Resolution(buyerPercent);
    }

    /**
     * Get a new Resolution instance from a returned struct representation
     * @param struct
     * @returns {*}
     */
    static fromStruct( struct ) {

        let buyerPercent;

        // destructure struct
        [
            buyerPercent
        ] = struct;

        return Resolution.fromObject(
            {
                buyerPercent: buyerPercent.toString()
            }
        );
    }

    /**
     * Get a database representation of this Resolution instance
     * @returns {object}
     */
    toObject() {
        return JSON.parse(this.toString());
    }

    /**
     * Get a string representation of this Resolution instance
     * @returns {string}
     */
    toString() {
        return JSON.stringify(this);
    }

    /**
     * Get a struct representation of this Resolution instance
     * @returns {string}
     */
    toStruct() {
        return [
            this.buyerPercent
        ]
    }

    /**
     * Clone this Resolution
     * @returns {Resolution}
     */
    clone () {
        return Resolution.fromObject(this.toObject());
    }

    /**
     * Is this Resolution instance's buyerPercent field valid?
     * Must be a string representation of a big number
     * Must be between 0 and 10000 (0% - 100%)
     * @returns {boolean}
     */
    buyerPercentIsValid() {
        let valid = false;
        let {buyerPercent} = this;
        try {
            valid = (
                typeof buyerPercent === "string" &&
                typeof ethers.BigNumber.from(buyerPercent) === "object" &&
                Number(buyerPercent) >= 0 &&
                Number(buyerPercent) <= 10000
            )
        } catch(e){}
        return valid;
    }

    /**
     * Is this Resolution instance valid?
     * @returns {boolean}
     */
    isValid() {
        return (
            this.buyerPercentIsValid() // &&
            // ...
        );
    };

}

// Export
if (NODE) {
    module.exports = Resolution;
} else {
    // Namespace the export in browsers
    if (window) {
        if (!window.Boson) window.Boson = {};
        window.Boson.Resolution = Resolution;
    }
}
