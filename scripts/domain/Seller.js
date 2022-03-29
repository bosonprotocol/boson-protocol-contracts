const NODE = (typeof module !== 'undefined' && typeof module.exports !== 'undefined');
const ethers = require("ethers");
const eip55 = require("eip55");

/**
 * Boson Protocol Domain Entity: Seller
 *
 * See: {BosonTypes.Seller}
 */
class Seller {

    /*
        struct Seller {
            uint256 id;
            address operator;
            address admin;
            address clerk;
            address payable treasury;
            bool active;
        }
    */

    constructor (id, operator, admin, clerk, treasury, active) {
        this.id = id;
        this.operator = operator;
        this.admin = admin;
        this.clerk = clerk;
        this.treasury = treasury;
        this.active = active;
    }

    /**
     * Get a new Seller instance from a pojo representation
     * @param o
     * @returns {Seller}
     */
    static fromObject(o) {
        const {id, operator, admin, clerk, treasury, active} = o;
        return new Seller(id, operator, admin, clerk, treasury, active);
    }

    /**
     * Get a new Seller instance from a returned struct representation
     * @param struct
     * @returns {*}
     */
     static fromStruct( struct ) {

        let id,
            operator,
            admin,
            clerk,
            treasury,
            active;

        // destructure struct
        [   id,
            operator,
            admin,
            clerk,
            treasury,
            active
        ] = struct;

        return Seller.fromObject(
            {
                id: id.toString(),
                operator,
                admin,
                clerk,
                treasury,
                active
            }
        );
    }

    /**
     * Get a database representation of this Seller instance
     * @returns {object}
     */
    toObject() {
        return JSON.parse(this.toString());
    }

    /**
     * Get a string representation of this Seller instance
     * @returns {string}
     */
    toString() {
        return JSON.stringify(this);
    }

    /**
     * Get a struct representation of this Seller instance
     * @returns {string}
     */
    toStruct() {
        return[
            this.id,
            this.operator,
            this.admin,
            this.clerk,
            this.treasury,
            this.active
        ]
    }

    /**
     * Clone this Seller
     * @returns {Seller}
     */
    clone () {
        return Seller.fromObject(this.toObject());
    }

    /**
     * Is this Seller instance's id field valid?
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
     * Is this Seller instance's operator field valid?
     * Must be a eip55 compliant Ethereum address
     * @returns {boolean}
     */
    operatorIsValid() {
        let valid = false;
        let {operator} = this;
        try {
            valid = (
                eip55.verify(eip55.encode(operator))
            )
        } catch(e){}
        return valid;
    }

    /**
     * Is this Seller instance's admin field valid?
     * Must be a eip55 compliant Ethereum address
     * @returns {boolean}
     */
    adminIsValid() {
        let valid = false;
        let {admin} = this;
        try {
            valid = (
                eip55.verify(eip55.encode(admin))
            )
        } catch(e){}
        return valid;
    }

    /**
     * Is this Seller instance's clerk field valid?
     * Must be a eip55 compliant Ethereum address
     * @returns {boolean}
     */
    clerkIsValid() {
        let valid = false;
        let {clerk} = this;
        try {
            valid = (
                eip55.verify(eip55.encode(clerk))
            )
        } catch(e){}
        return valid;
    }

    /**
     * Is this Seller instance's treasury field valid?
     * Must be a eip55 compliant Ethereum address
     * @returns {boolean}
     */
    treasuryIsValid() {
        let valid = false;
        let {treasury} = this;
        try {
            valid = (
                eip55.verify(eip55.encode(treasury))
            )
        } catch(e){}
        return valid;
    }

    /**
     * Is this Seller instance's active field valid?
     * @returns {boolean}
     */
    activeIsValid() {
        let valid = false;
        let {active} = this;
        try {
            valid = (
                typeof active === "boolean"
            );
        } catch (e) {}
        return valid;
    }

    /**
     * Is this Seller instance valid?
     * @returns {boolean}
     */
    isValid() {
        return (
            this.idIsValid() &&
            this.operatorIsValid() &&
            this.adminIsValid() &&
            this.clerkIsValid() &&
            this.treasuryIsValid() &&
            this.activeIsValid()
        );
    };

}

// Export
if (NODE) {
    module.exports = Seller;
} else {
    // Namespace the export in browsers
    if (window) {
        if (!window.Boson) window.Boson = {};
        window.Boson.Seller = Seller;
    }
}
