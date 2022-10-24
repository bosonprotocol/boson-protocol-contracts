const { assert, expect } = require("chai");
const hre = require("hardhat");
const ethers = hre.ethers;

const Role = require("../../scripts/domain/Role");
const Facet = require("../../scripts/domain/Facet");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const {
  getFacetAddCut,
  getSelectors,
  FacetCutAction,
  removeSelectors,
} = require("../../scripts/util/diamond-utils.js");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { maxPriorityFeePerGas } = require("../util/constants");

/**
 * Test the Protocol Diamond contract and its core facets
 *
 * Based on Nick Mudge's gas-optimized diamond-2 reference,
 * with modifications to support role-based access and management of
 * supported interfaces.
 *
 * These tests have been refactored to remove dependency upon the
 * actions of previous tests, and to use contexts to group tests
 * and make them easier to reason about and spot gaps in coverage.
 *
 * They also include new tests for initializer functions and storage
 * slots.
 *
 * @author Nick Mudge <nick@perfectabstractions.com> (https://twitter.com/mudgen)
 * @author Cliff Hall <cliff@futurescale.com> (https://twitter.com/seaofarrows)
 */
describe("ProtocolDiamond", async function () {
  // Common constants
  const gasLimit = 1600000;

  // Common vars
  let InterfaceIds;
  let deployer, admin, upgrader, rando;
  let protocolDiamond, diamondLoupe, diamondCut, accessController;
  let loupeFacetViaDiamond, cutFacetViaDiamond, erc165ViaDiamond;
  let Test1Facet, test1Facet, test1ViaDiamond;
  let Test2Facet, test2Facet, test2ViaDiamond;
  let Test3Facet, test3Facet, test3ViaDiamond;
  let Test2FacetUpgrade, test2FacetUpgrade;
  let tx, receipt, addresses, address, selectors;
  let interfaces, facets, facetCuts, result;
  let initFunction, initInterface, initCallData;
  let discard, support, erc165;

  before(async function () {
    // get interface Ids
    InterfaceIds = await getInterfaceIds();
  });

  beforeEach(async function () {
    // Make accounts available
    [deployer, admin, upgrader, rando] = await ethers.getSigners();

    // Deploy the Diamond
    [protocolDiamond, diamondLoupe, diamondCut, erc165, accessController] = await deployProtocolDiamond(
      maxPriorityFeePerGas
    );

    // Cast Diamond to DiamondLoupeFacet
    loupeFacetViaDiamond = await ethers.getContractAt("DiamondLoupeFacet", protocolDiamond.address);

    // Cast Diamond to DiamondCutFacet
    cutFacetViaDiamond = await ethers.getContractAt("DiamondCutFacet", protocolDiamond.address);

    // Cast Diamond to ERC165Facet
    erc165ViaDiamond = await ethers.getContractAt("ERC165Facet", protocolDiamond.address);

    // Get the facet addresses
    addresses = Object.assign([], await loupeFacetViaDiamond.facetAddresses());

    // Deployer grants ADMIN role to admin address and renounces admin
    await accessController.connect(deployer).grantRole(Role.ADMIN, admin.address);
    await accessController.connect(deployer).renounceRole(Role.ADMIN, deployer.address);

    // Grant UPGRADER role to upgrader account
    await accessController.connect(admin).grantRole(Role.UPGRADER, upgrader.address);
  });

  // Interface support (ERC-156 provided by ProtocolDiamond, others by deployed facets)
  context("📋 Interfaces", async function () {
    context("👉 supportsInterface()", async function () {
      it("should indicate support for ERC-165 interface", async function () {
        // See https://eips.ethereum.org/EIPS/eip-165#how-a-contract-will-publish-the-interfaces-it-implements
        support = await erc165ViaDiamond.supportsInterface(InterfaceIds.IERC165);

        // Test
        expect(support, "ERC-165 interface not supported").is.true;
      });

      it("should indicate support for extended ERC-165 interface", async function () {
        // See https://eips.ethereum.org/EIPS/eip-165#how-a-contract-will-publish-the-interfaces-it-implements
        support = await erc165ViaDiamond.supportsInterface(InterfaceIds.IERC165Extended);

        // Test
        expect(support, "Extended ERC-165 interface not supported").is.true;
      });
    });
  });

  // Introspection tests
  context("📋 DiamondLoupeFacet", async function () {
    context("👉 facets()", async () => {
      beforeEach(async function () {
        // Get facets
        facets = await loupeFacetViaDiamond.facets();
      });

      it("should return the correct number of objects", async () => {
        // Make sure the count is correct
        assert.equal(facets.length, 3);
      });

      it("should return valid Facet objects", async () => {
        // Wrap Facet entity around results and validate
        facets.forEach((result) => {
          assert.isTrue(Facet.fromObject(result).isValid());
        });
      });

      it("should return expected facet data", async () => {
        // Get all the function selectors for all the interfaces
        interfaces = [getSelectors(loupeFacetViaDiamond), getSelectors(cutFacetViaDiamond)];

        // Iterate the interfaces
        interfaces.forEach((facet, index) => {
          // Check that the facet address is correct
          assert.equal(addresses[index], facets[index].facetAddress, "Incorrect facet address");

          // Iterate the function selectors
          facet.forEach(async (selector) => {
            // Check that the correct facet address is returned for the given selector
            address = await loupeFacetViaDiamond.facetAddress(selector);
            assert.equal(addresses[index], address);
          });
        });
      });

      it("should revert if more than 255 functions are added", async () => {
        // add more than 256 facets
        // Deploy TestFacet256
        const TestFacet256 = await ethers.getContractFactory("TestFacet256");
        const testFacet256 = await TestFacet256.deploy();
        await testFacet256.deployed();

        // Get the TestFacet256 function selectors from the abi
        selectors = getSelectors(testFacet256);

        // Define the facet cut
        facetCuts = [
          {
            facetAddress: testFacet256.address,
            action: FacetCutAction.Add,
            functionSelectors: selectors,
          },
        ];

        // Send the DiamondCut transaction
        tx = await cutFacetViaDiamond
          .connect(upgrader)
          .diamondCut(facetCuts, ethers.constants.AddressZero, "0x", { gasLimit: "10000000" });

        // this should revert
        await expect(loupeFacetViaDiamond.facets()).to.be.revertedWith(RevertReasons.TOO_MANY_FUNCTIONS);
      });
    });

    context("👉 facetAddresses()", async () => {
      it("should return three facet addresses", async () => {
        // Make sure the count is correct
        assert.equal(addresses.length, 3);
      });

      it("facet addresses should be correct and in order", async () => {
        // DiamondLoupeFacet was first cut
        assert.equal(addresses[0], diamondLoupe.address);

        // DiamondCutFacet was second cut
        assert.equal(addresses[1], diamondCut.address);

        // ERC165Facet was last cut
        assert.equal(addresses[2], erc165.address);
      });
    });

    context("👉 facetFunctionSelectors() ", async () => {
      it("should return the correct function selectors for the DiamondCutFacet", async () => {
        // Test cutFacetViaDiamond selectors
        selectors = getSelectors(cutFacetViaDiamond);
        result = await loupeFacetViaDiamond.facetFunctionSelectors(diamondCut.address);
        assert.sameMembers(result, selectors);
      });

      it("should return the correct function selectors for the DiamondLoupeFacet", async () => {
        // Test DiamondLoupeFacet selectors
        selectors = getSelectors(loupeFacetViaDiamond);
        result = await loupeFacetViaDiamond.facetFunctionSelectors(diamondLoupe.address);
        assert.sameMembers(result, selectors);
      });
    });

    context("👉 facetAddress() ", async () => {
      it("should return the correct facet addresses for all deployed selectors", async () => {
        // Get all the function selectors for all the interfaces
        interfaces = [getSelectors(loupeFacetViaDiamond), getSelectors(cutFacetViaDiamond)];

        // Iterate the interfaces
        interfaces.forEach((facet, index) => {
          // Iterate the selectors
          facet.forEach(async (selector) => {
            // Make sure the correct facet address is returned for the given selector
            address = await loupeFacetViaDiamond.facetAddress(selector);
            assert.equal(addresses[index], address);
          });
        });
      });
    });
  });

  // Modification tests
  context("📋 DiamondCutFacet", async function () {
    beforeEach(async function () {
      // Deploy Test1Facet
      Test1Facet = await ethers.getContractFactory("Test1Facet");
      test1Facet = await Test1Facet.deploy();
      await test1Facet.deployed();

      // Deploy Test2Facet
      Test2Facet = await ethers.getContractFactory("Test2Facet");
      test2Facet = await Test2Facet.deploy();
      await test2Facet.deployed();

      // Deploy Test3Facet
      Test3Facet = await ethers.getContractFactory("Test3Facet");
      test3Facet = await Test3Facet.deploy();
      await test3Facet.deployed();

      // N.B. The facets are not yet connected to the diamond in any way,
      // but following handles prepare us for accessing the diamond via
      // the ABI of these facets, once their functions have been added.

      // Cast Diamond to Test1Facet
      test1ViaDiamond = await ethers.getContractAt("Test1Facet", protocolDiamond.address);

      // Cast Diamond to Test2Facet
      test2ViaDiamond = await ethers.getContractAt("Test2Facet", protocolDiamond.address);

      // Cast Diamond to Test3Facet
      test3ViaDiamond = await ethers.getContractAt("Test3Facet", protocolDiamond.address);
    });

    context("👉 diamondCut() - Privileged Access", async function () {
      it("should require UPGRADER to perform cut actions", async function () {
        // Get the Test1Facet function selectors from the abi
        selectors = getSelectors(test1Facet);

        // Define the facet cut
        facetCuts = [
          {
            facetAddress: test1Facet.address,
            action: FacetCutAction.Add,
            functionSelectors: selectors,
          },
        ];

        // non-UPGRADER attempt
        await expect(
          cutFacetViaDiamond.connect(admin).diamondCut(facetCuts, ethers.constants.AddressZero, "0x", { gasLimit })
        ).to.be.revertedWith(RevertReasons.ONLY_UPGRADER);

        // UPGRADER attempt
        tx = await cutFacetViaDiamond
          .connect(upgrader)
          .diamondCut(facetCuts, ethers.constants.AddressZero, "0x", { gasLimit });

        // Wait for transaction to confirm
        receipt = await tx.wait();

        // Be certain transaction was successful
        assert.equal(receipt.status, 1, `UPGRADER not able to upgrader ProtocolDiamond`);
      });
    });

    context("👉 diamondCut() - FacetCutAction.Add", async function () {
      it("should add functions from Test1Facet", async () => {
        // Get the Test1Facet function selectors from the abi
        selectors = getSelectors(test1Facet);

        // Define the facet cut
        facetCuts = [
          {
            facetAddress: test1Facet.address,
            action: FacetCutAction.Add,
            functionSelectors: selectors,
          },
        ];

        // Send the DiamondCut transaction
        tx = await cutFacetViaDiamond
          .connect(upgrader)
          .diamondCut(facetCuts, ethers.constants.AddressZero, "0x", { gasLimit });

        // Wait for transaction to confirm
        receipt = await tx.wait();

        // Be certain transaction was successful
        assert.equal(receipt.status, 1, `Diamond upgrade failed: ${tx.hash}`);

        // Make sure function selectors for the facet are correct
        result = await loupeFacetViaDiamond.facetFunctionSelectors(test1Facet.address);
        assert.sameMembers(result, selectors);
      });

      it("should add functions from Test2Facet", async () => {
        // Get the Test1Facet function selectors from the abi
        selectors = getSelectors(test2Facet);

        // Define the facet cut
        facetCuts = [
          {
            facetAddress: test2Facet.address,
            action: FacetCutAction.Add,
            functionSelectors: selectors,
          },
        ];

        // Send the DiamondCut transaction
        tx = await cutFacetViaDiamond
          .connect(upgrader)
          .diamondCut(facetCuts, ethers.constants.AddressZero, "0x", { gasLimit });

        // Wait for transaction to confirm
        receipt = await tx.wait();

        // Be certain transaction was successful
        assert.equal(receipt.status, 1, `Diamond upgrade failed: ${tx.hash}`);

        // Make sure function selectors for the facet are correct
        result = await loupeFacetViaDiamond.facetFunctionSelectors(test2Facet.address);
        assert.sameMembers(result, selectors);
      });

      it("should allow functions from different facets to be added in one transaction", async () => {
        // Get even numbered selectors from Test1Facet + odd from Test2Facet
        selectors = [
          getSelectors(test1ViaDiamond).filter((s, i) => i % 2),
          getSelectors(test2ViaDiamond).filter((s, i) => !(i % 2)),
        ];

        // Define facet cuts
        facetCuts = [
          {
            facetAddress: test1Facet.address,
            action: FacetCutAction.Add,
            functionSelectors: selectors[0],
          },
          {
            facetAddress: test2Facet.address,
            action: FacetCutAction.Add,
            functionSelectors: selectors[1],
          },
        ];

        // Send the DiamondCut transaction
        tx = await cutFacetViaDiamond
          .connect(upgrader)
          .diamondCut(facetCuts, ethers.constants.AddressZero, "0x", { gasLimit });

        // Be certain transaction was successful
        assert.equal(receipt.status, 1, `Diamond upgrade failed: ${tx.hash}`);

        // Ensure the currently installed test selectors are what we added
        result = [
          await loupeFacetViaDiamond.facetFunctionSelectors(test1Facet.address),
          await loupeFacetViaDiamond.facetFunctionSelectors(test2Facet.address),
        ];
        assert.sameMembers(result.flat(), selectors.flat());
      });

      it("at least one selector should be added", async function () {
        // Define the facet cut
        facetCuts = [
          {
            facetAddress: ethers.constants.AddressZero,
            action: FacetCutAction.Add,
            functionSelectors: [],
          },
        ];

        // attempt to add zero selectors
        await expect(
          cutFacetViaDiamond.connect(upgrader).diamondCut(facetCuts, ethers.constants.AddressZero, "0x", { gasLimit })
        ).to.be.revertedWith(RevertReasons.NO_SELECTORS_TO_CUT);
      });

      it("can't add function that already exists", async function () {
        // Get the Test1Facet function selectors from the abi
        selectors = getSelectors(test2Facet);

        // Define the facet cut
        facetCuts = [
          {
            facetAddress: test2Facet.address,
            action: FacetCutAction.Add,
            functionSelectors: selectors,
          },
        ];

        // Send the DiamondCut transaction
        await cutFacetViaDiamond
          .connect(upgrader)
          .diamondCut(facetCuts, ethers.constants.AddressZero, "0x", { gasLimit });

        // attempt to add the same selectors again
        await expect(
          cutFacetViaDiamond.connect(upgrader).diamondCut(facetCuts, ethers.constants.AddressZero, "0x", { gasLimit })
        ).to.be.revertedWith(RevertReasons.FUNCTION_ALREADY_EXISTS);
      });
    });

    context("👉 diamondCut() - FacetCutAction.Remove", async function () {
      beforeEach(async function () {
        // Define the facet cuts
        facetCuts = [
          {
            facetAddress: test1Facet.address,
            action: FacetCutAction.Add,
            functionSelectors: getSelectors(test1Facet),
          },
          {
            facetAddress: test2Facet.address,
            action: FacetCutAction.Add,
            functionSelectors: getSelectors(test2Facet),
          },
        ];

        // Send the DiamondCut transaction
        tx = await cutFacetViaDiamond
          .connect(upgrader)
          .diamondCut(facetCuts, ethers.constants.AddressZero, "0x", { gasLimit });

        // Wait for transaction to confirm
        receipt = await tx.wait();

        // Be certain transaction was successful
        assert.equal(receipt.status, 1, `Diamond upgrade failed: ${tx.hash}`);
      });

      it("should allow removal of arbitrary functions from Test1Facet", async () => {
        // Get selectors to remove
        discard = ["test1Func2()", "test1Func11()", "test1Func12()"];
        selectors = getSelectors(test1Facet).remove(discard);

        // Define the facet cuts
        facetCuts = [
          {
            facetAddress: ethers.constants.AddressZero,
            action: FacetCutAction.Remove,
            functionSelectors: selectors,
          },
        ];

        // Send the DiamondCut transaction
        tx = await cutFacetViaDiamond
          .connect(upgrader)
          .diamondCut(facetCuts, ethers.constants.AddressZero, "0x", { gasLimit });

        // Wait for transaction to confirm
        receipt = await tx.wait();

        // Be certain transaction was successful
        assert.equal(receipt.status, 1, `Diamond upgrade failed: ${tx.hash}`);

        // Verify that the function selectors were removed
        result = await loupeFacetViaDiamond.facetFunctionSelectors(test1Facet.address);
        assert.sameMembers(result, getSelectors(test1Facet).get(discard));
      });

      it("should allow removal of arbitrary functions from Test2Facet", async () => {
        // Get selectors to be removed
        discard = ["test2Func1()", "test2Func5()", "test2Func6()", "test2Func19()", "test2Func20()"];
        selectors = getSelectors(test2Facet).remove(discard);

        // Define the facet cuts
        facetCuts = [
          {
            facetAddress: ethers.constants.AddressZero,
            action: FacetCutAction.Remove,
            functionSelectors: selectors,
          },
        ];

        // Send the DiamondCut transaction
        tx = await cutFacetViaDiamond
          .connect(upgrader)
          .diamondCut(facetCuts, ethers.constants.AddressZero, "0x", { gasLimit });

        // Wait for transaction to confirm
        receipt = await tx.wait();

        // Be certain transaction was successful
        assert.equal(receipt.status, 1, `Diamond upgrade failed: ${tx.hash}`);

        // Verify that the function selectors were removed
        result = await loupeFacetViaDiamond.facetFunctionSelectors(test2Facet.address);
        assert.sameMembers(result, getSelectors(test2Facet).get(discard));
      });

      it("should remove facets when all their functions are removed", async () => {
        // Get all deployed facets
        facets = await loupeFacetViaDiamond.facets();
        assert.equal(facets.length, 5); // loupe, cut, erc165, test1, test2

        // Group the selectors from each facet
        selectors = [];
        for (let i = 0; i < facets.length; i++) {
          selectors.push(...facets[i].functionSelectors);
        }

        // Keep only the facets function on the DiamondLoupeFacet
        discard = ["facets()"];
        selectors = removeSelectors(selectors, discard);

        // Define the facet cuts
        facetCuts = [
          {
            facetAddress: ethers.constants.AddressZero,
            action: FacetCutAction.Remove,
            functionSelectors: selectors,
          },
        ];

        // Send the DiamondCut transaction
        tx = await cutFacetViaDiamond
          .connect(upgrader)
          .diamondCut(facetCuts, ethers.constants.AddressZero, "0x", { gasLimit });

        // Wait for transaction to confirm
        receipt = await tx.wait();

        // Be certain transaction was successful
        assert.equal(receipt.status, 1, `Diamond upgrade failed: ${tx.hash}`);

        // Get the updated facet list
        facets = await loupeFacetViaDiamond.facets();

        // Wrap Facet entity around each result and validate
        facets.forEach((result) => {
          assert.isTrue(Facet.fromObject(result).isValid());
        });

        // Check that only one facet remains
        assert.equal(facets.length, 1); // loupe

        // Check that the remaining facet address is correct
        assert.equal(facets[0].facetAddress, diamondLoupe.address, "Incorrect facet address");
      });

      it("at least one selector should be removed", async function () {
        // Define the facet cut
        facetCuts = [
          {
            facetAddress: ethers.constants.AddressZero,
            action: FacetCutAction.Remove,
            functionSelectors: [],
          },
        ];

        // attempt to remove zero selectors
        await expect(
          cutFacetViaDiamond.connect(upgrader).diamondCut(facetCuts, ethers.constants.AddressZero, "0x", { gasLimit })
        ).to.be.revertedWith(RevertReasons.NO_SELECTORS_TO_CUT);
      });

      it("remove facet address must be address(0)", async function () {
        // Get selectors to remove
        discard = ["test1Func2()", "test1Func11()", "test1Func12()"];
        selectors = getSelectors(test1Facet).remove(discard);

        // Define the facet cuts
        facetCuts = [
          {
            facetAddress: test1Facet.address,
            action: FacetCutAction.Remove,
            functionSelectors: selectors,
          },
        ];

        // attempt to make remove cut with non zero facet address
        await expect(
          cutFacetViaDiamond.connect(upgrader).diamondCut(facetCuts, ethers.constants.AddressZero, "0x", { gasLimit })
        ).to.be.revertedWith(RevertReasons.REMOVING_NON_ZERO_ADDRESS_FACET);
      });

      it("can't remove function that doesn't exist", async function () {
        // Define the facet cut
        facetCuts = [
          {
            facetAddress: ethers.constants.AddressZero,
            action: FacetCutAction.Remove,
            functionSelectors: getSelectors(test3Facet),
          },
        ];

        // attempt to remove function that doesn't exist
        await expect(
          cutFacetViaDiamond.connect(upgrader).diamondCut(facetCuts, ethers.constants.AddressZero, "0x", { gasLimit })
        ).to.be.revertedWith(RevertReasons.REMOVING_FUNCTION_DOES_NOT_EXIST);
      });

      it("Can't remove immutable function", async function () {
        // N.B. immutable functions should normally be defined directly in the diamond contract, here we just "borrow" abi from test3Facet
        // to test that immutable function cannot be replaced
        facetCuts = [
          {
            facetAddress: protocolDiamond.address,
            action: FacetCutAction.Add,
            functionSelectors: getSelectors(test3Facet),
          },
        ];

        // Send the DiamondCut transaction that adds immutable functions
        await cutFacetViaDiamond
          .connect(upgrader)
          .diamondCut(facetCuts, ethers.constants.AddressZero, "0x", { gasLimit });

        // Define the facet cut
        facetCuts = [
          {
            facetAddress: ethers.constants.AddressZero,
            action: FacetCutAction.Remove,
            functionSelectors: getSelectors(test3Facet),
          },
        ];

        // attempt to make remove immutable function
        await expect(
          cutFacetViaDiamond.connect(upgrader).diamondCut(facetCuts, ethers.constants.AddressZero, "0x", { gasLimit })
        ).to.be.revertedWith(RevertReasons.REMOVING_IMMUTABLE_FUNCTION);
      });
    });

    context("👉 diamondCut() - FacetCutAction.Replace", async function () {
      beforeEach(async function () {
        // Define the facet cuts
        facetCuts = [
          {
            facetAddress: test1Facet.address,
            action: FacetCutAction.Add,
            functionSelectors: getSelectors(test1Facet),
          },
          {
            facetAddress: test2Facet.address,
            action: FacetCutAction.Add,
            functionSelectors: getSelectors(test2Facet),
          },
        ];

        // Send the DiamondCut transaction
        tx = await cutFacetViaDiamond
          .connect(upgrader)
          .diamondCut(facetCuts, ethers.constants.AddressZero, "0x", { gasLimit });

        // Wait for transaction to confirm
        receipt = await tx.wait();

        // Be certain transaction was successful
        assert.equal(receipt.status, 1, `Diamond upgrade failed: ${tx.hash}`);
      });

      it("should replace a function on Test2Facet", async () => {
        // Verify current return value of function to be replaced
        assert.equal(await test2ViaDiamond.test2Func13(), "Boson");

        // Deploy Test2FacetUpgrade
        Test2FacetUpgrade = await ethers.getContractFactory("Test2FacetUpgrade");
        test2FacetUpgrade = await Test2FacetUpgrade.deploy();
        await test2FacetUpgrade.deployed();

        // Define the facet cut
        facetCuts = [
          {
            facetAddress: test2FacetUpgrade.address,
            action: FacetCutAction.Replace,
            functionSelectors: getSelectors(test2FacetUpgrade),
          },
        ];

        // Send the DiamondCut transaction
        tx = await cutFacetViaDiamond
          .connect(upgrader)
          .diamondCut(facetCuts, ethers.constants.AddressZero, "0x", { gasLimit });

        // Wait for transaction to confirm
        receipt = await tx.wait();

        // Be certain transaction was successful
        assert.equal(receipt.status, 1, `Diamond upgrade failed: ${tx.hash}`);

        // Verify new return value of function that was replaced
        assert.equal(await test2ViaDiamond.test2Func13(), "json");
      });

      it("at least one selector should be replaced", async function () {
        // Define the facet cut
        facetCuts = [
          {
            facetAddress: ethers.constants.AddressZero,
            action: FacetCutAction.Replace,
            functionSelectors: [],
          },
        ];

        // attempt to replace zero selectors
        await expect(
          cutFacetViaDiamond.connect(upgrader).diamondCut(facetCuts, ethers.constants.AddressZero, "0x", { gasLimit })
        ).to.be.revertedWith(RevertReasons.NO_SELECTORS_TO_CUT);
      });

      it("can't replace immutable function", async function () {
        // Define the facet cut
        // N.B. immutable functions should normally be defined directly in the diamond contract, here we just "borrow" abi from test3Facet
        // to test that immutable function cannot be replaced
        facetCuts = [
          {
            facetAddress: protocolDiamond.address,
            action: FacetCutAction.Add,
            functionSelectors: getSelectors(test3Facet),
          },
        ];

        // Send the DiamondCut transaction that adds immutable functions
        await cutFacetViaDiamond
          .connect(upgrader)
          .diamondCut(facetCuts, ethers.constants.AddressZero, "0x", { gasLimit });

        // Define the facet cut
        facetCuts = [
          {
            facetAddress: test3Facet.address,
            action: FacetCutAction.Replace,
            functionSelectors: getSelectors(test3Facet),
          },
        ];

        // attempt to replace immutable functions
        await expect(
          cutFacetViaDiamond.connect(upgrader).diamondCut(facetCuts, ethers.constants.AddressZero, "0x", { gasLimit })
        ).to.be.revertedWith(RevertReasons.REPLACING_IMMUTABLE_FUNCTION);
      });

      it("can't replace function with same function", async function () {
        // Define the facet cuts
        facetCuts = [
          {
            facetAddress: test1Facet.address,
            action: FacetCutAction.Replace,
            functionSelectors: getSelectors(test1Facet),
          },
        ];

        // attempt to replace function with same function
        await expect(
          cutFacetViaDiamond.connect(upgrader).diamondCut(facetCuts, ethers.constants.AddressZero, "0x", { gasLimit })
        ).to.be.revertedWith(RevertReasons.REPLACING_WITH_SAME_FUNCTION);
      });

      it("can't replace function that doesn't exist", async function () {
        // Define the facet cut
        facetCuts = [
          {
            facetAddress: test3Facet.address,
            action: FacetCutAction.Replace,
            functionSelectors: getSelectors(test3Facet),
          },
        ];

        // attempt to replace function that doesn't exist
        await expect(
          cutFacetViaDiamond.connect(upgrader).diamondCut(facetCuts, ethers.constants.AddressZero, "0x", { gasLimit })
        ).to.be.revertedWith(RevertReasons.REPLACING_FUNCTION_DOES_NOT_EXIST);
      });
    });
  });

  // Initialization tests
  context("📋 Initializer", async function () {
    beforeEach(async function () {
      // Deploy Test3Facet
      Test3Facet = await ethers.getContractFactory("Test3Facet");
      test3Facet = await Test3Facet.deploy();
      await test3Facet.deployed();

      // N.B. The facets are not yet connected to the diamond in any way,
      // but following handles prepare us for accessing the diamond via
      // the ABI of these facets, once their functions have been added.

      // Cast Diamond to Test3Facet
      test3ViaDiamond = await ethers.getContractAt("Test3Facet", protocolDiamond.address);
    });

    context("👉 Normal operation", async function () {
      beforeEach(async function () {
        // Encode the initialization call
        initFunction = "initialize(address _testAddress)";
        initInterface = new ethers.utils.Interface([`function ${initFunction}`]);
        initCallData = initInterface.encodeFunctionData("initialize", [rando.address]);

        // Get the Test3Facet function selectors from the abi, removing the initializer
        selectors = getSelectors(test3Facet).remove([initFunction]);

        // Create facet cut payload
        facetCuts = [
          {
            facetAddress: test3Facet.address,
            action: FacetCutAction.Add,
            functionSelectors: selectors,
          },
        ];

        // Execute the Diamond cut
        tx = await cutFacetViaDiamond
          .connect(upgrader)
          .diamondCut(facetCuts, test3Facet.address, initCallData, { gasLimit });

        // Wait for transaction to confirm
        receipt = await tx.wait();

        // Be certain transaction was successful
        assert.equal(receipt.status, 1, `Diamond upgrade failed: ${tx.hash}`);
      });

      it("should call an initializer function if supplied", async () => {
        // Make sure function selectors for the facet are correct
        result = await loupeFacetViaDiamond.facetFunctionSelectors(test3Facet.address);
        assert.sameMembers(result, selectors);
      });

      it("should store initializer state in diamond storage slot when modifier runs", async () => {
        // Make sure initializer state got stored when modifier ran
        result = await test3ViaDiamond.isInitialized();
        assert.equal(result, true, "Initializer state not stored");
      });

      it("should store initializer argument in diamond storage slot when method runs", async () => {
        // Make sure argument passed to initializer got stored when method ran
        result = await test3ViaDiamond.getTestAddress();
        assert.equal(result, rando.address, "Initializer argument not stored");
      });

      it("should call an initializer function on diamond itself", async () => {
        // Deploy mock version of Protocol Diamond with immutable functions and initialzer

        // Core interfaces that will be supported at the Diamond address
        const interfaces = [InterfaceIds.IDiamondLoupe, InterfaceIds.IDiamondCut, InterfaceIds.IERC165];

        // Arguments for Diamond constructor
        const diamondArgs = [
          accessController.address,
          [getFacetAddCut(diamondLoupe), getFacetAddCut(diamondCut), getFacetAddCut(erc165)],
          interfaces,
        ];

        // Deploy Protocol Diamond
        const ProtocolDiamond = await ethers.getContractFactory("TestInitializableDiamond");
        const protocolDiamond = await ProtocolDiamond.deploy(...diamondArgs);
        await protocolDiamond.deployTransaction.wait();

        // Cast new Diamond to DiamondCutFacet
        cutFacetViaDiamond = await ethers.getContractAt("DiamondCutFacet", protocolDiamond.address);

        // Create facet cut payload
        facetCuts = [
          {
            facetAddress: protocolDiamond.address,
            action: FacetCutAction.Add,
            functionSelectors: selectors,
          },
        ];

        // Execute the Diamond cut
        await cutFacetViaDiamond
          .connect(upgrader)
          .diamondCut(facetCuts, protocolDiamond.address, initCallData, { gasLimit });

        // Make sure initializer state got stored when modifier ran
        result = await protocolDiamond.isInitialized();
        assert.equal(result, true, "Initializer state not stored");
      });
    });

    context("💔 Revert Reasons", async function () {
      it("should revert with reason if supplied by implementation", async () => {
        // Encode the initialization call
        initFunction = "initialize(address _testAddress)";
        initInterface = new ethers.utils.Interface([`function ${initFunction}`]);
        initCallData = initInterface.encodeFunctionData("initialize", [accessController.address]);

        // Get the Test3Facet function selectors from the abi, removing the initializer
        selectors = getSelectors(test3Facet).remove([initFunction]);

        // Create facet cut payload
        facetCuts = [
          {
            facetAddress: test3Facet.address,
            action: FacetCutAction.Add,
            functionSelectors: selectors,
          },
        ];

        // If contract address is supplied Test3Facet's initializer will revert with the specific reason
        await expect(
          cutFacetViaDiamond.connect(upgrader).diamondCut(facetCuts, test3Facet.address, initCallData, { gasLimit })
        ).to.revertedWith(RevertReasons.CONTRACT_NOT_ALLOWED);
      });

      it("should revert with library reason if not supplied by implementation", async () => {
        // Encode the initialization call
        initFunction = "initialize(address _testAddress)";
        initInterface = new ethers.utils.Interface([`function ${initFunction}`]);
        initCallData = initInterface.encodeFunctionData("initialize", [upgrader.address]);

        // Get the Test3Facet function selectors from the abi, removing the initializer
        selectors = getSelectors(test3Facet).remove([initFunction]);

        // Create facet cut payload
        facetCuts = [
          {
            facetAddress: test3Facet.address,
            action: FacetCutAction.Add,
            functionSelectors: selectors,
          },
        ];

        // If the caller's address is supplied Test3Facet's initializer will revert with no reason
        // and so the diamondCut function will supply it's own reason
        await expect(
          cutFacetViaDiamond.connect(upgrader).diamondCut(facetCuts, test3Facet.address, initCallData, { gasLimit })
        ).to.revertedWith(RevertReasons.INIT_REVERTED);
      });

      it("should revert if _init is address(0) but _calldata is not empty", async () => {
        // Encode the initialization call
        initFunction = "initialize(address _testAddress)";
        initInterface = new ethers.utils.Interface([`function ${initFunction}`]);
        initCallData = initInterface.encodeFunctionData("initialize", [accessController.address]);

        // Get the Test3Facet function selectors from the abi, removing the initializer
        selectors = getSelectors(test3Facet).remove([initFunction]);

        // Create facet cut payload
        facetCuts = [
          {
            facetAddress: test3Facet.address,
            action: FacetCutAction.Add,
            functionSelectors: selectors,
          },
        ];

        // If contract address is supplied but _calldata is empty, diamondCut will revert with it's own reason
        await expect(
          cutFacetViaDiamond
            .connect(upgrader)
            .diamondCut(facetCuts, ethers.constants.AddressZero, initCallData, { gasLimit })
        ).to.revertedWith(RevertReasons.INIT_ZERO_ADDRESS_NON_EMPTY_CALLDATA);
      });

      it("should revert if _calldata is empty but _init is not address(0)", async () => {
        // Get the Test3Facet function selectors from the abi, removing the initializer
        initFunction = "initialize(address _testAddress)";
        selectors = getSelectors(test3Facet).remove([initFunction]);

        // Create facet cut payload
        facetCuts = [
          {
            facetAddress: test3Facet.address,
            action: FacetCutAction.Add,
            functionSelectors: selectors,
          },
        ];

        // If _calldata is empty, but contract address is not supplied, diamondCut will revert with it's own reason
        await expect(
          cutFacetViaDiamond.connect(upgrader).diamondCut(facetCuts, test3Facet.address, "0x", { gasLimit })
        ).to.revertedWith(RevertReasons.INIT_EMPTY_CALLDATA_NON_ZERO_ADDRESS);
      });

      it("should revert if _init address has no code", async () => {
        // Encode the initialization call
        initFunction = "initialize(address _testAddress)";
        initInterface = new ethers.utils.Interface([`function ${initFunction}`]);
        initCallData = initInterface.encodeFunctionData("initialize", [accessController.address]);

        // Get the Test3Facet function selectors from the abi, removing the initializer
        selectors = getSelectors(test3Facet).remove([initFunction]);

        // Create facet cut payload
        facetCuts = [
          {
            facetAddress: test3Facet.address,
            action: FacetCutAction.Add,
            functionSelectors: selectors,
          },
        ];

        // If contract address has no code, diamondCut will revert with it's own reason
        await expect(
          cutFacetViaDiamond.connect(upgrader).diamondCut(facetCuts, deployer.address, initCallData, { gasLimit })
        ).to.revertedWith(RevertReasons.INIT_ADDRESS_WITH_NO_CODE);
      });

      it("should revert if _accessController is the zero address", async () => {
        // Core interfaces that will be supported at the Diamond address
        const interfaces = [InterfaceIds.IDiamondLoupe, InterfaceIds.IDiamondCut, InterfaceIds.IERC165];

        // Arguments for Diamond constructor
        const diamondArgs = [
          ethers.constants.AddressZero,
          [getFacetAddCut(diamondLoupe), getFacetAddCut(diamondCut), getFacetAddCut(erc165)],
          interfaces,
        ];

        // Attempt to deploy Protocol Diamond
        const ProtocolDiamond = await ethers.getContractFactory("ProtocolDiamond");

        await expect(ProtocolDiamond.deploy(...diamondArgs)).to.revertedWith(RevertReasons.INVALID_ADDRESS);
      });
    });
  });

  // Proxy tests
  context("📋 Proxying", async function () {
    beforeEach(async function () {
      // Deploy Test1Facet
      Test1Facet = await ethers.getContractFactory("Test1Facet");
      test1Facet = await Test1Facet.deploy();
      await test1Facet.deployed();

      // Deploy Test2Facet
      Test2Facet = await ethers.getContractFactory("Test2Facet");
      test2Facet = await Test2Facet.deploy();
      await test2Facet.deployed();

      // Cast Diamond to Test1Facet
      test1ViaDiamond = await ethers.getContractAt("Test1Facet", protocolDiamond.address);

      // Cast Diamond to Test2Facet
      test2ViaDiamond = await ethers.getContractAt("Test2Facet", protocolDiamond.address);

      // Define the facet cuts
      facetCuts = [
        {
          facetAddress: test1Facet.address,
          action: FacetCutAction.Add,
          functionSelectors: getSelectors(test1Facet),
        },
        {
          facetAddress: test2Facet.address,
          action: FacetCutAction.Add,
          functionSelectors: getSelectors(test2Facet),
        },
      ];

      // Send the DiamondCut transaction
      tx = await cutFacetViaDiamond
        .connect(upgrader)
        .diamondCut(facetCuts, ethers.constants.AddressZero, "0x", { gasLimit });

      // Wait for transaction to confirm
      receipt = await tx.wait();
    });

    it("should properly proxy functions located on Test1Facet", async () => {
      assert.isFalse(await test1ViaDiamond.test1Func1());
      assert.isFalse(await test1ViaDiamond.test1Func2());
      assert.isFalse(await test1ViaDiamond.test1Func3());
      assert.isFalse(await test1ViaDiamond.test1Func4());
      assert.isFalse(await test1ViaDiamond.test1Func5());
      assert.isTrue(await test1ViaDiamond.test1Func6());
      assert.isTrue(await test1ViaDiamond.test1Func7());
      assert.isTrue(await test1ViaDiamond.test1Func8());
      assert.isTrue(await test1ViaDiamond.test1Func9());
      assert.isTrue(await test1ViaDiamond.test1Func10());
      assert.isFalse(await test1ViaDiamond.test1Func11());
      assert.isFalse(await test1ViaDiamond.test1Func12());
      assert.isFalse(await test1ViaDiamond.test1Func13());
      assert.isFalse(await test1ViaDiamond.test1Func14());
      assert.isFalse(await test1ViaDiamond.test1Func15());
      assert.isTrue(await test1ViaDiamond.test1Func16());
      assert.isTrue(await test1ViaDiamond.test1Func17());
      assert.isTrue(await test1ViaDiamond.test1Func18());
      assert.isTrue(await test1ViaDiamond.test1Func19());
      assert.isTrue(await test1ViaDiamond.test1Func20());
    });

    it("should properly proxy functions located on Test2Facet", async () => {
      assert.equal(await test2ViaDiamond.test2Func1(), "Boson");
      assert.equal(await test2ViaDiamond.test2Func2(), "Boson");
      assert.equal(await test2ViaDiamond.test2Func3(), "Boson");
      assert.equal(await test2ViaDiamond.test2Func4(), "Boson");
      assert.equal(await test2ViaDiamond.test2Func5(), "Boson");
      assert.equal(await test2ViaDiamond.test2Func6(), "Protocol");
      assert.equal(await test2ViaDiamond.test2Func7(), "Protocol");
      assert.equal(await test2ViaDiamond.test2Func8(), "Protocol");
      assert.equal(await test2ViaDiamond.test2Func9(), "Protocol");
      assert.equal(await test2ViaDiamond.test2Func10(), "Protocol");
      assert.equal(await test2ViaDiamond.test2Func11(), "Boson");
      assert.equal(await test2ViaDiamond.test2Func12(), "Boson");
      assert.equal(await test2ViaDiamond.test2Func13(), "Boson");
      assert.equal(await test2ViaDiamond.test2Func14(), "Boson");
      assert.equal(await test2ViaDiamond.test2Func15(), "Boson");
      assert.equal(await test2ViaDiamond.test2Func16(), "Protocol");
      assert.equal(await test2ViaDiamond.test2Func17(), "Protocol");
      assert.equal(await test2ViaDiamond.test2Func18(), "Protocol");
      assert.equal(await test2ViaDiamond.test2Func19(), "Protocol");
      assert.equal(await test2ViaDiamond.test2Func20(), "Protocol");
    });
  });

  // Modification tests
  context("📋 ERC165Facet", async function () {
    context("👉 addSupportedInterface() - Privileged Access", async function () {
      it("should require UPGRADER to add supported interface", async function () {
        // non-UPGRADER attempt
        await expect(
          erc165ViaDiamond.connect(admin).addSupportedInterface(InterfaceIds.IBosonAccountHandler)
        ).to.be.revertedWith(RevertReasons.ONLY_UPGRADER);

        support = await erc165ViaDiamond.supportsInterface(InterfaceIds.IBosonAccountHandler);

        // Test
        expect(support, "Account handler interface should not be supported").is.false;

        // UPGRADER attempt
        tx = await erc165ViaDiamond.connect(upgrader).addSupportedInterface(InterfaceIds.IBosonAccountHandler);

        // Wait for transaction to confirm
        receipt = await tx.wait();

        // Be certain transaction was successful
        assert.equal(receipt.status, 1, `UPGRADER not able to upgrader ProtocolDiamond`);

        support = await erc165ViaDiamond.supportsInterface(InterfaceIds.IBosonAccountHandler);

        // Test
        expect(support, "Account handler interface should be supported").is.true;
      });
    });

    context("👉 removeSupportedInterface() - Privileged Access", async function () {
      it("should require UPGRADER to remove supported interface", async function () {
        // non-UPGRADER attempt
        await expect(
          erc165ViaDiamond.connect(admin).removeSupportedInterface(InterfaceIds.IERC165Extended)
        ).to.be.revertedWith(RevertReasons.ONLY_UPGRADER);

        support = await erc165ViaDiamond.supportsInterface(InterfaceIds.IERC165Extended);

        // Test
        expect(support, "Extended ERC-165 interface not supported").is.true;

        // UPGRADER attempt
        tx = await erc165ViaDiamond.connect(upgrader).removeSupportedInterface(InterfaceIds.IERC165Extended);

        // Wait for transaction to confirm
        receipt = await tx.wait();

        // Be certain transaction was successful
        assert.equal(receipt.status, 1, `UPGRADER not able to upgrader ProtocolDiamond`);

        support = await erc165ViaDiamond.supportsInterface(InterfaceIds.IERC165Extended);

        // Test
        expect(support, "Extended ERC-165 interface should not be supported").is.false;
      });
    });
  });
});
