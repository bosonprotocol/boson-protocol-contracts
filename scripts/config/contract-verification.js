/**
 * List of contracts to verify on explorer, using verify-suite script
 *
 * Process:
 *  1.  Edit scripts/config/contract-verification.js. Addresses will be pulled from /addresses/<chainId>-<network>.json
 *  1a. If you want to verify all contracts, leave contractList empty
 *  1b. If you want to verify only a subset of contracts, specify them in contractList.
 *      Use names of actual implementations, not interfaces.
 *  2. Run the appropriate npm script in package.json to verify contracts for a given network and environment.
 *
 * Example:
 * contractList = ["BuyerHandlerFacet","TwinHandlerFacet"]
 */
exports.contractList = ["ConfigHandlerFacet"];
