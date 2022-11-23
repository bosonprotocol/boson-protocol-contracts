const shell = require("shelljs");
const hre = require("hardhat");
const ethers = hre.ethers;
const { assert, expect } = require("chai");
const Seller = require("../../scripts/domain/Seller");
const AuthToken = require("../../scripts/domain/AuthToken");
const SellerUpdateFields = require("../../scripts/domain/SellerUpdateFields");
const DisputeResolverUpdateFields = require("../../scripts/domain/DisputeResolverUpdateFields");
const DisputeResolver = require("../../scripts/domain/DisputeResolver");
const { DisputeResolverFeeList } = require("../../scripts/domain/DisputeResolverFee");
const { mockAuthToken } = require("../util/mock");
const { deploySuite, upgradeSuite, populateProtocolContract, getProtocolContractState } = require("../util/upgrade");
const { getGenericContext } = require("./01_generic");

const oldVersion = "v2.0.0";
const newVersion = "v2.1.0";

/**
 *  Upgrade test case - After upgrade from 2.0.0 to 2.1.0 everything is still operational
 */
describe("[@skip-on-coverage] After facet upgrade, everything is still operational", function () {
  // Common vars
  let deployer, rando, admin, operator, clerk, treasury;
  let accountHandler, oldHandlers;
  let ERC165Facet;
  let snapshot;
  let protocolDiamondAddress, protocolContracts, mockContracts;

  // reference protocol state
  let protocolContractState;
  let preUpgradeEntities;

  before(async function () {
    // Make accounts available
    [deployer, rando, admin, operator, clerk, treasury] = await ethers.getSigners();

    ({ protocolDiamondAddress, protocolContracts, mockContracts } = await deploySuite(deployer, oldVersion));

    ({ accountHandler, ERC165Facet } = protocolContracts);

    // Populate protocol with data
    preUpgradeEntities = await populateProtocolContract(
      deployer,
      protocolDiamondAddress,
      protocolContracts,
      mockContracts
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
    oldHandlers = { accountHandler: accountHandler }; // store old handler to test old events
    ({ accountHandler, ERC165Facet } = await upgradeSuite(newVersion, protocolDiamondAddress, {
      accountHandler: "IBosonAccountHandler",
      ERC165Facet: "ERC165Facet",
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
        snapshot
      )
    );
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
      it("Seller addresses are not updated in one step, except for the treasury", async function () {
        const oldSeller = preUpgradeEntities.sellers[3];

        const seller = oldSeller.seller.clone();

        seller.admin = admin.address;
        seller.operator = operator.address;
        seller.clerk = clerk.address;
        seller.treasury = treasury.address;

        const authToken = mockAuthToken();

        // Update seller
        await expect(accountHandler.connect(oldSeller.wallet).updateSeller(seller, authToken)).to.not.emit(
          oldHandlers.accountHandler,
          "SellerUpdated"
        );

        // Querying the seller id should return the old seller
        const [, sellerStruct, emptyAuthTokenStruct] = await accountHandler
          .connect(rando)
          .getSeller(oldSeller.seller.id);

        // Parse into entity
        const returnedSeller = Seller.fromStruct(sellerStruct);
        const returnedAuthToken = AuthToken.fromStruct(emptyAuthTokenStruct);

        // Returned values should match the input in createSeller, excpt the treasury, which is updated in one step
        const expectedSeller = oldSeller.seller.clone();
        expectedSeller.treasury = seller.treasury;
        for (const [key, value] of Object.entries(expectedSeller)) {
          assert.equal(JSON.stringify(returnedSeller[key]), JSON.stringify(value), `${key} mismatch`);
        }

        // Returned auth token values should match the input in createSeller
        for (const [key, value] of Object.entries(oldSeller.authToken)) {
          assert.equal(JSON.stringify(returnedAuthToken[key]), JSON.stringify(value), `${key} mismatch`);
        }
      });

      it("Dispute resolver is not updated in one step", async function () {
        const oldDisputeResolver = preUpgradeEntities.DRs[2];

        const disputeResolver = oldDisputeResolver.disputeResolver.clone();

        // New dispute resolver values
        disputeResolver.escalationResponsePeriod = Number(
          Number(disputeResolver.escalationResponsePeriod) - 100
        ).toString();
        disputeResolver.operator = operator.address;
        disputeResolver.admin = admin.address;
        disputeResolver.clerk = clerk.address;
        disputeResolver.treasury = treasury.address;
        disputeResolver.metadataUri = "https://ipfs.io/ipfs/updatedUri";
        disputeResolver.active = false;

        // Update dispute resolver
        await expect(
          accountHandler.connect(oldDisputeResolver.wallet).updateDisputeResolver(disputeResolver)
        ).to.not.emit(oldHandlers.accountHandler, "DisputeResolverUpdated");

        // Querying the dispute resolver id should return the old dispute resolver
        // Get the dispute resolver data as structs
        const [, disputeResolverStruct, disputeResolverFeeListStruct, returnedSellerAllowList] = await accountHandler
          .connect(rando)
          .getDisputeResolver(disputeResolver.id);

        // Parse into entity
        const returnedDisputeResolver = DisputeResolver.fromStruct(disputeResolverStruct);
        const returnedDisputeResolverFeeList = DisputeResolverFeeList.fromStruct(disputeResolverFeeListStruct);

        // Returned values should match the expectedDisputeResolver
        const expectedDisputeResolver = oldDisputeResolver.disputeResolver.clone();
        expectedDisputeResolver.escalationResponsePeriod = disputeResolver.escalationResponsePeriod;
        expectedDisputeResolver.treasury = disputeResolver.treasury;
        expectedDisputeResolver.metadataUri = disputeResolver.metadataUri;
        for (const [key, value] of Object.entries(expectedDisputeResolver)) {
          assert.equal(JSON.stringify(returnedDisputeResolver[key]), JSON.stringify(value), `${key} mismatch`);
        }

        assert.equal(
          returnedDisputeResolverFeeList.toString(),
          new DisputeResolverFeeList(oldDisputeResolver.disputeResolverFees).toString(),
          "Dispute Resolver Fee List is incorrect"
        );

        expect(returnedSellerAllowList.toString()).to.eql(
          oldDisputeResolver.sellerAllowList.toString(),
          "Allowed list wrong"
        );
      });
    });

    context("New methods", async function () {
      it("Supported interface can be added", async function () {
        const interfaceId = "0xaabbccdd";

        // Verify that interface does not exist yet
        let support = await ERC165Facet.supportsInterface(interfaceId);
        expect(support, "Interface should not be supported").is.false;

        // Add interface
        await ERC165Facet.connect(deployer).addSupportedInterface(interfaceId);

        // Verify it was added
        support = await ERC165Facet.supportsInterface(interfaceId);
        expect(support, "Interface should be supported").is.true;
      });

      it("Supported interface can be removed", async function () {
        const interfaceId = "0xddccbbaa";
        // Add interface
        await ERC165Facet.connect(deployer).addSupportedInterface(interfaceId);

        // Verify that interface exist
        let support = await ERC165Facet.supportsInterface(interfaceId);
        expect(support, "Interface should be supported").is.true;

        // Remove interface
        await ERC165Facet.connect(deployer).removeSupportedInterface(interfaceId);

        // Verify it was removed
        support = await ERC165Facet.supportsInterface(interfaceId);
        expect(support, "Interface should not be supported").is.false;
      });

      it("Seller can be updated in two steps", async function () {
        const oldSeller = preUpgradeEntities.sellers[3];

        const seller = oldSeller.seller.clone();
        seller.treasury = treasury.address;
        seller.admin = admin.address;
        seller.operator = operator.address;
        seller.clerk = clerk.address;

        const pendingSellerUpdate = seller.clone();
        pendingSellerUpdate.id = "0";
        pendingSellerUpdate.treasury = ethers.constants.AddressZero;
        pendingSellerUpdate.active = false;

        const expectedSeller = oldSeller.seller.clone();
        // Treasury is the only value that can be updated without address owner authorization
        expectedSeller.treasury = seller.treasury;

        const authToken = mockAuthToken();
        const pendingAuthToken = authToken.clone();
        const oldSellerAuthToken = oldSeller.authToken.toStruct();
        const pendingAuthTokenStruct = pendingAuthToken.toStruct();

        // Update seller
        let tx = await accountHandler.connect(oldSeller.wallet).updateSeller(seller, authToken);

        // Testing for the SellerUpdateApplied event
        await expect(tx)
          .to.emit(accountHandler, "SellerUpdateApplied")
          .withArgs(
            seller.id,
            expectedSeller.toStruct(),
            pendingSellerUpdate.toStruct(),
            oldSellerAuthToken,
            pendingAuthTokenStruct,
            oldSeller.wallet.address
          );

        // Testing for the SellerUpdatePending event
        await expect(tx)
          .to.emit(accountHandler, "SellerUpdatePending")
          .withArgs(seller.id, pendingSellerUpdate.toStruct(), pendingAuthTokenStruct, oldSeller.wallet.address);

        // Update seller operator
        tx = await accountHandler.connect(operator).optInToSellerUpdate(seller.id, [SellerUpdateFields.Operator]);

        pendingSellerUpdate.operator = ethers.constants.AddressZero;
        expectedSeller.operator = seller.operator;

        // Check operator update
        await expect(tx)
          .to.emit(accountHandler, "SellerUpdateApplied")
          .withArgs(
            seller.id,
            expectedSeller.toStruct(),
            pendingSellerUpdate.toStruct(),
            oldSellerAuthToken,
            pendingAuthTokenStruct,
            operator.address
          );

        // Update seller clerk
        tx = await accountHandler.connect(clerk).optInToSellerUpdate(seller.id, [SellerUpdateFields.Clerk]);

        pendingSellerUpdate.clerk = ethers.constants.AddressZero;
        expectedSeller.clerk = seller.clerk;

        // Check operator update
        await expect(tx)
          .to.emit(accountHandler, "SellerUpdateApplied")
          .withArgs(
            seller.id,
            expectedSeller.toStruct(),
            pendingSellerUpdate.toStruct(),
            oldSellerAuthToken,
            pendingAuthTokenStruct,
            clerk.address
          );

        // Update seller admin
        tx = await accountHandler.connect(admin).optInToSellerUpdate(seller.id, [SellerUpdateFields.Admin]);

        pendingSellerUpdate.admin = ethers.constants.AddressZero;
        expectedSeller.admin = seller.admin;

        // Check operator update
        await expect(tx)
          .to.emit(accountHandler, "SellerUpdateApplied")
          .withArgs(
            seller.id,
            expectedSeller.toStruct(),
            pendingSellerUpdate.toStruct(),
            authToken.toStruct(),
            pendingAuthTokenStruct,
            admin.address
          );
      });

      it("Dispute resolver can be updated in two steps", async function () {
        const oldDisputeResolver = preUpgradeEntities.DRs[1];

        const disputeResolver = oldDisputeResolver.disputeResolver.clone();

        // new dispute resolver values
        disputeResolver.escalationResponsePeriod = Number(
          Number(disputeResolver.escalationResponsePeriod) - 100
        ).toString();
        disputeResolver.operator = operator.address;
        disputeResolver.admin = admin.address;
        disputeResolver.clerk = clerk.address;
        disputeResolver.treasury = treasury.address;
        disputeResolver.metadataUri = "https://ipfs.io/ipfs/updatedUri";
        disputeResolver.active = false;

        const disputeResolverPendingUpdate = disputeResolver.clone();
        disputeResolverPendingUpdate.id = "0";
        disputeResolverPendingUpdate.escalationResponsePeriod = "0";
        disputeResolverPendingUpdate.metadataUri = "";
        disputeResolverPendingUpdate.treasury = ethers.constants.AddressZero;

        const expectedDisputeResolver = oldDisputeResolver.disputeResolver.clone();
        expectedDisputeResolver.escalationResponsePeriod = disputeResolver.escalationResponsePeriod;
        expectedDisputeResolver.treasury = disputeResolver.treasury;
        expectedDisputeResolver.metadataUri = disputeResolver.metadataUri;

        // Update dispute resolver
        await expect(accountHandler.connect(oldDisputeResolver.wallet).updateDisputeResolver(disputeResolver))
          .to.emit(accountHandler, "DisputeResolverUpdatePending")
          .withArgs(disputeResolver.id, disputeResolverPendingUpdate.toStruct(), oldDisputeResolver.wallet.address);

        // Approve operator update
        expectedDisputeResolver.operator = disputeResolver.operator;
        disputeResolverPendingUpdate.operator = ethers.constants.AddressZero;

        await expect(
          accountHandler
            .connect(operator)
            .optInToDisputeResolverUpdate(disputeResolver.id, [DisputeResolverUpdateFields.Operator])
        )
          .to.emit(accountHandler, "DisputeResolverUpdateApplied")
          .withArgs(
            disputeResolver.id,
            expectedDisputeResolver.toStruct(),
            disputeResolverPendingUpdate.toStruct(),
            operator.address
          );

        // Approve admin update
        expectedDisputeResolver.admin = disputeResolver.admin;
        disputeResolverPendingUpdate.admin = ethers.constants.AddressZero;

        await expect(
          accountHandler
            .connect(admin)
            .optInToDisputeResolverUpdate(disputeResolver.id, [DisputeResolverUpdateFields.Admin])
        )
          .to.emit(accountHandler, "DisputeResolverUpdateApplied")
          .withArgs(
            disputeResolver.id,
            expectedDisputeResolver.toStruct(),
            disputeResolverPendingUpdate.toStruct(),
            admin.address
          );

        // Approve clerk update
        expectedDisputeResolver.clerk = disputeResolver.clerk;
        disputeResolverPendingUpdate.clerk = ethers.constants.AddressZero;

        await expect(
          accountHandler
            .connect(clerk)
            .optInToDisputeResolverUpdate(disputeResolver.id, [DisputeResolverUpdateFields.Clerk])
        )
          .to.emit(accountHandler, "DisputeResolverUpdateApplied")
          .withArgs(
            disputeResolver.id,
            expectedDisputeResolver.toStruct(),
            disputeResolverPendingUpdate.toStruct(),
            clerk.address
          );
      });
    });
  });
});
