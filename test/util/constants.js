const hre = require("hardhat");
const ethers = hre.ethers;

// Some periods in seconds
const oneDay = 86400; //  1 day in seconds
const ninetyDays = oneDay * 90; // 90 days in seconds
const oneWeek = oneDay * 7; // 7 days in seconds
const oneMonth = oneDay * 31; // 31 days in seconds
const VOUCHER_NAME = "Boson Voucher (rNFT)";
const VOUCHER_SYMBOL = "BOSON_VOUCHER_RNFT";
const SEAPORT_ADDRESS = "0x00000000000001ad428e4906aE43D8F9852d0dD6"; // 1.4
const maxPriorityFeePerGas = ethers.BigNumber.from("1500000000"); // ethers.js always returns this constant, it does not vary per block

exports.oneDay = oneDay;
exports.ninetyDays = ninetyDays;
exports.oneWeek = oneWeek;
exports.oneMonth = oneMonth;
exports.VOUCHER_NAME = VOUCHER_NAME;
exports.VOUCHER_SYMBOL = VOUCHER_SYMBOL;
exports.maxPriorityFeePerGas = maxPriorityFeePerGas;
exports.SEAPORT_ADDRESS = SEAPORT_ADDRESS;
