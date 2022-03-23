/**
 * Reasons for Boson Protocol transactions to revert
 */
exports.RevertReasons = {

    // Facet initializer related
    ALREADY_INITIALIZED: "Already initialized",

    // Offer related
    NOT_OPERATOR: "Not seller's operator",
    NO_SUCH_OFFER: "No such offer",
    OFFER_ALREADY_VOIDED: "Offer already voided",
    OFFER_PERIOD_INVALID: "Offer period invalid",
    OFFER_PENALTY_INVALID : "Offer penalty invalid",
    OFFER_MUST_BE_ACTIVE : "Offer must be active",
    OFFER_NOT_UPDATEABLE: "Offer not updateable",
}