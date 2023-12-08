const { ethers } = require("hardhat");
const { ZeroAddress, getContractAt, MaxUint256 } = ethers;
const {
  calculateBosonProxyAddress,
  calculateCloneAddress,
  applyPercentage,
  setupTestEnvironment,
  deriveTokenId,
  getSnapshot,
  revertToSnapshot,
} = require("../../util/utils.js");
const { ROYALTY_REGISTRY_ADDRESS } = require("../../util/constants.js");

const {
  mockSeller,
  mockAuthToken,
  mockVoucherInitValues,
  mockOffer,
  mockDisputeResolver,
  accountId,
} = require("../../util/mock.js");
const { assert } = require("chai");
const { DisputeResolverFee } = require("../../../scripts/domain/DisputeResolverFee.js");
const { RoyaltyInfo } = require("../../../scripts/domain/RoyaltyInfo.js");
const { RoyaltyRecipient, RoyaltyRecipientList } = require("../../../scripts/domain/RoyaltyRecipient.js");

// Requirements to run this test:
// - Royalty registry is a submodule. If you didn't clone repository recursively, run `git submodule update --init --recursive` to get it.
// - Set hardhat config to hardhat-fork.config.js. e.g.:
//   npx hardhat test test/integration/royalty-registry/royalty-registry.js --config ./hardhat-fork.config.js
describe("[@skip-on-coverage] Royalty registry integration", function () {
  let royaltyRegistry;
  let bosonVoucher;
  let assistant, buyer, DR, other1, other2;
  let seller, royaltyInfo;
  let offerHandler, exchangeHandler, fundsHandler, accountHandler;
  let offerId, offerPrice, exchangeId, tokenId;
  let snapshotId;

  before(async function () {
    accountId.next(true);
    royaltyRegistry = await getContractAt("RoyaltyEngineV1", ROYALTY_REGISTRY_ADDRESS);

    // Specify contracts needed for this test
    const contracts = {
      accountHandler: "IBosonAccountHandler",
      offerHandler: "IBosonOfferHandler",
      fundsHandler: "IBosonFundsHandler",
      exchangeHandler: "IBosonExchangeHandler",
    };

    ({
      signers: [assistant, buyer, DR, other1, other2],
      contractInstances: { accountHandler, offerHandler, fundsHandler, exchangeHandler },
      extraReturnValues: { bosonVoucher },
    } = await setupTestEnvironment(contracts));

    seller = mockSeller(assistant.address, assistant.address, ZeroAddress, assistant.address);

    const emptyAuthToken = mockAuthToken();
    const voucherInitValues = mockVoucherInitValues();
    voucherInitValues.royaltyPercentage = 100; // 1%
    await accountHandler.connect(assistant).createSeller(seller, emptyAuthToken, voucherInitValues);

    // Add royalty recipients
    const royaltyRecipientList = new RoyaltyRecipientList([
      new RoyaltyRecipient(other1.address, "100", "other1"),
      new RoyaltyRecipient(other2.address, "200", "other2"),
    ]);
    await accountHandler.connect(assistant).addRoyaltyRecipients(seller.id, royaltyRecipientList.toStruct());

    const disputeResolver = mockDisputeResolver(DR.address, DR.address, ZeroAddress, DR.address, true);

    const disputeResolverFees = [new DisputeResolverFee(ZeroAddress, "Native", "0")];
    const sellerAllowList = [];

    await accountHandler.connect(DR).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

    // Get snapshot id
    snapshotId = await getSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
    snapshotId = await getSnapshot();

    // Reset
    accountId.next(true);
  });

  const recipients = ["other", "treasury"];

  recipients.forEach((recipient) => {
    context(recipient, function () {
      let expectedRecipient;
      let offer, offerDates, offerDurations, disputeResolverId, agentId, offerFeeLimit;

      beforeEach(async function () {
        expectedRecipient = recipient === "other" ? other1.address : seller.treasury;

        ({ offer, offerDates, offerDurations, disputeResolverId } = await mockOffer());
        offer.quantityAvailable = 10;
        offer.royaltyInfo = [
          new RoyaltyInfo([expectedRecipient == seller.treasury ? ZeroAddress : expectedRecipient], [100]),
        ];
        royaltyInfo = offer.royaltyInfo[0];
        offerPrice = offer.price;
        agentId = "0";
        offerFeeLimit = MaxUint256;

        await offerHandler
          .connect(assistant)
          .createOffer(
            offer.toStruct(),
            offerDates.toStruct(),
            offerDurations.toStruct(),
            disputeResolverId,
            agentId,
            offerFeeLimit
          );

        const beaconProxyAddress = await calculateBosonProxyAddress(await accountHandler.getAddress());
        const voucherAddress = calculateCloneAddress(
          await accountHandler.getAddress(),
          beaconProxyAddress,
          seller.admin
        );
        bosonVoucher = await getContractAt("BosonVoucher", voucherAddress);

        // Pool needs to cover both seller deposit and price
        const pool = BigInt(offer.sellerDeposit) + BigInt(offer.price);
        await fundsHandler.connect(assistant).depositFunds(seller.id, ZeroAddress, pool, {
          value: pool,
        });

        exchangeId = 1;
        offerId = 1;
        tokenId = deriveTokenId(offerId, exchangeId);
      });

      context("EIP2981", function () {
        it("Normal voucher", async function () {
          // Commit to an offer
          await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: offerPrice });

          // get royalty info directly from voucher contract
          let [recipient, royaltyAmount] = await bosonVoucher.royaltyInfo(tokenId, offerPrice);

          // Expectations
          let expectedRoyaltyAmount = applyPercentage(offerPrice, royaltyInfo.bps[0]);

          assert.equal(recipient, expectedRecipient, "Receiver address is incorrect");
          assert.equal(royaltyAmount.toString(), expectedRoyaltyAmount, "Royalty amount is incorrect");

          // get royalty info directly from royalty registry
          let [recipients, amounts] = await royaltyRegistry.getRoyaltyView(
            await bosonVoucher.getAddress(),
            tokenId,
            offerPrice
          );

          // Expectations
          let expectedRecipients = [expectedRecipient];
          let expectedRoyaltyAmounts = [expectedRoyaltyAmount];

          assert.deepEqual(recipients, expectedRecipients, "Receiver address is incorrect");
          assert.deepEqual(
            amounts.map((a) => a.toString()),
            expectedRoyaltyAmounts,
            "Royalty amount is incorrect"
          );
        });

        it("Preminted voucher", async function () {
          await offerHandler.connect(assistant).reserveRange(offerId, 1, assistant.address);
          await bosonVoucher.connect(assistant).preMint(offerId, 1);

          // get royalty info directly from voucher contract
          let [recipient, royaltyAmount] = await bosonVoucher.royaltyInfo(tokenId, offerPrice);

          // Expectations
          let expectedRoyaltyAmount = applyPercentage(offerPrice, royaltyInfo.bps[0]);

          assert.equal(recipient, expectedRecipient, "Receiver address is incorrect");
          assert.equal(royaltyAmount.toString(), expectedRoyaltyAmount, "Royalty amount is incorrect");

          // get royalty info directly from royalty registry
          let [recipients, amounts] = await royaltyRegistry.getRoyaltyView(
            await bosonVoucher.getAddress(),
            tokenId,
            offerPrice
          );

          // Expectations
          let expectedRecipients = [expectedRecipient];
          let expectedRoyaltyAmounts = [expectedRoyaltyAmount];

          assert.deepEqual(recipients, expectedRecipients, "Receiver address is incorrect");
          assert.deepEqual(
            amounts.map((a) => a.toString()),
            expectedRoyaltyAmounts,
            "Royalty amount is incorrect"
          );
        });

        it("Preminted voucher - multiple ranges", async function () {
          for (let i = 0; i < 50; i++) {
            await offerHandler
              .connect(assistant)
              .createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId, offerFeeLimit);
            offerId++;

            // reserve length
            await offerHandler.connect(assistant).reserveRange(offerId, 10, assistant.address);
          }
          offerId = 25;
          exchangeId = (offerId - 2) * 10 + 5;

          await bosonVoucher.connect(assistant).preMint(offerId, 10);

          // get royalty info directly from voucher contract
          tokenId = deriveTokenId(offerId, exchangeId);
          let [recipient, royaltyAmount] = await bosonVoucher.royaltyInfo(tokenId, offerPrice);

          // Expectations
          let expectedRoyaltyAmount = applyPercentage(offerPrice, royaltyInfo.bps[0]);

          assert.equal(recipient, expectedRecipient, "Receiver address is incorrect");
          assert.equal(royaltyAmount.toString(), expectedRoyaltyAmount, "Royalty amount is incorrect");

          // get royalty info directly from royalty registry
          let [recipients, amounts] = await royaltyRegistry.getRoyaltyView(
            await bosonVoucher.getAddress(),
            tokenId,
            offerPrice
          );

          // Expectations
          let expectedRecipients = [expectedRecipient];
          let expectedRoyaltyAmounts = [expectedRoyaltyAmount];

          assert.deepEqual(recipients, expectedRecipients, "Receiver address is incorrect");
          assert.deepEqual(
            amounts.map((a) => a.toString()),
            expectedRoyaltyAmounts,
            "Royalty amount is incorrect"
          );
        });
      });
    });
  });
});
