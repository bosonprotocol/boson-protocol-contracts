const hre = require("hardhat");
const ethers = hre.ethers;
const eip55 = require("eip55");

function bigNumberIsValid(bigNumber) {
  let valid = false;
  try {
    valid = typeof bigNumber === "string" && typeof ethers.BigNumber.from(bigNumber) === "object";
  } catch (e) {}
  return valid;
}

function bigNumberNonZeroIsValid(bigNumber) {
  let valid = false;
  try {
    valid = typeof bigNumber === "string" && ethers.BigNumber.from(bigNumber).gt(0);
  } catch (e) {}
  return valid;
}

function enumIsValid(enumValue) {
  let valid = false;
  try {
    valid = typeof enumValue === "number" && typeof ethers.BigNumber.from(enumValue) === "object";
  } catch (e) {}
  return valid;
}

function addressIsValid(address) {
  let valid = false;
  try {
    valid = eip55.verify(eip55.encode(address));
  } catch (e) {}
  return valid;
}

function booleanIsValid(boolean) {
  let valid = false;
  try {
    valid = typeof boolean === "boolean";
  } catch (e) {}
  return valid;
}

exports.bigNumberIsValid = bigNumberIsValid;
exports.enumIsValid = enumIsValid;
exports.addressIsValid = addressIsValid;
exports.booleanIsValid = booleanIsValid;
exports.bigNumberNonZeroIsValid = bigNumberNonZeroIsValid;
