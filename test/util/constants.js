// Some periods in seconds
const oneDay = 86400n; //  1 day in seconds
const ninetyDays = oneDay * 90n; // 90 days in seconds
const oneWeek = oneDay * 7n; // 7 days in seconds
const oneMonth = oneDay * 31n; // 31 days in seconds
const VOUCHER_NAME = "Boson Voucher (rNFT)";
const VOUCHER_SYMBOL = "BOSON_VOUCHER_RNFT";
const DEFAULT_ROYALTY_RECIPIENT = "Treasury";

const SEAPORT_ADDRESS = "0x00000000000001ad428e4906aE43D8F9852d0dD6"; // 1.4
const ROYALTY_REGISTRY_ADDRESS = "0xe7c9Cb6D966f76f3B5142167088927Bf34966a1f";
const ROYALTY_ENGINE_ADDRESS = "0x28EdFcF0Be7E86b07493466e7631a213bDe8eEF2";
const SEAPORT_ADDRESS_4 = "0x00000000000001ad428e4906aE43D8F9852d0dD6"; // 1.4
const SEAPORT_ADDRESS_5 = "0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC"; // 1.5

const tipMultiplier = 1n; // use 1 in tests
const tipSuggestion = 1500000000n; // ethers.js always returns this constant, it does not vary per block
const maxPriorityFeePerGas = tipSuggestion * tipMultiplier;

exports.oneDay = oneDay;
exports.ninetyDays = ninetyDays;
exports.oneWeek = oneWeek;
exports.oneMonth = oneMonth;
exports.VOUCHER_NAME = VOUCHER_NAME;
exports.VOUCHER_SYMBOL = VOUCHER_SYMBOL;
exports.maxPriorityFeePerGas = maxPriorityFeePerGas;
exports.DEFAULT_ROYALTY_RECIPIENT = DEFAULT_ROYALTY_RECIPIENT;
exports.ROYALTY_REGISTRY_ADDRESS = ROYALTY_REGISTRY_ADDRESS;
exports.ROYALTY_ENGINE_ADDRESS = ROYALTY_ENGINE_ADDRESS;
exports.SEAPORT_ADDRESS = SEAPORT_ADDRESS;
exports.SEAPORT_ADDRESS_4 = SEAPORT_ADDRESS_4;
exports.SEAPORT_ADDRESS_5 = SEAPORT_ADDRESS_5;
