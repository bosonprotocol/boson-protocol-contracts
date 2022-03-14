const NODE = (typeof module !== 'undefined' && typeof module.exports !== 'undefined');
const ethers = require("ethers");
const eip55 = require("eip55");

/**
 * Boson Protocol Domain Entity: Twin
 *
 * See: {BosonTypes.Twin}
 */
class Twin {

    /*
        struct Twin {
            uint256 id;
            uint256 sellerId;
            uint256 supplyAvailable; // ERC-1155 / ERC-20
            uint256[] supplyIds;     // ERC-721
            uint256 tokenId;         // ERC-1155
            address tokenAddress;    // all
        }
    */

    constructor (id, sellerId, supplyAvailable, supplyIds, tokenId, tokenAddress) {
        this.id = id;
        this.sellerId = sellerId;
        this.supplyAvailable = supplyAvailable;
        this.supplyIds = supplyIds;
        this.tokenId = tokenId;
        this.tokenAddress = tokenAddress;
    }

    /**
     * Get a new Twin instance from a pojo representation
     * @param o
     * @returns {Twin}
     */
    static fromObject(o) {
        const {id, sellerId, supplyAvailable, supplyIds, tokenId, tokenAddress} = o;
        return new Twin(id, sellerId, supplyAvailable, supplyIds, tokenId, tokenAddress);
    }

    /**
     * Get a database representation of this Twin instance
     * @returns {object}
     */
    toObject() {
        return JSON.parse(this.toString());
    }

    /**
     * Get a string representation of this Twin instance
     * @returns {string}
     */
    toString() {
        return JSON.stringify(this);
    }

    /**
     * Clone this Twin
     * @returns {Twin}
     */
    clone () {
        return Twin.fromObject(this.toObject());
    }

    /**
     * Is this Twin instance's id field valid?
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
     * Is this Twin instance's sellerId field valid?
     * Must be a string representation of a big number
     * @returns {boolean}
     */
    sellerIdIsValid() {
        let valid = false;
        let {sellerId} = this;
        try {
            valid = (
                typeof sellerId === "string" &&
                typeof ethers.BigNumber.from(sellerId) === "object"
            )
        } catch(e){}
        return valid;
    }

    /**
     * Is this Twin instance's supplyAvailable field valid?
     * Must be a string representation of a big number
     * @returns {boolean}
     */
    supplyAvailableIsValid() {
        let valid = false;
        let {supplyAvailable} = this;
        try {
            valid = (
                typeof supplyAvailable === "string" &&
                typeof ethers.BigNumber.from(supplyAvailable) === "object"
            )
        } catch(e){}
        return valid;
    }

    /**
     * Is this Twin instance's supplyIds field valid?
     * Must be an array of numbers
     * @returns {boolean}
     */
    supplyIdsIsValid() {
        let valid = false;
        let {supplyIds} = this;
        try {
            const supplyIdsIsArray = Array.isArray(supplyIds);
            if (supplyIdsIsArray) {
                supplyIds.forEach((supplyId) => {
                    valid = (
                        typeof supplyId === "string" &&
                        typeof ethers.BigNumber.from(supplyId) === "object"
                    )
                })
            }
        } catch(e){}
        return valid;
    }

    /**
     * Is this Twin instance's tokenId field valid?
     * Must be a string representation of a big number
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
     * Is this Twin instance's tokenAddress field valid?
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
     * Is this Twin instance valid?
     * @returns {boolean}
     */
    isValid() {
        return (
            this.idIsValid() &&
            this.sellerIdIsValid() &&
            this.supplyAvailableIsValid() &&
            this.supplyIdsIsValid() &&
            this.tokenIdIsValid() &&
            this.tokenAddressIsValid()
        );
    };

}

// Export
if (NODE) {
    module.exports = Twin;
} else {
    // Namespace the export in browsers
    if (window) {
        if (!window.Boson) window.Boson = {};
        window.Boson.Twin = Twin;
    }
}
