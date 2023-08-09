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
  let startFound = false;
  let invokeFound = false;
  const ExchangeHandlerPath = process.cwd() + "/contracts/protocol/facets/ExchangeHandlerFacet.sol";
  hre.config.preprocess = {
    eachLine: () => ({
      transform: (line, { absolutePath }) => {
        // Filter paths here, since preprocessor's options "files" doesn't work
        if (absolutePath !== ExchangeHandlerPath) {
          return line;
        }

        // 1. add console.sol import
        if (line.includes("pragma solidity")) {
          line = line + "import 'hardhat/console.sol';";
          console.log("import path");
          console.log(absolutePath);
        }

        if (line.includes("transferTwins")) {
          if (line.includes("function")) {
            startFound = true;
          } else {
            invokeFound = true;
          }
        }

        if (startFound && line.includes("{")) {
          line = line + 'console.log("start", gasleft());';
          startFound = false;
        } else if (invokeFound && line.includes("}")) {
          line = 'console.log("final event", gasleft());' + line;
          invokeFound = false;
        }
        return line;
      },
    }),
  };

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
