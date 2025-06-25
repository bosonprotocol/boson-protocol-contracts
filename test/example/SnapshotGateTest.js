const { ethers } = require("hardhat");
const { getContractAt, parseUnits, ZeroAddress, getSigners, MaxUint256 } = ethers;
const { expect } = require("chai");

const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const Role = require("../../scripts/domain/Role");
const TokenType = require("../../scripts/domain/TokenType");
const Group = require("../../scripts/domain/Group");
const EvaluationMethod = require("../../scripts/domain/EvaluationMethod");
const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const { deployAndCutFacets } = require("../../scripts/util/deploy-protocol-handler-facets.js");
const { deployProtocolClients } = require("../../scripts/util/deploy-protocol-clients");
const {
  mockOffer,
  mockDisputeResolver,
  mockAuthToken,
  mockVoucherInitValues,
  mockSeller,
  mockCondition,
  accountId,
} = require("../util/mock");
const { oneWeek, oneMonth, maxPriorityFeePerGas } = require("../util/constants");
const { deploySnapshotGateExample } = require("../../scripts/example/SnapshotGate/deploy-snapshot-gate");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");
const { getEvent, getFacetsWithArgs } = require("../util/utils");

/**
 *  Test the SnapshotGate example contract
 */
describe("SnapshotGate", function () {
  // Common vars
  let deployer,
    pauser,
    assistant,
    assistant2,
    admin,
    clerk,
    treasury,
    rando,
    assistantDR,
    adminDR,
    clerkDR,
    treasuryDR,
    protocolTreasury,
    bosonToken,
    holder1,
    holder2,
    holder3,
    holder4,
    holder5;
  let protocolDiamond, accessController, accountHandler, offerHandler, groupHandler, exchangeHandler;
  let offerId, seller, seller2, disputeResolverId;
  let price, foreign20;
  let protocolFeePercentage, protocolFeeFlatBoson, buyerEscalationDepositPercentage;
  let disputeResolver, disputeResolverFees;
  let snapshotGate;
  let groupId, offerIds, condition, group, groups;
  let voucherInitValues;
  let emptyAuthToken;
  let sellerId, agentId;
  let offer, offers, otherSellerOfferId;
  let offerDates, offerDurations;
  let snapshot, snapshotTokenSupplies, snapshotTokenCount, holders, holderByAddress;
  let offerFeeLimit;
  let bosonErrors;

  beforeEach(async function () {
    // Reset the accountId iterator
    accountId.next(true);

    let priceDiscovery;

    // Make accounts available
    [
      deployer,
      pauser,
      admin,
      treasury,
      rando,
      adminDR,
      treasuryDR,
      protocolTreasury,
      assistant2,
      bosonToken,
      holder1,
      holder2,
      holder3,
      holder4,
      holder5,
      priceDiscovery,
    ] = await getSigners();

    // make all account the same
    assistant = admin;
    assistantDR = adminDR;
    clerk = clerkDR = { address: ZeroAddress };

    // Deploy the Protocol Diamond
    [protocolDiamond, , , , accessController] = await deployProtocolDiamond(maxPriorityFeePerGas);

    // Temporarily grant UPGRADER role to deployer account
    await accessController.grantRole(Role.UPGRADER, await deployer.getAddress());

    // Grant PROTOCOL role to ProtocolDiamond address and renounces admin
    await accessController.grantRole(Role.PROTOCOL, await protocolDiamond.getAddress());

    // Temporarily grant PAUSER role to pauser account
    await accessController.grantRole(Role.PAUSER, await pauser.getAddress());

    // Deploy the Protocol client implementation/proxy pairs (currently just the Boson Voucher)
    const protocolClientArgs = [await protocolDiamond.getAddress()];
    const [, beacons] = await deployProtocolClients(protocolClientArgs, maxPriorityFeePerGas);
    const [beacon] = beacons;

    // Set protocolFees
    protocolFeePercentage = "200"; // 2 %
    protocolFeeFlatBoson = parseUnits("0.01", "ether").toString();
    buyerEscalationDepositPercentage = "1000"; // 10%

    // Add config Handler, so ids start at 1, and so voucher address can be found
    const protocolConfig = [
      // Protocol addresses
      {
        treasury: await protocolTreasury.getAddress(),
        token: await bosonToken.getAddress(),
        voucherBeacon: await beacon.getAddress(),
        beaconProxy: ZeroAddress,
        priceDiscovery: priceDiscovery.address, // dummy address
      },
      // Protocol limits
      {
        maxExchangesPerBatch: 50,
        maxOffersPerGroup: 100,
        maxTwinsPerBundle: 100,
        maxOffersPerBundle: 100,
        maxOffersPerBatch: 100,
        maxTokensPerWithdrawal: 100,
        maxFeesPerDisputeResolver: 100,
        maxEscalationResponsePeriod: oneMonth,
        maxDisputesPerBatch: 100,
        maxAllowedSellers: 100,
        maxTotalOfferFeePercentage: 4000, //40%
        maxRoyaltyPercentage: 1000, //10%
        minResolutionPeriod: oneWeek,
        maxResolutionPeriod: oneMonth,
        minDisputePeriod: oneWeek,
        maxPremintedVouchers: 10000,
      },
      // Protocol fees
      protocolFeePercentage,
      protocolFeeFlatBoson,
      buyerEscalationDepositPercentage,
    ];

    const facetNames = [
      "AccountHandlerFacet",
      "SellerHandlerFacet",
      "DisputeResolverHandlerFacet",
      "ExchangeHandlerFacet",
      "OfferHandlerFacet",
      "GroupHandlerFacet",
      "ProtocolInitializationHandlerFacet",
      "ConfigHandlerFacet",
    ];

    const facetsToDeploy = await getFacetsWithArgs(facetNames, protocolConfig);

    // Cut the protocol handler facets into the Diamond
    await deployAndCutFacets(await protocolDiamond.getAddress(), facetsToDeploy, maxPriorityFeePerGas);

    // Cast Diamond to IBosonAccountHandler. Use this interface to call all individual account handlers
    accountHandler = await getContractAt("IBosonAccountHandler", await protocolDiamond.getAddress());

    // Cast Diamond to IBosonOfferHandler
    offerHandler = await getContractAt("IBosonOfferHandler", await protocolDiamond.getAddress());

    // Cast Diamond to IGroupHandler
    groupHandler = await getContractAt("IBosonGroupHandler", await protocolDiamond.getAddress());

    // Cast Diamond to IBosonExchangeHandler
    exchangeHandler = await getContractAt("IBosonExchangeHandler", await protocolDiamond.getAddress());

    bosonErrors = await getContractAt("BosonErrors", await protocolDiamond.getAddress());

    accountId.next(true);

    // Deploy the SnapshotGate example
    sellerId = "1";
    [snapshotGate] = await deploySnapshotGateExample(
      ["SnapshotGateToken", "SGT", await protocolDiamond.getAddress(), sellerId],
      maxPriorityFeePerGas
    );

    // Deploy the mock tokens
    [foreign20] = await deployMockTokens(["Foreign20"]);

    // Initial ids for all the things
    offerId = "1";
    groupId = "1";
    agentId = "0"; // agent id is optional while creating an offer
    offerFeeLimit = MaxUint256; // unlimited to not affect the test

    // Create a valid seller
    seller = mockSeller(
      await assistant.getAddress(),
      await admin.getAddress(),
      clerk.address,
      await treasury.getAddress()
    );
    expect(seller.isValid()).is.true;

    // Create a second seller
    seller2 = mockSeller(
      await assistant2.getAddress(),
      await assistant2.getAddress(),
      ZeroAddress,
      await assistant2.getAddress()
    );
    expect(seller2.isValid()).is.true;

    // AuthToken
    emptyAuthToken = mockAuthToken();
    expect(emptyAuthToken.isValid()).is.true;

    // VoucherInitValues
    voucherInitValues = mockVoucherInitValues();
    expect(voucherInitValues.isValid()).is.true;

    // Create the seller
    await accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues);

    // Create the second seller
    await accountHandler.connect(assistant2).createSeller(seller2, emptyAuthToken, voucherInitValues);

    // Create a valid dispute resolver
    disputeResolver = mockDisputeResolver(
      await assistantDR.getAddress(),
      await adminDR.getAddress(),
      clerkDR.address,
      await treasuryDR.getAddress(),
      true
    );

    expect(disputeResolver.isValid()).is.true;

    // Create DisputeResolverFee array so offer creation will succeed
    disputeResolverFees = [
      new DisputeResolverFee(ZeroAddress, "Native", "0"),
      new DisputeResolverFee(await foreign20.getAddress(), "Foriegn20", "0"),
    ];

    // Make empty seller list, so every seller is allowed
    const sellerAllowList = [];

    // Register the dispute resolver
    await accountHandler.connect(adminDR).createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);

    // Manufacture snapshot for upload
    snapshot = []; // { owner : string; tokenId: string; amount: string }[]
    snapshotTokenSupplies = {}; // map token ids to supplies
    snapshotTokenCount = 5; // create 5 snapshot token ids
    holders = [
      // holder accounts
      holder1,
      holder2,
      holder3,
      holder4,
      holder5,
    ];

    holderByAddress = {
      [await holder1.getAddress()]: holder1,
      [await holder2.getAddress()]: holder2,
      [await holder3.getAddress()]: holder3,
      [await holder4.getAddress()]: holder4,
      [await holder5.getAddress()]: holder5,
    };

    // Each holder will have a random amount of each token
    for (let holder of holders) {
      // Mint a bunch of exchange tokens for the holder and approve the gate to transfer them
      const amountToMint = "15000000000000000000";
      await foreign20.connect(holder).mint(await holder.getAddress(), amountToMint);
      await foreign20.connect(holder).approve(await snapshotGate.getAddress(), amountToMint);

      // Create snapshot entry for holder / token
      for (let i = 1; i <= snapshotTokenCount; i++) {
        // The token id
        const tokenId = i.toString();

        // Get a random balance 1 - 9
        const balance = Math.floor(Math.random() * 10) + 1;

        // Track the total supply of each token - corresponding offer's qty available must match
        snapshotTokenSupplies[tokenId] = String(Number(snapshotTokenSupplies[tokenId] || 0) + balance);

        // Add snapshot entry
        snapshot.push({
          owner: await holder.getAddress(),
          tokenId: i.toString(),
          amount: balance.toString(),
        });
      }
    }

    // Create gated offers in a loop

    offers = [];
    groups = [];

    // Make 2 passes, creating native token offers and then ERC20 offers
    for (let j = 0; j < 2; j++) {
      for (let i = 1; i <= snapshotTokenCount; i++) {
        // The token id
        const tokenId = i.toString(); // first and second batches use same token ids
        offerId = Number(snapshotTokenCount * j + i).toString(); // offer id from first or second batch
        groupId = offerId;

        // The supply of this token
        const tokenSupply = snapshotTokenSupplies[tokenId];

        // Create the offer
        const mo = await mockOffer();
        ({ offerDates, offerDurations } = mo);
        offer = mo.offer;
        price = offer.price;

        // Set price in ERC-20 token if on second pass
        if (j > 0) {
          offer.exchangeToken = await foreign20.getAddress();
          offer.buyerCancelPenalty = "0";
        }

        offer.sellerDeposit = "0";
        offer.quantityAvailable = tokenSupply;
        disputeResolverId = disputeResolver.id;

        // Check if entities are valid
        expect(offer.isValid()).is.true;
        expect(offerDates.isValid()).is.true;
        expect(offerDurations.isValid()).is.true;

        // Create the offer
        await offerHandler
          .connect(assistant)
          .createOffer(offer, offerDates, offerDurations, { disputeResolverId: disputeResolverId, mutualizerAddress: ZeroAddress }, agentId, offerFeeLimit);
        offers.push(offer);

        // Required constructor params for Group
        offerIds = [offerId];

        // Create Condition
        condition = mockCondition({
          tokenAddress: await snapshotGate.getAddress(),
          threshold: "0",
          maxCommits: tokenSupply,
          tokenType: TokenType.NonFungibleToken,
          minTokenId: tokenId,
          method: EvaluationMethod.SpecificToken,
          maxTokenId: tokenId,
        });

        expect(condition.isValid()).to.be.true;

        // Create Group
        group = new Group(groupId, seller.id, offerIds);
        expect(group.isValid()).is.true;
        await groupHandler.connect(assistant).createGroup(group, condition);
        groups.push(group);
      }
    }
    // End of gated offers creation

    // Create second seller offer
    const mo = await mockOffer();
    ({ offerDates, offerDurations } = mo);
    offer = mo.offer;
    offer.sellerId = "2"; // second seller
    offer.price = price;
    offer.sellerDeposit = "0";
    offer.quantityAvailable = "5";
    offer.buyerCancelPenalty = "0";

    // Check if entities are valid
    expect(offer.isValid()).is.true;
    expect(offerDates.isValid()).is.true;
    expect(offerDurations.isValid()).is.true;

    // Create the offer
    let tx = await offerHandler
      .connect(assistant2)
      .createOffer(offer, offerDates, offerDurations, { disputeResolverId: disputeResolverId, mutualizerAddress: ZeroAddress }, agentId, offerFeeLimit);
    offers.push(offer);

    const txReceipt = await tx.wait();
    const event = getEvent(txReceipt, offerHandler, "OfferCreated");
    otherSellerOfferId = event.offerId;
  });

  afterEach(async function () {
    // Reset the accountId iterator
    accountId.next(true);
  });

  // All supported SnapshotGate methods
  context("📋 SnapshotGate Methods", async function () {
    context("👉 appendToSnapshot()", async function () {
      it("should emit a SnapshotAppended event", async function () {
        // Batch of one
        const batch = snapshot.slice(0, 1);

        // Append to snapshot
        const tx = await snapshotGate.connect(deployer).appendToSnapshot(batch);
        const txReceipt = await tx.wait();
        const event = getEvent(txReceipt, snapshotGate, "SnapshotAppended");

        // Check executedBy
        expect(event.executedBy.toString()).to.equal((await deployer.getAddress()).toString());

        // Verify batch contents emitted match what was sent
        for (let i = 0; i < batch.length; i++) {
          let holder = event.holders[i];
          expect(holder.owner.toString()).to.equal(batch[i].owner);
          expect(holder.tokenId.toString()).to.equal(batch[i].tokenId);
          expect(holder.amount.toString()).to.equal(batch[i].amount);
        }
      });

      it("should allow multiple invocations", async function () {
        // Split snapshot into two batches
        const batchSize = Math.floor(snapshot.length / 2);
        const batch1 = snapshot.slice(0, batchSize);
        const batch2 = snapshot.slice(batchSize + 1);

        // Append first batch
        let tx = await snapshotGate.connect(deployer).appendToSnapshot(batch1);
        let txReceipt = await tx.wait();
        let event = getEvent(txReceipt, snapshotGate, "SnapshotAppended");

        // Check executedBy
        expect(event.executedBy.toString()).to.equal((await deployer.getAddress()).toString());

        // Verify batch contents emitted match what was sent
        for (let i = 0; i < batch1.length; i++) {
          let holder = event.holders[i];
          expect(holder.owner.toString()).to.equal(batch1[i].owner);
          expect(holder.tokenId.toString()).to.equal(batch1[i].tokenId);
          expect(holder.amount.toString()).to.equal(batch1[i].amount);
        }

        // Append second batch
        tx = await snapshotGate.connect(deployer).appendToSnapshot(batch2);
        txReceipt = await tx.wait();
        event = getEvent(txReceipt, snapshotGate, "SnapshotAppended");

        // Check executedBy
        expect(event.executedBy.toString()).to.equal((await deployer.getAddress()).toString());

        // Verify batch contents emitted match what was sent
        for (let i = 0; i < batch2.length; i++) {
          let holder = event.holders[i];
          expect(holder.owner.toString()).to.equal(batch2[i].owner);
          expect(holder.tokenId.toString()).to.equal(batch2[i].tokenId);
          expect(holder.amount.toString()).to.equal(batch2[i].amount);
        }
      });

      it("should create custodial tokens for each token in the snapshot", async function () {
        // Append to snapshot
        await snapshotGate.connect(deployer).appendToSnapshot(snapshot);

        // Verify tokens were created
        // Expect the owner of all the tokens to be the gate contract itself
        for (let i = 1; i <= snapshotTokenCount; i++) {
          const tokenId = i.toString();
          const owner = await snapshotGate.ownerOf(tokenId);
          expect(owner).to.equal(await snapshotGate.getAddress());
        }
      });

      it("should store snapshot correctly", async function () {
        // Append to snapshot
        await snapshotGate.connect(deployer).appendToSnapshot(snapshot);

        // Verify tokens were created
        // Expect the owner of all the tokens to be the gate contract itself
        for (let i = 1; i <= snapshotTokenCount; i++) {
          const tokenId = i.toString();
          const owner = await snapshotGate.ownerOf(tokenId);
          expect(owner).to.equal(await snapshotGate.getAddress());
        }
      });

      context("💔 Revert Reasons", async function () {
        it("snapshot is frozen", async function () {
          // Batch of one
          const batch = snapshot.slice(0, 1);

          // Freeze the snapsho
          await snapshotGate.connect(deployer).freezeSnapshot();

          // Attempt to append, expecting revert
          await expect(snapshotGate.connect(deployer).appendToSnapshot(batch)).to.revertedWith(
            "Cannot append to frozen snapshot"
          );
        });

        it("caller is not contract owner", async function () {
          // Batch of one
          const batch = snapshot.slice(0, 1);

          // Freeze the snapshot
          await snapshotGate.connect(deployer).freezeSnapshot();

          // Attempt to append from non-owner wallet, expecting revert
          await expect(snapshotGate.connect(holder1).appendToSnapshot(batch)).to.revertedWith(
            "Ownable: caller is not the owner"
          );
        });
      });
    });

    context("👉 freezeSnapshot()", async function () {
      it("should emit a SnapshotFrozen event", async function () {
        await expect(snapshotGate.connect(deployer).freezeSnapshot())
          .to.emit(snapshotGate, "SnapshotFrozen")
          .withArgs(await deployer.getAddress());
      });

      it("should store true value for snapshotFrozen", async function () {
        // Freeze the snapshot
        await snapshotGate.connect(deployer).freezeSnapshot();

        // Check the flag
        let isFrozen = await snapshotGate.snapshotFrozen();
        expect(isFrozen).to.be.true;
      });

      context("💔 Revert Reasons", async function () {
        it("snapshot already frozen", async function () {
          // Freeze the snapshot
          await snapshotGate.connect(deployer).freezeSnapshot();

          // Attempt to append, expecting revert
          await expect(snapshotGate.connect(deployer).freezeSnapshot()).to.revertedWith("Snapshot already frozen");
        });

        it("caller is not contract owner", async function () {
          // Attempt to append from non-owner wallet, expecting revert
          await expect(snapshotGate.connect(holder1).freezeSnapshot()).to.revertedWith(
            "Ownable: caller is not the owner"
          );
        });
      });
    });

    context("👉 commitToGatedOffer()", async function () {
      it("should emit a SnapshotTokenCommitted event when price is in native token", async function () {
        // Upload the snapshot
        await snapshotGate.connect(deployer).appendToSnapshot(snapshot);

        // Freeze the snapshot
        await snapshotGate.connect(deployer).freezeSnapshot();

        // Grab an entry from the snapshot
        let entry = snapshot[Math.floor(snapshot.length / 4)];

        // Offer, token, and group ids are aligned for the sake of sanity
        offerId = entry.tokenId;

        // Get the account to make the call with
        let holder = holderByAddress[entry.owner];

        // Commit to the offer
        await expect(
          snapshotGate.connect(holder).commitToGatedOffer(entry.owner, offerId, entry.tokenId, { value: price })
        )
          .to.emit(snapshotGate, "SnapshotTokenCommitted")
          .withArgs(entry.owner, offerId, entry.tokenId, await holder.getAddress());
      });

      it("should emit a SnapshotTokenCommitted event when price is in ERC20 token", async function () {
        // Upload the snapshot
        await snapshotGate.connect(deployer).appendToSnapshot(snapshot);

        // Freeze the snapshot
        await snapshotGate.connect(deployer).freezeSnapshot();

        // Grab an entry from the snapshot
        let entry = snapshot[Math.floor(snapshot.length / 4)];

        // ERC20 offers are in second batch
        offerId = String(Number(entry.tokenId) + snapshotTokenCount);

        // Get the account to make the call with
        let holder = holderByAddress[entry.owner];

        // Commit to the offer
        await expect(snapshotGate.connect(holder).commitToGatedOffer(entry.owner, offerId, entry.tokenId))
          .to.emit(snapshotGate, "SnapshotTokenCommitted")
          .withArgs(entry.owner, offerId, entry.tokenId, await holder.getAddress());
      });

      context("💔 Revert Reasons", async function () {
        it("offerId is invalid", async function () {
          // Upload the snapshot
          await snapshotGate.connect(deployer).appendToSnapshot(snapshot);

          // Freeze the snapshot
          await snapshotGate.connect(deployer).freezeSnapshot();

          // Grab an entry from the snapshot
          let entry = snapshot[Math.floor(snapshot.length / 4)];

          // Invalid offer id
          offerId = "999";

          // Get the account to make the call with
          let caller = holderByAddress[entry.owner];

          // Commit to the offer
          await expect(
            snapshotGate
              .connect(caller)
              .commitToGatedOffer(await caller.getAddress(), offerId, entry.tokenId, { value: price })
          ).to.revertedWith("Invalid offer id");
        });

        it("snapshot is not frozen", async function () {
          // Upload the snapshot but don't freeze
          await snapshotGate.connect(deployer).appendToSnapshot(snapshot);

          // Grab an entry from the snapshot
          let entry = snapshot[Math.floor(snapshot.length / 4)];

          // Offer, token, and group ids are aligned for the sake of sanity
          offerId = entry.tokenId;

          // Get the account to make the call with
          let caller = holderByAddress[entry.owner];

          // Commit to the offer
          await expect(
            snapshotGate
              .connect(caller)
              .commitToGatedOffer(await caller.getAddress(), offerId, entry.tokenId, { value: price })
          ).to.revertedWith("Snapshot is not frozen");
        });

        it("buyer doesn't have a balance of the given token in the snapshot", async function () {
          // Upload the snapshot
          await snapshotGate.connect(deployer).appendToSnapshot(snapshot);

          // Freeze the snapshot
          await snapshotGate.connect(deployer).freezeSnapshot();

          // Grab an entry from the snapshot
          let entry = snapshot[Math.floor(snapshot.length / 4)];

          // Offer, token, and group ids are aligned for the sake of sanity
          offerId = entry.tokenId;

          // Get an account to make the call with that does not have a balance in the snapshot
          let caller = deployer;

          // Commit to the offer
          await expect(
            snapshotGate
              .connect(caller)
              .commitToGatedOffer(await caller.getAddress(), offerId, entry.tokenId, { value: price })
          ).to.revertedWith("Buyer held no balance of the given token id at time of snapshot");
        });

        it("buyer has exhausted allowable commits for a given token they hold in the snapshot", async function () {
          // Upload the snapshot
          await snapshotGate.connect(deployer).appendToSnapshot(snapshot);

          // Freeze the snapshot
          await snapshotGate.connect(deployer).freezeSnapshot();

          // Grab an entry from the snapshot
          let entry = snapshot[Math.floor(snapshot.length / 4)];

          // Offer, token, and group ids are aligned for the sake of sanity,
          offerId = entry.tokenId;

          // Get the account to make the call with
          let holder = holderByAddress[entry.owner];

          // Exhaust all commits for this buyer for this token
          for (let i = 0; i < entry.amount; i++) {
            await snapshotGate
              .connect(holder)
              .commitToGatedOffer(entry.owner, offerId, entry.tokenId, { value: price });
          }

          // Commit to the offer
          await expect(
            snapshotGate.connect(holder).commitToGatedOffer(entry.owner, offerId, entry.tokenId, { value: price })
          ).to.revertedWith("Buyer's balance of the snapshot token id has been used");
        });

        it("condition specifies a different tokenId from the one given", async function () {
          // Upload the snapshot
          await snapshotGate.connect(deployer).appendToSnapshot(snapshot);

          // Freeze the snapshot
          await snapshotGate.connect(deployer).freezeSnapshot();

          // Grab first entry from the snapshot
          let entry = snapshot[0];

          // Grab second entry from the snapshot
          let entry2 = snapshot[1];

          // wrong offer id
          offerId = entry2.tokenId;

          // Get the account to make the call with
          let holder = holderByAddress[entry.owner];

          // Commit to the offer
          await expect(
            snapshotGate.connect(holder).commitToGatedOffer(entry.owner, offerId, entry.tokenId, { value: price })
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.TOKEN_ID_NOT_IN_CONDITION_RANGE);
        });

        it("offer is from another seller", async function () {
          // Upload the snapshot but don't freeze
          await snapshotGate.connect(deployer).appendToSnapshot(snapshot);

          // Freeze the snapshot
          await snapshotGate.connect(deployer).freezeSnapshot();

          // Grab an entry from the snapshot
          let entry = snapshot[Math.floor(snapshot.length / 4)];

          // Offer, token, and group ids are aligned for the sake of sanity
          offerId = entry.tokenId;

          // Get the account to make the call with
          let caller = holderByAddress[entry.owner];

          // Commit to the offer
          await expect(
            snapshotGate
              .connect(caller)
              .commitToGatedOffer(await caller.getAddress(), otherSellerOfferId, entry.tokenId, { value: price })
          ).to.revertedWith("Offer is from another seller");
        });

        it("incorrect payment is sent when price is in native token", async function () {
          // Upload the snapshot
          await snapshotGate.connect(deployer).appendToSnapshot(snapshot);

          // Freeze the snapshot
          await snapshotGate.connect(deployer).freezeSnapshot();

          // Grab an entry from the snapshot
          let entry = snapshot[Math.floor(snapshot.length / 4)];

          // Offer, token, and group ids are aligned for the sake of sanity
          offerId = entry.tokenId;

          // Get the account to make the call with
          let holder = holderByAddress[entry.owner];

          // Wrong price
          const halfPrice = (BigInt(price) / BigInt(2)).toString();

          // Commit to the offer
          await expect(
            snapshotGate.connect(holder).commitToGatedOffer(entry.owner, offerId, entry.tokenId, { value: halfPrice })
          ).to.revertedWith("Incorrect payment amount");
        });

        it("insufficient approval for payment transfer when price is in ERC20 token", async function () {
          // Upload the snapshot
          await snapshotGate.connect(deployer).appendToSnapshot(snapshot);

          // Freeze the snapshot
          await snapshotGate.connect(deployer).freezeSnapshot();

          // Grab an entry from the snapshot
          let entry = snapshot[Math.floor(snapshot.length / 4)];

          // ERC20 offers are in second batch
          offerId = String(Number(entry.tokenId) + snapshotTokenCount);

          // Get the account to make the call with
          let holder = holderByAddress[entry.owner];

          // Zero out the gate's approval to transfer the holder's payment ERC20 tokens
          await foreign20.connect(holder).approve(await snapshotGate.getAddress(), "0");

          // Commit to the offer
          await expect(
            snapshotGate.connect(holder).commitToGatedOffer(entry.owner, offerId, entry.tokenId)
          ).to.revertedWith("Insufficient approval for payment transfer");
        });
      });
    });

    context("👉 checkSnapshot()", async function () {
      it("should return expected values after initial upload", async function () {
        // Upload the snapshot
        await snapshotGate.connect(deployer).appendToSnapshot(snapshot);

        // Check every entry in the snapshot
        for (let entry of snapshot) {
          const response = await snapshotGate.connect(deployer).checkSnapshot(entry.tokenId, entry.owner);

          // Expect owned value to match snapshot value for holder
          expect(response.owned.toString()).to.equal(entry.amount);

          // Expect used value to be zero
          expect(response.used.toString()).to.equal("0");
        }
      });

      it("should return expected values after a commit when price is in native token", async function () {
        // Upload the snapshot
        await snapshotGate.connect(deployer).appendToSnapshot(snapshot);

        // Freeze the snapshot
        await snapshotGate.connect(deployer).freezeSnapshot();

        // Grab an entry from the snapshot
        let entry = snapshot[Math.floor(snapshot.length / 3)];

        // Get the account to make the call with
        let holder = holderByAddress[entry.owner];

        // Commit to the gated offer
        offerId = entry.tokenId; // Offer, token, and group ids are aligned for the sake of sanity,
        await snapshotGate.connect(holder).commitToGatedOffer(entry.owner, offerId, entry.tokenId, { value: price });

        // Check that the committed snapshot token is now marked used
        const response = await snapshotGate.connect(rando).checkSnapshot(entry.tokenId, entry.owner);

        // Expect owned value to match snapshot value for holder
        expect(response.owned.toString()).to.equal(entry.amount);

        // Expect used value to be one
        expect(response.used.toString()).to.equal("1");
      });

      it("should return expected values after a commit when price is in ERC20 token", async function () {
        // Upload the snapshot
        await snapshotGate.connect(deployer).appendToSnapshot(snapshot);

        // Freeze the snapshot
        await snapshotGate.connect(deployer).freezeSnapshot();

        // Grab an entry from the snapshot
        let entry = snapshot[Math.floor(snapshot.length / 3)];

        // ERC20 offers are in second batch
        offerId = String(Number(entry.tokenId) + snapshotTokenCount);

        // Get the account to make the call with
        let holder = holderByAddress[entry.owner];

        // Commit to the gated offer
        await snapshotGate.connect(holder).commitToGatedOffer(entry.owner, offerId, entry.tokenId);

        // Check that the committed snapshot token is now marked used
        const response = await snapshotGate.connect(rando).checkSnapshot(entry.tokenId, entry.owner);

        // Expect owned value to match snapshot value for holder
        expect(response.owned.toString()).to.equal(entry.amount);

        // Expect used value to be one
        expect(response.used.toString()).to.equal("1");
      });
    });

    context("👉 ownerOf()", async function () {
      it("should report gate as owner of all tokens when tx not in-flight", async function () {
        // Upload the snapshot, creating all tokens in the process
        await snapshotGate.connect(deployer).appendToSnapshot(snapshot);

        // Expect the owner of all the tokens to be the gate contract itself
        for (let i = 1; i <= snapshotTokenCount; i++) {
          const tokenId = i.toString();
          const owner = await snapshotGate.connect(rando).ownerOf(tokenId);
          expect(owner).to.equal(await snapshotGate.getAddress());
        }
      });

      context("💔 Revert Reasons", async function () {
        it("tokenId is invalid", async function () {
          // Upload the snapshot
          await snapshotGate.connect(deployer).appendToSnapshot(snapshot);

          // Invalid token id (not in snapshot)
          const tokenId = "999";

          // Check
          await expect(snapshotGate.ownerOf(tokenId)).to.revertedWith("ERC721: invalid token ID");
        });
      });
    });
  });

  // Relevant Boson Protocol methods
  context("📋 Protocol Methods", async function () {
    context("👉 commitToConditionalOffer()", async function () {
      context("💔 Revert Reasons", async function () {
        it("buyer is in snapshot but attempts to commit directly on protocol", async function () {
          // Upload the snapshot
          await snapshotGate.connect(deployer).appendToSnapshot(snapshot);

          // Freeze the snapshot
          await snapshotGate.connect(deployer).freezeSnapshot();

          // Grab an entry from the snapshot
          let entry = snapshot[Math.floor(snapshot.length / 4)];

          // Offer, token, and group ids are aligned for the sake of sanity
          offerId = entry.tokenId;

          // Get the account to make the call with
          let holder = holderByAddress[entry.owner];

          // Check that holder cannot commit directly to the offer on the protocol itself
          await expect(
            exchangeHandler.connect(holder).commitToConditionalOffer(await holder.getAddress(), offerId, entry.tokenId)
          ).to.revertedWithCustomError(bosonErrors, RevertReasons.CANNOT_COMMIT);
        });
      });
    });
  });
});
