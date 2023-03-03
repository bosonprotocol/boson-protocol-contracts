const environments = require("../../environments");
const hre = require("hardhat");
const ethers = hre.ethers;

// Some periods in seconds
const oneDay = 86400; //  1 day in seconds
const ninetyDays = oneDay * 90; // 90 days in seconds
const oneWeek = oneDay * 7; // 7 days in seconds
const oneMonth = oneDay * 31; // 31 days in seconds
const VOUCHER_NAME = "Boson Voucher (rNFT)";
const VOUCHER_SYMBOL = "BOSON_VOUCHER_RNFT";
const LSSVM_PAIR_FACTORY = "0x4332465E5C9Ac98e91EEeeCe7989bDD0387f0cBA";

const tipMultiplier = ethers.BigNumber.from(environments.tipMultiplier);
const tipSuggestion = "1500000000"; // ethers.js always returns this constant, it does not vary per block
const maxPriorityFeePerGas = ethers.BigNumber.from(tipSuggestion).mul(tipMultiplier);

exports.oneDay = oneDay;
exports.ninetyDays = ninetyDays;
exports.oneWeek = oneWeek;
exports.oneMonth = oneMonth;
exports.VOUCHER_NAME = VOUCHER_NAME;
exports.VOUCHER_SYMBOL = VOUCHER_SYMBOL;
exports.maxPriorityFeePerGas = maxPriorityFeePerGas;
exports.LSSVM_PAIR_FACTORY = LSSVM_PAIR_FACTORY;
