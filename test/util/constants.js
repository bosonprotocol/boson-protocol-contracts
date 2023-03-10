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
const DEFAULT_ROYALTY_RECIPIENT = "Treasury";

const tipMultiplier = ethers.BigNumber.from(environments.tipMultiplier);
const tipSuggestion = "1500000000"; // ethers.js always returns this constant, it does not vary per block
const maxPriorityFeePerGas = ethers.BigNumber.from(tipSuggestion).mul(tipMultiplier);

const ROYALTY_REGISTRY_ADDRESS = "0x28EdFcF0Be7E86b07493466e7631a213bDe8eEF2";

exports.oneDay = oneDay;
exports.ninetyDays = ninetyDays;
exports.oneWeek = oneWeek;
exports.oneMonth = oneMonth;
exports.VOUCHER_NAME = VOUCHER_NAME;
exports.VOUCHER_SYMBOL = VOUCHER_SYMBOL;
exports.maxPriorityFeePerGas = maxPriorityFeePerGas;
exports.DEFAULT_ROYALTY_RECIPIENT = DEFAULT_ROYALTY_RECIPIENT;
exports.ROYALTY_REGISTRY_ADDRESS = ROYALTY_REGISTRY_ADDRESS;
