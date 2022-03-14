const NODE = (typeof module !== 'undefined' && typeof module.exports !== 'undefined');
const ethers = require("ethers");
const eip55 = require("eip55");

/**
 * Boson Protocol Domain Entity: Condition
 *
 * See: {BosonTypes.Condition}
 */
class Condition {

    /*
        struct Condition {
            EvaluationMethod method;
            address tokenAddress;
            uint256 tokenId;
            uint256 threshold;
        }
    */

    constructor (method, tokenAddress, tokenId, threshold) {
        this.method = method;
        this.tokenAddress = tokenAddress;
        this.tokenId = tokenId;
        this.threshold = threshold;
    }

    /**
     * Get a new Condition instance from a pojo representation
     * @param o
     * @returns {Condition}
     */
    static fromObject(o) {
        const {method, tokenAddress, tokenId, threshold} = o;
        return new Condition(method, tokenAddress, tokenId, threshold);
    }

    /**
     * Get a new Condition instance from a returned struct representation
     * @param struct
     * @returns {*}
     */
     static fromStruct( struct ) {

        let method,
            tokenAddress,
            tokenId,
            threshold;

        // destructure struct
        [   method,
            tokenAddress,
            tokenId,
            threshold
        ] = struct;

        return Condition.fromObject(
            {
                method: parseInt(method),
                tokenAddress,
                tokenId,
                threshold
            }
        );
    }

    /**
     * Get a database representation of this Condition instance
     * @returns {object}
     */
    toObject() {
        return JSON.parse(this.toString());
    }

    /**
     * Get a string representation of this Condition instance
     * @returns {string}
     */
    toString() {
        return JSON.stringify(this);
    }

    /**
     * Get a struct representation of this Condition instance
     * @returns {string}
     */
    toStruct() {
        return [
            this.method,
            this.tokenAddress,
            this.tokenId,
            this.threshold
        ]
    }

    /**
     * Clone this Condition
     * @returns {Condition}
     */
    clone () {
        return Condition.fromObject(this.toObject());
    }

    /**
     * Is this Condition instance's method field valid?
     * Must be a number representation of a big number
     * @returns {boolean}
     */
    methodIsValid() {
        let valid = false;
        let {method} = this;
        try {
            valid = (
                typeof method === "number" &&
                typeof ethers.BigNumber.from(method) === "object"
            )
        } catch(e){}
        return valid;
    }

    /**
     * Is this Condition instance's tokenAddress field valid?
     * Must be a eip55 compliant Ethereum address
     * @returns {boolean}
     */
    tokenAddressIsValid() {
        let valid = false;
        let {tokenAddress} = this;
        try {
            valid = (
                eip55.verify(eip55.encode(tokenAddress))
            )
        } catch(e){}
        return valid;
    }

    /**
     * Is this Condition instance's tokenId field valid?
     * @returns {boolean}
     */
    tokenIdIsValid() {
        let valid = false;
        let {tokenId} = this;
        try {
            valid = (
                typeof tokenId === "string" &&
                typeof ethers.BigNumber.from(tokenId) === "object"
            )
        } catch(e){}
        return valid;
    }

    /**
     * Is this Condition instance's threshold field valid?
     * @returns {boolean}
     */
    thresholdIsValid() {
        let valid = false;
        let {threshold} = this;
        try {
            valid = (
                typeof threshold === "string" &&
                typeof ethers.BigNumber.from(threshold) === "object"
            )
        } catch(e){}
        return valid;
    }

    /**
     * Is this Condition instance valid?
     * @returns {boolean}
     */
    isValid() {
        return (
            this.methodIsValid() &&
            this.tokenAddressIsValid() &&
            this.tokenIdIsValid() &&
            this.thresholdIsValid()
        );
    };

}

// Export
if (NODE) {
    module.exports = Condition;
} else {
    // Namespace the export in browsers
    if (window) {
        if (!window.Boson) window.Boson = {};
        window.Boson.Condition = Condition;
    }
}
