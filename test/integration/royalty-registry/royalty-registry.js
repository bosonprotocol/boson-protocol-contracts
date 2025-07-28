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
const { ROYALTY_REGISTRY_ADDRESS, ROYALTY_ENGINE_ADDRESS } = require("../../util/constants.js");

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
const { RoyaltyRecipientInfo, RoyaltyRecipientInfoList } = require("../../../scripts/domain/RoyaltyRecipientInfo.js");

// Requirements to run this test:
// - Royalty registry is a submodule. If you didn't clone repository recursively, run `git submodule update --init --recursive` to get it.
// - Set hardhat config to hardhat-fork.config.js. e.g.:
//   npx hardhat test test/integration/royalty-registry/royalty-registry.js --config ./hardhat-fork.config.js
describe("[@skip-on-coverage] Royalty registry integration", function () {
  let royaltyEngine, royaltyRegistry;
  let bosonVoucher;
  let assistant, buyer, DR, other1, other2;
  let seller;
  let offerHandler, exchangeCommitHandler, fundsHandler, accountHandler;
  let offerId, offerPrice, exchangeId, tokenId;
  let snapshotId;

  before(async function () {
    accountId.next(true);
    royaltyEngine = await getContractAt("RoyaltyEngineV1", ROYALTY_ENGINE_ADDRESS);
    royaltyRegistry = await getContractAt(
      "submodules/royalty-registry-solidity/contracts/IRoyaltyRegistry.sol:IRoyaltyRegistry",
      ROYALTY_REGISTRY_ADDRESS
    );

    // Specify contracts needed for this test
    const contracts = {
      accountHandler: "IBosonAccountHandler",
      offerHandler: "IBosonOfferHandler",
      fundsHandler: "IBosonFundsHandler",
      exchangeCommitHandler: "IBosonExchangeCommitHandler",
    };

    ({
      signers: [assistant, buyer, DR, other1, other2],
      contractInstances: { accountHandler, offerHandler, fundsHandler, exchangeCommitHandler },
      extraReturnValues: { bosonVoucher },
    } = await setupTestEnvironment(contracts));

    seller = mockSeller(assistant.address, assistant.address, ZeroAddress, assistant.address);

    const emptyAuthToken = mockAuthToken();
    const voucherInitValues = mockVoucherInitValues();
    voucherInitValues.royaltyPercentage = 100; // 1%
    await accountHandler.connect(assistant).createSeller(seller, emptyAuthToken, voucherInitValues);

    // Add royalty recipients
    const royaltyRecipientList = new RoyaltyRecipientInfoList([
      new RoyaltyRecipientInfo(other1.address, "100"),
      new RoyaltyRecipientInfo(other2.address, "200"),
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

  const recipients = ["other", "treasury", "multiple"];

  recipients.forEach((recipient) => {
    context(recipient, function () {
      let expectedRecipients, expectedRoyaltyAmounts;
      let offer, offerDates, offerDurations, drParams, agentId, offerFeeLimit;

      beforeEach(async function () {
        let bps;
        if (recipient === "multiple") {
          await royaltyRegistry
            .connect(assistant)
            .setRoyaltyLookupAddress(await bosonVoucher.getAddress(), await offerHandler.getAddress());
          expectedRecipients = [other1.address, other2.address];
          bps = [100, 200];
        } else {
          expectedRecipients = [recipient === "other" ? other1.address : seller.treasury];
          bps = [100];
        }

        ({ offer, offerDates, offerDurations, drParams } = await mockOffer());
        offer.quantityAvailable = 10;
        offer.royaltyInfo = [
          new RoyaltyInfo(expectedRecipients[0] == seller.treasury ? [ZeroAddress] : expectedRecipients, bps),
        ];
        offerPrice = offer.price;
        agentId = "0";
        offerFeeLimit = MaxUint256;

        await offerHandler
          .connect(assistant)
          .createOffer(offer, offerDates, offerDurations, drParams, agentId, offerFeeLimit);

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
        expectedRoyaltyAmounts = bps.map((bp) => BigInt(applyPercentage(offerPrice, bp)));
      });

      context("EIP2981", function () {
        it("Normal voucher", async function () {
          // Commit to an offer
          await exchangeCommitHandler.connect(buyer).commitToOffer(buyer.address, offerId, { value: offerPrice });

          // get royalty info directly from voucher contract
          let [recipient, royaltyAmount] = await bosonVoucher.royaltyInfo(tokenId, offerPrice);

          // Expectations
          let expectedRoyaltyAmount = expectedRoyaltyAmounts.reduce((a, b) => a + b, 0n);

          assert.equal(recipient, expectedRecipients[0], "Receiver address is incorrect");
          assert.equal(royaltyAmount.toString(), expectedRoyaltyAmount, "Royalty amount is incorrect");

          // get royalty info directly from royalty registry
          let [recipients, amounts] = await royaltyEngine.getRoyaltyView(
            await bosonVoucher.getAddress(),
            tokenId,
            offerPrice
          );

          // Expectations
          assert.deepEqual(recipients, expectedRecipients, "Receiver address is incorrect");
          assert.deepEqual(amounts, expectedRoyaltyAmounts, "Royalty amount is incorrect");
        });

        it("Preminted voucher", async function () {
          await offerHandler.connect(assistant).reserveRange(offerId, 1, assistant.address);
          await bosonVoucher.connect(assistant).preMint(offerId, 1);

          // get royalty info directly from voucher contract
          let [recipient, royaltyAmount] = await bosonVoucher.royaltyInfo(tokenId, offerPrice);

          // Expectations
          let expectedRoyaltyAmount = expectedRoyaltyAmounts.reduce((a, b) => a + b, 0n);

          assert.equal(recipient, expectedRecipients[0], "Receiver address is incorrect");
          assert.equal(royaltyAmount.toString(), expectedRoyaltyAmount, "Royalty amount is incorrect");

          // get royalty info directly from royalty registry
          let [recipients, amounts] = await royaltyEngine.getRoyaltyView(
            await bosonVoucher.getAddress(),
            tokenId,
            offerPrice
          );

          // Expectations
          assert.deepEqual(recipients, expectedRecipients, "Receiver address is incorrect");
          assert.deepEqual(amounts, expectedRoyaltyAmounts, "Royalty amount is incorrect");
        });

        it("Preminted voucher - multiple ranges", async function () {
          for (let i = 0; i < 50; i++) {
            await offerHandler
              .connect(assistant)
              .createOffer(offer, offerDates, offerDurations, drParams, agentId, offerFeeLimit);
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
          let expectedRoyaltyAmount = expectedRoyaltyAmounts.reduce((a, b) => a + b, 0n);

          assert.equal(recipient, expectedRecipients[0], "Receiver address is incorrect");
          assert.equal(royaltyAmount.toString(), expectedRoyaltyAmount, "Royalty amount is incorrect");

          // get royalty info directly from royalty registry
          let [recipients, amounts] = await royaltyEngine.getRoyaltyView(
            await bosonVoucher.getAddress(),
            tokenId,
            offerPrice
          );

          // Expectations
          assert.deepEqual(recipients, expectedRecipients, "Receiver address is incorrect");
          assert.deepEqual(amounts, expectedRoyaltyAmounts, "Royalty amount is incorrect");
        });
      });
    });
  });
});
