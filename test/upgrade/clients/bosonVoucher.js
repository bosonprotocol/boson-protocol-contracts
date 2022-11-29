const shell = require("shelljs");
const hre = require("hardhat");
const ethers = hre.ethers;
const { assert } = require("chai");
const { mockAuthToken, mockSeller, mockVoucherInitValues } = require("../../util/mock");
const { calculateContractAddress } = require("../../util/utils.js");
const { deploySuite, getStorageLayout, compareStorageLayouts } = require("../../util/upgrade");

const oldVersion = "v2.1.0";
const newVersion = "preminted-voucher";

/**
 *  Upgrade test case - After upgrade from 2.0.0 to 2.1.0 everything is still operational
 */
describe("[@skip-on-coverage] After facet upgrade, everything is still operational", function () {
  // Common vars
  let deployer, seller1, seller2, seller3;
  let accountHandler;

  before(async function () {
    // Make accounts available
    [deployer, seller1, seller2, seller3] = await ethers.getSigners();

    // temporary update config, so compiler outputs storage layout
    for (const compiler of hre.config.solidity.compilers) {
      if (compiler.settings.outputSelection["*"]["BosonVoucher"]) {
        compiler.settings.outputSelection["*"]["BosonVoucher"].push("storageLayout"); // change * to BosonVoucher
      } else {
        compiler.settings.outputSelection["*"]["BosonVoucher"] = ["storageLayout"];
      }
    }

    const { protocolContracts } = await deploySuite(deployer, oldVersion);

    const preUpgradeStorageLayout = await getStorageLayout("BosonVoucher");

    ({ accountHandler } = protocolContracts);

    const sellers = [
      mockSeller(seller1.address, seller1.address, seller1.address, seller1.address),
      mockSeller(seller2.address, seller2.address, seller2.address, seller2.address),
      mockSeller(seller3.address, seller3.address, seller3.address, seller3.address),
    ];

    const [voucherAddress1, voucherAddress2, voucherAddress3] = [
      calculateContractAddress(accountHandler.address, "1"),
      calculateContractAddress(accountHandler.address, "2"),
      calculateContractAddress(accountHandler.address, "3"),
    ];

    const emptyAuthToken = mockAuthToken();
    const voucherInitValues = mockVoucherInitValues();
    await accountHandler.connect(seller1).createSeller(sellers[0], emptyAuthToken, voucherInitValues);
    await accountHandler.connect(seller2).createSeller(sellers[1], emptyAuthToken, voucherInitValues);
    await accountHandler.connect(seller3).createSeller(sellers[2], emptyAuthToken, voucherInitValues);

    let [bosonVoucher1, bosonVoucher2, bosonVoucher3] = [
      await ethers.getContractAt("BosonVoucher", voucherAddress1),
      await ethers.getContractAt("BosonVoucher", voucherAddress2),
      await ethers.getContractAt("BosonVoucher", voucherAddress3),
    ];

    console.log("name pre update");
    console.log(await bosonVoucher1.name());
    console.log(await bosonVoucher2.name());
    console.log(await bosonVoucher3.name());

    // Upgrade protocol
    if (newVersion) {
      // checkout the new tag
      console.log(`Checking out version ${newVersion}`);
      shell.exec(`git checkout ${newVersion} contracts`);
    } else {
      // if tag was not created yet, use the latest code
      console.log(`Checking out latest code`);
      shell.exec(`git checkout HEAD contracts`);
    }

    // compile new contracts
    await hre.run("compile");

    const postUpgradeStorageLayout = await getStorageLayout("BosonVoucher");

    assert(compareStorageLayouts(preUpgradeStorageLayout, postUpgradeStorageLayout), "Upgrade breaks storage layout");

    // test methods on unupdated contracts

    await hre.run("upgrade-clients", { env: "upgrade-test" });
  });

  after(async function () {
    // revert to latest state of contracts
    shell.exec(`git checkout HEAD contracts`);
  });

  // Exchange methods
  context("📋 Right After upgrade", async function () {
    it("a test", async function () {});
  });
});
