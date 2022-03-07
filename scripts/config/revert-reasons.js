/**
 * Reasons for Boson Protocol transactions to revert
 */
exports.RevertReasons = {

    // Facet initializer related
    ALREADY_INITIALIZED: "Already initialized",

    // Offer related
    NOT_SELLER: "Not seller",
    NO_SUCH_OFFER: "No such offer",
    OFFER_ALREADY_VOIDED: "Offer already voided",
    OFFER_PERIOD_INVALID: "Offer period invalid"
}