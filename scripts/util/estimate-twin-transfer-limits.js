var log = console.log;

// Modify the console.log to capture the contract output
var contractLogs = [];
console.log = function () {
  contractLogs.push(arguments[0]);
};

const hre = require("hardhat");

/**
Estimates the values for SINGLE_TWIN_RESERVED_GAS, MINIMAL_RESIDUAL_GAS

Use with caution if `transferTwins` or other methods that call it changed a lot.

This script does the following:
1. Preprocesses the `transferTwins` method to add the `gasLeft()` markers
   If it cannot reliably position the markers, it will throw an error
2  Runs the tests that cover the `transferTwins` method
3. Captures the console.log output
4. Analyzes the output and estimates SINGLE_TWIN_RESERVED_GAS and MINIMAL_RESIDUAL_GAS

*/
async function estimateTwinTransferLimits() {
  // 1. Preprocess the `twinTransfer` to add the `gasLeft()` markers
  // hre.config.preprocess = {
  //   eachLine: () => ({
  //     transform: (line) => {
  //       if (line.match(/^\s*pragma /i)) {
  //         //
  //         line = line.replace(/solidity\s+0\.8\.9/i, "solidity 0.8.18");
  //       }
  //       return line;
  //     },
  //   }),
  // };

  // 2. Run tests that cover the bundles and capture the output
  hre.config.mocha = {
    timeout: 100000,
    testFiles: ["./test/protocol/ExchangeHandlerTest.js"],
    // grep: "redeemVoucher\\(\\) with bundle",
    grep: "uld not decrease twin supplyAvailable if supply is unlimited",
    reporter: "min",
  };
  hre.config.gasReporter.enabled = false;

  log("Running tests...");
  await hre.run("test");

  log("Tests complete");
  log(contractLogs);
}

estimateTwinTransferLimits();

exports.estimateTwinTransferLimits = estimateTwinTransferLimits;
