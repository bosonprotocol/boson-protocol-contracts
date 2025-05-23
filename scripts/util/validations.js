const eip55 = require("eip55");
const { ethers } = require("hardhat");
const { MaxUint256 } = ethers;

/**
 * Must be a string representation of a big number
 * @param bigNumber
 * @param options
 * - {boolean} optional
 * - {number} gt - greater than
 * - {number} lte - less than or equal to
 * - {boolean} empty - empty string is valid
 * @returns {boolean}
 */
function bigNumberIsValid(bigNumber, { optional, gt, lte, empty } = {}) {
  let valid = true;

  if (optional && (bigNumber == undefined || bigNumber == null)) {
    valid = true;
  } else if (empty && bigNumber === "") {
    valid = true;
  } else {
    try {
      const bigNumberValue = BigInt(bigNumber);
      valid =
        (typeof bigNumber === "string" || typeof bigNumber === "bigint") &&
        (gt == undefined || bigNumberValue > BigInt(gt)) &&
        (lte == undefined || bigNumberValue <= BigInt(lte));
    } catch (e) {
      valid = false;
    }
  }

  return valid;
}

/**
 * Must be a array of big numbers
 * @param bigNumberArray
 * @returns {boolean}
 */
function bigNumberArrayIsValid(bigNumberArray) {
  let valid = false;
  try {
    valid =
      Array.isArray(bigNumberArray) &&
      bigNumberArray.reduce((previousValue, currentValue) => previousValue && bigNumberIsValid(currentValue), true);
  } catch (e) {}
  return valid;
}

/**
 * Must be a number belonging to the enumTypes array
 * @params {number} enumValue
 * @params {Array<numbers>} enumTypes - array of numbers
 * @returns {boolean}
 */
function enumIsValid(enumValue, enumTypes) {
  let valid = false;
  try {
    valid = enumTypes.includes(enumValue);
  } catch (e) {}
  return valid;
}

/**
 * Must be a eip55 compliant Ethereum address
 * @returns {boolean}
 */
function addressIsValid(address) {
  let valid = false;
  try {
    valid = eip55.verify(eip55.encode(address));
  } catch (e) {}
  return valid;
}

/**
 * Must be a array of eip55 compliant Ethereum addresses
 * @param addressArray
 * @returns {boolean}
 */
function addressArrayIsValid(addressArray) {
  let valid = false;
  try {
    valid =
      Array.isArray(addressArray) &&
      addressArray.reduce((previousValue, currentValue) => previousValue && addressIsValid(currentValue), true);
  } catch (e) {}
  return valid;
}

/**
 * Must be a boolean
 * @returns {boolean}
 */
function booleanIsValid(boolean) {
  let valid = false;
  try {
    valid = typeof boolean === "boolean";
  } catch (e) {}
  return valid;
}

/**
 * Must be a string
 * @returns {boolean}
 */
function stringIsValid(string) {
  let valid = false;
  try {
    valid = typeof string === "string";
  } catch (e) {}
  return valid;
}

function bytes4IsValid(bytes4) {
  let valid = false;
  try {
    valid = BigInt(bytes4) >= 0n && BigInt(bytes4) <= 4294967295n; // max bytes4 value
  } catch (e) {}
  return valid;
}

function bytes32IsValid(bytes32) {
  let valid = false;
  try {
    valid = BigInt(bytes32) >= 0n && BigInt(bytes32) <= MaxUint256; // max bytes32 value is equal to MaxUint256
  } catch (e) {}
  return valid;
}

function bytes4ArrayIsValid(bytes4Array) {
  let valid = false;
  try {
    valid =
      Array.isArray(bytes4Array) &&
      bytes4Array.length > 0 &&
      bytes4Array.filter((b) => bytes4IsValid(b)).length === bytes4Array.length;
  } catch (e) {}
  return valid;
}

function bytesIsValid(bytes) {
  let valid = false;
  try {
    valid = typeof bytes === "string" && bytes.startsWith("0x") && bytes.length % 2 === 0;
  } catch (e) {}
  return valid;
}

exports.bigNumberIsValid = bigNumberIsValid;
exports.enumIsValid = enumIsValid;
exports.addressIsValid = addressIsValid;
exports.booleanIsValid = booleanIsValid;
exports.bigNumberArrayIsValid = bigNumberArrayIsValid;
exports.stringIsValid = stringIsValid;
exports.bytes4ArrayIsValid = bytes4ArrayIsValid;
exports.addressArrayIsValid = addressArrayIsValid;
exports.bytesIsValid = bytesIsValid;
exports.bytes32IsValid = bytes32IsValid;
