module.exports = {
  skipFiles: [
    "mock",
    "protocol/bases/ClientBase.sol",
    "protocol/clients/proxy/ClientProxy.sol",
    "protocol/libs/ClientLib.sol",
  ],
  mocha: {
    grep: "@skip-on-coverage", // Find everything with this tag
    invert: true, // Run the grep's inverse set.
  },
};
