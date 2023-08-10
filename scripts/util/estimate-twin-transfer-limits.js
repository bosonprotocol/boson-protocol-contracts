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
  // let startFound = false;
  // let invokeFound = false;
  // const ExchangeHandlerPath = process.cwd() + "/contracts/protocol/facets/ExchangeHandlerFacet.sol";
  // hre.config.preprocess = {
  //   eachLine: () => ({
  //     transform: (line, { absolutePath }) => {
  //       // Filter paths here, since preprocessor's options "files" doesn't work
  //       if (absolutePath !== ExchangeHandlerPath) {
  //         return line;
  //       }

  //       // 1. add console.sol import
  //       if (line.includes("pragma solidity")) {
  //         line = line + "import 'hardhat/console.sol';";
  //         console.log("import path");
  //         console.log(absolutePath);
  //       }

  //       if (line.includes("transferTwins")) {
  //         if (line.includes("function")) {
  //           startFound = true;
  //         } else {
  //           invokeFound = true;
  //         }
  //       }

  //       if (startFound && line.includes("{")) {
  //         line = line + 'console.log("start", gasleft());';
  //         startFound = false;
  //       } else if (invokeFound && line.includes("}")) {
  //         line = 'console.log("final event", gasleft());' + line;
  //         invokeFound = false;
  //       }
  //       return line;
  //     },
  //   }),
  // };

  // 2. Run tests that cover the bundles and capture the output
  hre.config.mocha = {
    ...hre.config.mocha,
    testFiles: ["./test/protocol/ExchangeHandlerTest.js"],
    grep: "redeemVoucher\\(\\) with bundle",
    // grep: "uld not decrease twin supplyAvailable if supply is unlimited",
    reporter: "min",
  };
  hre.config.gasReporter.enabled = false;

  log("Running tests...");
  await hre.run("test");

  // 3. Analyze the output
  log("Tests complete. Analyzing logs...");
  const [SINGLE_TWIN_RESERVED_GAS, MINIMAL_RESIDUAL_GAS] = analyzeLogs(contractLogs);

  log("SINGLE_TWIN_RESERVED_GAS", SINGLE_TWIN_RESERVED_GAS.toString());
  log("MINIMAL_RESIDUAL_GAS", MINIMAL_RESIDUAL_GAS.toString());
}

/**
Analyzes the log output:
1. Parse the logs
2. Calculate the deltas between the logs
3. Find the biggest delta for each measure point
4. Calculate the SINGLE_TWIN_RESERVED_GAS and MINIMAL_RESIDUAL_GAS
*/
function analyzeLogs(logs) {
  // Parse the logs
  let deltas = [0n, 0n, 0n, 0n]; // Deltas between the logs
  let runningIndex = 0;
  let measurePoint = 1;
  let previousGasLeft = 0n;
  for (const log of logs) {
    if (log) {
      const logSplit = log.split(",");
      if (!logSplit[0].startsWith("TwinGasEstimate")) {
        continue;
      }

      let gasLeft = BigInt(logSplit[2]);

      if (measurePoint == 5) {
        let currentIndex = parseInt(logSplit[1]);
        if (currentIndex === runningIndex + 1) {
          // in the case of multiple twin transfers, we return to the first measure point
          measurePoint = 1;
        }
      }

      if (measurePoint === 1) {
        runningIndex = parseInt(logSplit[1]);
        // no delta calculation
      } else {
        let delta = previousGasLeft - gasLeft;

        // we search for the biggest delta
        if (delta > deltas[measurePoint - 2]) {
          deltas[measurePoint - 2] = delta;
        }
      }

      previousGasLeft = gasLeft;

      if (measurePoint == 5) {
        measurePoint = 1;
      } else {
        measurePoint++;
      }
    }
  }

  const SINGLE_TWIN_RESERVED_GAS = deltas[0] + deltas[2]; // deltas[1] represents the external call
  const MINIMAL_RESIDUAL_GAS = deltas[2] + deltas[3];

  return [SINGLE_TWIN_RESERVED_GAS, MINIMAL_RESIDUAL_GAS];
}

estimateTwinTransferLimits();

exports.estimateTwinTransferLimits = estimateTwinTransferLimits;
