/**
 * Addresses of the contracts used for authentication
 *
 */
module.exports = {
  // Lens protocol NFT contract address
  LENS: {
    mainnet: "0xDb46d1Dc155634FbC732f92E853b10B288AD5a1d",
    hardhat: "0x60Ae865ee4C725cd04353b5AAb364553f56ceF82",
    localhost: "0x8A4eBAEB1319623Aebda7c0F77b22263893f286B", // dummy value, replace after running deploy-mocks:local
    test: "0x478c6B18c1694AF49D5814238183EfBc62211834", //actual deployed value
    mumbai: "0x60Ae865ee4C725cd04353b5AAb364553f56ceF82",
    polygon: "0xDb46d1Dc155634FbC732f92E853b10B288AD5a1d",
  },

  // ENS contract address
  ENS: {
    mainnet: "0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85",
    hardhat: "0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85",
    localhost: "0x941275FD90443BAdE771fE8D1ebA996d98387A15", // dummy value, replace after running deploy-mocks:local
    test: "0x13E03B861B96d2fC9553D4c52ba1a914f73f50a4", //actual deployed value
  },
};
