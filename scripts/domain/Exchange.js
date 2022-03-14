const NODE = (typeof module !== 'undefined' && typeof module.exports !== 'undefined');
const ethers = require("ethers");

/**
 * Boson Protocol Domain Entity: Exchange
 *
 * See: {BosonTypes.Exchange}
 */
class Exchange {

    constructor (id, offerId) {
        this.id = id;
        this.offerId = offerId;
    }

    /**
     * Get a new Exchange instance from a pojo representation
     * @param o
     * @returns {Exchange}
     */
    static fromObject(o) {
        const {id, offerId} = o;
        return new Exchange(id, offerId);
    }

    /**
     * Get a new Exchange instance from a returned struct representation
     * @param struct
     * @returns {*}
     */
    static fromStruct( struct ) {

        let id,
            offerId;

        // destructure struct
        [   id,
            offerId
        ] = struct;

        return Exchange.fromObject(
            {
                id: id.toString(),
                offerId: offerId.toString()
            }
        );
    }

    /**
     * Get a database representation of this Exchange instance
     * @returns {object}
     */
    toObject() {
        return JSON.parse(this.toString());
    }

    /**
     * Get a string representation of this Exchange instance
     * @returns {string}
     */
    toString() {
        return JSON.stringify(this);
    }

    /**
     * Get a struct representation of this Exchange instance
     * @returns {string}
     */
    toStruct() {
        return [
            this.id,
            this.offerId
        ]
    }

    /**
     * Clone this Exchange
     * @returns {Exchange}
     */
    clone () {
        return Exchange.fromObject(this.toObject());
    }

    /**
     * Is this Exchange instance's id field valid?
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
     * Is this Exchange instance's offerId field valid?
     * Must be a string representation of a big number
     * @returns {boolean}
     */
    offerIdIsValid() {
        let valid = false;
        let {offerId} = this;
        try {
            valid = (
                typeof offerId === "string" &&
                typeof ethers.BigNumber.from(offerId) === "object"
            )
        } catch(e){}
        return valid;
    }

    /**
     * Is this Exchange instance valid?
     * @returns {boolean}
     */
    isValid() {
        return (
            this.idIsValid() &&
            this.offerIdIsValid() // &&
            // ...
        );
    };

}

// Export
if (NODE) {
    module.exports = Exchange;
} else {
    // Namespace the export in browsers
    if (window) {
        if (!window.Boson) window.Boson = {};
        window.Boson.Exchange = Exchange;
    }
}