const log = console.log;

// Modify the console.log to capture the contract output
let contractLogs = [];
console.log = function () {
  contractLogs.push(arguments[0]);
};

const hre = require("hardhat");

/**
Estimates the values for SINGLE_TWIN_RESERVED_GAS, MINIMAL_RESIDUAL_GAS

Use with caution if `transferTwins` or other methods that call it changed a lot. Please, refer to docs/twin-transfer-limits.md for more information.

This script does the following:
1. Preprocesses the `transferTwins` method to add the `gasLeft()` measurement points
   If it cannot reliably position the measurement points, it throws an error
2. Runs the unit tests that cover the `transferTwins` method
3. Captures the console.log output
4. Analyzes the output and estimates SINGLE_TWIN_RESERVED_GAS and MINIMAL_RESIDUAL_GAS

*/
async function estimateTwinTransferLimits() {
  // 1. Preprocess the `twinTransfer` to add the `gasLeft()` measurement points
  let invokeFound = false;
  let loopFound = false;
  let externalCallFound = false;
  let paranthesisCount = {
    invoke: 0,
    loop: 0,
    externalCall: 0,
  };
  let previousMeasurePoint = "";
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
          return line + "import 'hardhat/console.sol';";
        }

        // Gas left measure points
        // 1. At the beginning of the transfer twin loop
        if (line.includes("for (uint256 i = 0; i < twinCount")) {
          if (previousMeasurePoint !== "invoke") {
            throw new Error("Could not find the invoke measure point");
          }
          previousMeasurePoint = "loopStart";
          loopFound = true;
          return line + 'console.log("TwinGasEstimate1,%s,%s", i, gasleft());';
        }

        // 2. Before the external call
        if (line.includes("uint256 gasLeft = gasleft();")) {
          if (previousMeasurePoint !== "loopStart") {
            throw new Error("Could not find the loopStart measure point");
          }
          previousMeasurePoint = "beforeExternalCall";
          externalCallFound = true;
          return line + 'console.log("TwinGasEstimate2,%s,%s", i, gasleft());';
        }

        // 3. After the external call
        if (externalCallFound) {
          if (line.includes("{")) {
            paranthesisCount.externalCall++;
          }
          if (line.includes("}")) {
            if (--paranthesisCount.externalCall == 0) {
              if (previousMeasurePoint !== "beforeExternalCall") {
                throw new Error("Could not find the beforeExternalCall measure point");
              }
              externalCallFound = false;
              previousMeasurePoint = "afterExternalCall";
              return line + 'console.log("TwinGasEstimate3,%s,%s", i, gasleft());';
            }
          }
        }

        // 4. At the end of the transfer twin loop
        if (loopFound) {
          if (line.includes("{")) {
            paranthesisCount.loop++;
          }
          if (line.includes("}")) {
            if (--paranthesisCount.loop == 0) {
              if (previousMeasurePoint !== "afterExternalCall") {
                throw new Error("Could not find the afterExternalCall measure point");
              }
              loopFound = false;
              previousMeasurePoint = "loopEnd";
              return 'console.log("TwinGasEstimate4,%s,%s", i, gasleft());' + line;
            }
          }
        }

        // 5. At the end of the function that invokes transferTwins
        if (line.includes("transferTwins") && !line.includes("function")) {
          invokeFound = true;
          paranthesisCount.invoke++;
        }

        if (invokeFound) {
          if (line.includes("{")) {
            paranthesisCount.invoke++;
          }
          if (line.includes("}")) {
            if (--paranthesisCount.invoke == 0) {
              invokeFound = false;
              previousMeasurePoint = "invoke";
              return 'console.log("TwinGasEstimate5,0,%s", gasleft());' + line;
            }
          }
        }

        return line;
      },
    }),
  };

  // 2. Run tests that cover the bundles and capture the output
  hre.config.mocha = {
    ...hre.config.mocha,
    testFiles: ["./test/protocol/ExchangeHandlerTest.js"],
    grep: "redeemVoucher\\(\\) with bundle",
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
