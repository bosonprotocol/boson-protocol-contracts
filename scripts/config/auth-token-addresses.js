/**
 * Addresses of the contracts used for authentication
 *
 */
module.exports = {
  // Lens protocol NFT contract address
  LENS: {
    hardhat: "0x60Ae865ee4C725cd04353b5AAb364553f56ceF82",
    localhost: "0x8A4eBAEB1319623Aebda7c0F77b22263893f286B", // dummy value, replace after running deploy-mocks:local
    test: "0x478c6B18c1694AF49D5814238183EfBc62211834", //actual deployed value
    mainnet: "",
    sepolia: "", // not deployed
    polygon: "0xDb46d1Dc155634FbC732f92E853b10B288AD5a1d",
    mumbai: "0x60Ae865ee4C725cd04353b5AAb364553f56ceF82",
    amoy: "", // not deployed
    baseSepolia: "", // not deployed
    base: "", // not deployed
    optimismSepolia: "", // not deployed
    optimism: "", // not deployed
    arbitrumSepolia: "", // not deployed
    arbitrum: "", // not deployed
  },

  // ENS contract address
  ENS: {
    hardhat: "0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85",
    localhost: "0x941275FD90443BAdE771fE8D1ebA996d98387A15", // dummy value, replace after running deploy-mocks:local
    test: "0x13E03B861B96d2fC9553D4c52ba1a914f73f50a4", //actual deployed value
    mainnet: "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e",
    sepolia: "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e",
    polygon: "", // not deployed
    mumbai: "", // not deployed
    amoy: "", // not deployed
    baseSepolia: "", // not deployed
    base: "", // not deployed
    optimismSepolia: "", // not deployed
    optimism: "", // not deployed
    arbitrumSepolia: "", // not deployed
    arbitrum: "", // not deployed
  },
};
