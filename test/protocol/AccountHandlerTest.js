const { ethers } = require("hardhat");
const { ZeroAddress } = ethers;
const { expect } = require("chai");

const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const {
  mockDisputeResolver,
  mockBuyer,
  mockVoucherInitValues,
  mockSeller,
  mockAuthToken,
  mockAgent,
  accountId,
} = require("../util/mock");
const { setupTestEnvironment, getSnapshot, revertToSnapshot } = require("../util/utils");

/**
 *  Test the Boson Account Handler interface
 */
describe("IBosonAccountHandler", function () {
  // Common vars
  let InterfaceIds;
  let rando, assistant, admin, clerk, treasury, other1, other2, other3;
  let erc165, accountHandler;
  let seller;
  let emptyAuthToken;
  let buyer;
  let disputeResolver;
  let disputeResolverFees;
  let sellerAllowList;
  let agent;
  let expected, nextAccountId;
  let support;
  let voucherInitValues;
  let snapshotId;

  before(async function () {
    // get interface Ids
    InterfaceIds = await getInterfaceIds();

    // Specify contracts needed for this test
    const contracts = {
      erc165: "ERC165Facet",
      accountHandler: "IBosonAccountHandler",
    };

    ({
      signers: [admin, treasury, rando, other1, other2, other3],
      contractInstances: { erc165, accountHandler },
    } = await setupTestEnvironment(contracts));

    // make all account the same
    assistant = admin;
    clerk = { address: ZeroAddress };

    // Get snapshot id
    snapshotId = await getSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
    snapshotId = await getSnapshot();
  });

  // Interface support (ERC-156 provided by ProtocolDiamond, others by deployed facets)
  context("📋 Interfaces", async function () {
    context("👉 supportsInterface()", async function () {
      it("should indicate support for IBosonAccountHandler interface", async function () {
        // Current interfaceId for IBosonAccountHandler
        support = await erc165.supportsInterface(InterfaceIds.IBosonAccountHandler);

        // Test
        expect(support, "IBosonAccountHandler interface not supported").is.true;
      });
    });
  });

  // All supported Account Handler methods
  context("📋 Account Handler Methods", async function () {
    beforeEach(async function () {
      // The first seller id
      nextAccountId = "1";

      // Create a valid seller, then set fields in tests directly
      seller = mockSeller(
        await assistant.getAddress(),
        await admin.getAddress(),
        clerk.address,
        await treasury.getAddress()
      );
      expect(seller.isValid()).is.true;

      // VoucherInitValues
      voucherInitValues = mockVoucherInitValues();
      expect(voucherInitValues.isValid()).is.true;

      // AuthToken
      emptyAuthToken = mockAuthToken();
      expect(emptyAuthToken.isValid()).is.true;

      // Create a valid buyer
      buyer = mockBuyer(await other1.getAddress());

      expect(buyer.isValid()).is.true;

      // Create a valid dispute resolver
      disputeResolver = mockDisputeResolver(
        await assistant.getAddress(),
        await admin.getAddress(),
        clerk.address,
        await treasury.getAddress()
      );
      expect(disputeResolver.isValid()).is.true;

      //Create DisputeResolverFee array
      disputeResolverFees = [
        new DisputeResolverFee(await other1.getAddress(), "MockToken1", "0"),
        new DisputeResolverFee(await other2.getAddress(), "MockToken2", "0"),
        new DisputeResolverFee(await other3.getAddress(), "MockToken3", "0"),
      ];

      // Make a sellerAllowList
      sellerAllowList = ["1"];

      // Create a valid agent, then set fields in tests directly
      agent = mockAgent(await other1.getAddress());
      expect(agent.isValid()).is.true;
    });

    afterEach(async function () {
      // Reset the accountId iterator
      accountId.next(true);
    });

    context("👉 getNextAccountId()", async function () {
      beforeEach(async function () {
        // AuthToken
        emptyAuthToken = mockAuthToken();
        expect(emptyAuthToken.isValid()).is.true;

        // Create a seller
        await accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues);

        // increment nextAccountId
        nextAccountId++;
      });

      it("should return the next account id", async function () {
        // What we expect the next seller id to be
        expected = nextAccountId;

        // Get the next seller id
        nextAccountId = await accountHandler.connect(rando).getNextAccountId();

        // Verify expectation
        expect(nextAccountId.toString() == expected).to.be.true;
      });

      it("should be incremented after a seller is created", async function () {
        //addresses need to be unique to seller Id, so setting them to random addresses here
        seller.assistant = await rando.getAddress();
        seller.admin = await rando.getAddress();
        seller.clerk = ZeroAddress;

        // Create another seller
        await accountHandler.connect(rando).createSeller(seller, emptyAuthToken, voucherInitValues);

        // What we expect the next account id to be
        expected = ++nextAccountId;

        // Get the next account id
        nextAccountId = await accountHandler.connect(rando).getNextAccountId();

        // Verify expectation
        expect(nextAccountId.toString() == expected).to.be.true;
      });

      it("should be incremented after a buyer is created", async function () {
        // Create buyer
        await accountHandler.connect(admin).createBuyer(buyer);

        // What we expect the next account id to be
        expected = ++nextAccountId;

        // Get the next account id
        nextAccountId = await accountHandler.connect(rando).getNextAccountId();

        // Verify expectation
        expect(nextAccountId.toString() == expected).to.be.true;
      });

      it("should be incremented after a dispute resolver is created", async function () {
        // Create a dispute resolver
        await accountHandler
          .connect(admin)
          .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

        // What we expect the next account id to be
        expected = ++nextAccountId;

        // Get the next account id
        nextAccountId = await accountHandler.connect(rando).getNextAccountId();

        // Verify expectation
        expect(nextAccountId.toString() == expected).to.be.true;
      });

      it("should be incremented after an agent is created", async function () {
        // Create an agent
        await accountHandler.connect(rando).createAgent(agent);

        // What we expect the next account id to be
        expected = ++nextAccountId;

        // Get the next account id
        nextAccountId = await accountHandler.connect(rando).getNextAccountId();

        // Verify expectation
        expect(nextAccountId.toString() == expected).to.be.true;
      });

      it("should not be incremented when only getNextAccountId is called", async function () {
        // What we expect the next seller id to be
        expected = nextAccountId;

        // Get the next seller id
        nextAccountId = await accountHandler.connect(rando).getNextAccountId();

        // Verify expectation
        expect(nextAccountId.toString() == expected).to.be.true;

        // Call again
        nextAccountId = await accountHandler.connect(rando).getNextAccountId();

        // Verify expectation
        expect(nextAccountId.toString() == expected).to.be.true;
      });
    });
  });
});
