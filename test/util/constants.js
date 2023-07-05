const environments = require("../../environments");

// Some periods in seconds
const oneDay = 86400n; //  1 day in seconds
const ninetyDays = oneDay * 90n; // 90 days in seconds
const oneWeek = oneDay * 7n; // 7 days in seconds
const oneMonth = oneDay * 31n; // 31 days in seconds
const VOUCHER_NAME = "Boson Voucher (rNFT)";
const VOUCHER_SYMBOL = "BOSON_VOUCHER_RNFT";
const SEAPORT_ADDRESS = "0x00000000000001ad428e4906aE43D8F9852d0dD6"; // 1.4
const tipMultiplier = BigInt(environments.tipMultiplier);
const tipSuggestion = "1500000000"; // ethers.js always returns this constant, it does not vary per block
const maxPriorityFeePerGas = BigInt(tipSuggestion) * tipMultiplier;

exports.oneDay = oneDay;
exports.ninetyDays = ninetyDays;
exports.oneWeek = oneWeek;
exports.oneMonth = oneMonth;
exports.VOUCHER_NAME = VOUCHER_NAME;
exports.VOUCHER_SYMBOL = VOUCHER_SYMBOL;
exports.maxPriorityFeePerGas = maxPriorityFeePerGas;
exports.SEAPORT_ADDRESS = SEAPORT_ADDRESS;
