const shell = require("shelljs");
const hre = require("hardhat");
const ethers = hre.ethers;
const { assert, expect } = require("chai");
const DisputeResolver = require("../../scripts/domain/DisputeResolver");
const { mockDisputeResolver } = require("../util/mock");
const {
  deploySuite,
  upgradeSuite,
  populateProtocolContract,
  getProtocolContractState,
  revertState,
} = require("../util/upgrade");
const { getGenericContext } = require("./01_generic");

const oldVersion = "v2.1.0";
const newVersion = "v2.2.0";
const v2_1_0_scripts = "b02a583ddb720bbe36fa6e29c344d35e957deb8b";

/**
 *  Upgrade test case - After upgrade from 2.1.0 to 2.0.0 everything is still operational
 */
describe("[@skip-on-coverage] After facet upgrade, everything is still operational", function () {
  // Common vars
  let deployer, rando;
  let accountHandler;
  let snapshot;
  let protocolDiamondAddress, protocolContracts, mockContracts;

  // reference protocol state
  let protocolContractState;
  let preUpgradeEntities;

  before(async function () {
    try {
      // Make accounts available
      [deployer, rando] = await ethers.getSigners();

      ({ protocolDiamondAddress, protocolContracts, mockContracts } = await deploySuite(
        deployer,
        oldVersion,
        v2_1_0_scripts
      ));

      // ({ accountHandler } = protocolContracts);

      // Populate protocol with data
      preUpgradeEntities = await populateProtocolContract(
        deployer,
        protocolDiamondAddress,
        protocolContracts,
        mockContracts,
        oldVersion
      );

      // Get current protocol state, which serves as the reference
      // We assume that this state is a true one, relying on our unit and integration tests
      protocolContractState = await getProtocolContractState(
        protocolDiamondAddress,
        protocolContracts,
        mockContracts,
        preUpgradeEntities
      );

      // Upgrade protocol
      // oldHandlers = { accountHandler: accountHandler }; // store old handler to test old events
      ({ accountHandler } = await upgradeSuite(newVersion, protocolDiamondAddress, {
        accountHandler: "IBosonAccountHandler",
      }));
      protocolContracts.accountHandler = accountHandler;

      snapshot = await ethers.provider.send("evm_snapshot", []);

      // This context is placed in an uncommon place due to order of test execution.
      // Generic context needs values that are set in "before", however "before" is executed before tests, not before suites
      // and those values are undefined if this is placed outside "before".
      // Normally, this would be solved with mocha's --delay option, but it does not behave as expected when running with hardhat.
      context(
        "Generic tests",
        getGenericContext(
          deployer,
          protocolDiamondAddress,
          protocolContracts,
          mockContracts,
          protocolContractState,
          preUpgradeEntities,
          snapshot,
          newVersion
        )
      );
    } catch (err) {
      // revert to latest version of scripts and contracts
      revertState();
      // stop execution
      assert(false, `Before all reverts with: ${err}`);
    }
  });

  afterEach(async function () {
    // Revert to state right after the upgrade.
    // This is used so the lengthly setup (deploy+upgrade) is done only once.
    await ethers.provider.send("evm_revert", [snapshot]);
    snapshot = await ethers.provider.send("evm_snapshot", []);
  });

  after(async function () {
    // Revert to latest state of contracts
    shell.exec(`git checkout HEAD contracts`);
  });

  // Test actions that worked in previous version, but should not work anymore, or work differently
  // Test methods that were added to see that upgrade was succesful
  context("📋 Breaking changes and new methods", async function () {
    context("Breaking changes", async function () {
      it("DR can be activated on creation", async function () {
        const { nextAccountId } = protocolContractState.accountContractState;

        // DR shouldn't exist previously
        const [exist] = await accountHandler.getDisputeResolver(nextAccountId);
        expect(exist, "DR should not exist").to.be.false;

        // New DR must be created with active = true
        const DR = mockDisputeResolver(rando.address, rando.address, rando.address, rando.address, true);
        DR.id = nextAccountId.toString();

        await accountHandler.connect(rando).createDisputeResolver(DR, [], []);

        // Validate if new DR is active
        let [, DRCreated] = await accountHandler.getDisputeResolver(DR.id);
        DRCreated = DisputeResolver.fromStruct(DRCreated);
        expect(DRCreated).to.deep.equal(DR);
      });
    });

    // context("New methods", async function () {
    //   it("Supported interface can be added", async function () {
    //     const interfaceId = "0xaabbccdd";

    //     // Verify that interface does not exist yet
    //     let support = await ERC165Facet.supportsInterface(interfaceId);
    //     expect(support, "Interface should not be supported").is.false;

    //     // Add interface
    //     await ERC165Facet.connect(deployer).addSupportedInterface(interfaceId);

    //     // Verify it was added
    //     support = await ERC165Facet.supportsInterface(interfaceId);
    //     expect(support, "Interface should be supported").is.true;
    //   });

    //   it("Supported interface can be removed", async function () {
    //     const interfaceId = "0xddccbbaa";
    //     // Add interface
    //     await ERC165Facet.connect(deployer).addSupportedInterface(interfaceId);

    //     // Verify that interface exist
    //     let support = await ERC165Facet.supportsInterface(interfaceId);
    //     expect(support, "Interface should be supported").is.true;

    //     // Remove interface
    //     await ERC165Facet.connect(deployer).removeSupportedInterface(interfaceId);

    //     // Verify it was removed
    //     support = await ERC165Facet.supportsInterface(interfaceId);
    //     expect(support, "Interface should not be supported").is.false;
    //   });

    //   it("Seller can be updated in two steps", async function () {
    //     const oldSeller = preUpgradeEntities.sellers[3];

    //     const seller = oldSeller.seller.clone();
    //     seller.treasury = treasury.address;
    //     seller.admin = admin.address;
    //     seller.operator = operator.address;
    //     seller.clerk = clerk.address;

    //     const pendingSellerUpdate = seller.clone();
    //     pendingSellerUpdate.id = "0";
    //     pendingSellerUpdate.treasury = ethers.constants.AddressZero;
    //     pendingSellerUpdate.active = false;

    //     const expectedSeller = oldSeller.seller.clone();
    //     // Treasury is the only value that can be updated without address owner authorization
    //     expectedSeller.treasury = seller.treasury;

    //     const authToken = mockAuthToken();
    //     const pendingAuthToken = authToken.clone();
    //     const oldSellerAuthToken = oldSeller.authToken.toStruct();
    //     const pendingAuthTokenStruct = pendingAuthToken.toStruct();

    //     // Update seller
    //     let tx = await accountHandler.connect(oldSeller.wallet).updateSeller(seller, authToken);

    //     // Testing for the SellerUpdateApplied event
    //     await expect(tx)
    //       .to.emit(accountHandler, "SellerUpdateApplied")
    //       .withArgs(
    //         seller.id,
    //         expectedSeller.toStruct(),
    //         pendingSellerUpdate.toStruct(),
    //         oldSellerAuthToken,
    //         pendingAuthTokenStruct,
    //         oldSeller.wallet.address
    //       );

    //     // Testing for the SellerUpdatePending event
    //     await expect(tx)
    //       .to.emit(accountHandler, "SellerUpdatePending")
    //       .withArgs(seller.id, pendingSellerUpdate.toStruct(), pendingAuthTokenStruct, oldSeller.wallet.address);

    //     // Update seller operator
    //     tx = await accountHandler.connect(operator).optInToSellerUpdate(seller.id, [SellerUpdateFields.Operator]);

    //     pendingSellerUpdate.operator = ethers.constants.AddressZero;
    //     expectedSeller.operator = seller.operator;

    //     // Check operator update
    //     await expect(tx)
    //       .to.emit(accountHandler, "SellerUpdateApplied")
    //       .withArgs(
    //         seller.id,
    //         expectedSeller.toStruct(),
    //         pendingSellerUpdate.toStruct(),
    //         oldSellerAuthToken,
    //         pendingAuthTokenStruct,
    //         operator.address
    //       );

    //     // Update seller clerk
    //     tx = await accountHandler.connect(clerk).optInToSellerUpdate(seller.id, [SellerUpdateFields.Clerk]);

    //     pendingSellerUpdate.clerk = ethers.constants.AddressZero;
    //     expectedSeller.clerk = seller.clerk;

    //     // Check operator update
    //     await expect(tx)
    //       .to.emit(accountHandler, "SellerUpdateApplied")
    //       .withArgs(
    //         seller.id,
    //         expectedSeller.toStruct(),
    //         pendingSellerUpdate.toStruct(),
    //         oldSellerAuthToken,
    //         pendingAuthTokenStruct,
    //         clerk.address
    //       );

    //     // Update seller admin
    //     tx = await accountHandler.connect(admin).optInToSellerUpdate(seller.id, [SellerUpdateFields.Admin]);

    //     pendingSellerUpdate.admin = ethers.constants.AddressZero;
    //     expectedSeller.admin = seller.admin;

    //     // Check operator update
    //     await expect(tx)
    //       .to.emit(accountHandler, "SellerUpdateApplied")
    //       .withArgs(
    //         seller.id,
    //         expectedSeller.toStruct(),
    //         pendingSellerUpdate.toStruct(),
    //         authToken.toStruct(),
    //         pendingAuthTokenStruct,
    //         admin.address
    //       );
    //   });

    //   it("Dispute resolver can be updated in two steps", async function () {
    //     const oldDisputeResolver = preUpgradeEntities.DRs[1];

    //     const disputeResolver = oldDisputeResolver.disputeResolver.clone();

    //     // new dispute resolver values
    //     disputeResolver.escalationResponsePeriod = Number(
    //       Number(disputeResolver.escalationResponsePeriod) - 100
    //     ).toString();
    //     disputeResolver.operator = operator.address;
    //     disputeResolver.admin = admin.address;
    //     disputeResolver.clerk = clerk.address;
    //     disputeResolver.treasury = treasury.address;
    //     disputeResolver.metadataUri = "https://ipfs.io/ipfs/updatedUri";
    //     disputeResolver.active = false;

    //     const disputeResolverPendingUpdate = disputeResolver.clone();
    //     disputeResolverPendingUpdate.id = "0";
    //     disputeResolverPendingUpdate.escalationResponsePeriod = "0";
    //     disputeResolverPendingUpdate.metadataUri = "";
    //     disputeResolverPendingUpdate.treasury = ethers.constants.AddressZero;

    //     const expectedDisputeResolver = oldDisputeResolver.disputeResolver.clone();
    //     expectedDisputeResolver.escalationResponsePeriod = disputeResolver.escalationResponsePeriod;
    //     expectedDisputeResolver.treasury = disputeResolver.treasury;
    //     expectedDisputeResolver.metadataUri = disputeResolver.metadataUri;

    //     // Update dispute resolver
    //     await expect(accountHandler.connect(oldDisputeResolver.wallet).updateDisputeResolver(disputeResolver))
    //       .to.emit(accountHandler, "DisputeResolverUpdatePending")
    //       .withArgs(disputeResolver.id, disputeResolverPendingUpdate.toStruct(), oldDisputeResolver.wallet.address);

    //     // Approve operator update
    //     expectedDisputeResolver.operator = disputeResolver.operator;
    //     disputeResolverPendingUpdate.operator = ethers.constants.AddressZero;

    //     await expect(
    //       accountHandler
    //         .connect(operator)
    //         .optInToDisputeResolverUpdate(disputeResolver.id, [DisputeResolverUpdateFields.Operator])
    //     )
    //       .to.emit(accountHandler, "DisputeResolverUpdateApplied")
    //       .withArgs(
    //         disputeResolver.id,
    //         expectedDisputeResolver.toStruct(),
    //         disputeResolverPendingUpdate.toStruct(),
    //         operator.address
    //       );

    //     // Approve admin update
    //     expectedDisputeResolver.admin = disputeResolver.admin;
    //     disputeResolverPendingUpdate.admin = ethers.constants.AddressZero;

    //     await expect(
    //       accountHandler
    //         .connect(admin)
    //         .optInToDisputeResolverUpdate(disputeResolver.id, [DisputeResolverUpdateFields.Admin])
    //     )
    //       .to.emit(accountHandler, "DisputeResolverUpdateApplied")
    //       .withArgs(
    //         disputeResolver.id,
    //         expectedDisputeResolver.toStruct(),
    //         disputeResolverPendingUpdate.toStruct(),
    //         admin.address
    //       );

    //     // Approve clerk update
    //     expectedDisputeResolver.clerk = disputeResolver.clerk;
    //     disputeResolverPendingUpdate.clerk = ethers.constants.AddressZero;

    //     await expect(
    //       accountHandler
    //         .connect(clerk)
    //         .optInToDisputeResolverUpdate(disputeResolver.id, [DisputeResolverUpdateFields.Clerk])
    //     )
    //       .to.emit(accountHandler, "DisputeResolverUpdateApplied")
    //       .withArgs(
    //         disputeResolver.id,
    //         expectedDisputeResolver.toStruct(),
    //         disputeResolverPendingUpdate.toStruct(),
    //         clerk.address
    //       );
    //   });
    // });
  });
});
