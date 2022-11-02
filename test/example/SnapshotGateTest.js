const hre = require("hardhat");
const ethers = hre.ethers;
const { expect } = require("chai");

const Role = require("../../scripts/domain/Role");
const TokenType = require("../../scripts/domain/TokenType");
const Group = require("../../scripts/domain/Group");
const EvaluationMethod = require("../../scripts/domain/EvaluationMethod");
const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const { deployProtocolHandlerFacets } = require("../../scripts/util/deploy-protocol-handler-facets.js");
const { deployProtocolConfigFacet } = require("../../scripts/util/deploy-protocol-config-facet.js");
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

/**
 *  Test the SnapshotGate example contract
 */
describe("SnapshotGate", function () {
  // Common vars
  let deployer,
    pauser,
    operator,
    admin,
    clerk,
    treasury,
    rando,
    operatorDR,
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
  let protocolDiamond, accessController, accountHandler, offerHandler, groupHandler;
  let offerId, seller, disputeResolverId;
  let price, foreign20;
  let protocolFeePercentage, protocolFeeFlatBoson, buyerEscalationDepositPercentage;
  let disputeResolver, disputeResolverFees;
  let snapshotGate;
  let groupId, offerIds, condition, group, groups;
  let voucherInitValues;
  let emptyAuthToken;
  let agentId;
  let offer, offers;
  let offerDates, offerDurations;
  let snapshot, snapshotTokenSupplies, snapshotTokenCount, holders, holderByAddress;

  beforeEach(async function () {
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
      bosonToken,
      holder1,
      holder2,
      holder3,
      holder4,
      holder5,
    ] = await ethers.getSigners();

    // make all account the same
    operator = clerk = admin;
    operatorDR = clerkDR = adminDR;

    // Deploy the Protocol Diamond
    [protocolDiamond, , , , accessController] = await deployProtocolDiamond(maxPriorityFeePerGas);

    // Temporarily grant UPGRADER role to deployer account
    await accessController.grantRole(Role.UPGRADER, deployer.address);

    // Grant PROTOCOL role to ProtocolDiamond address and renounces admin
    await accessController.grantRole(Role.PROTOCOL, protocolDiamond.address);

    // Temporarily grant PAUSER role to pauser account
    await accessController.grantRole(Role.PAUSER, pauser.address);

    // Cut the protocol handler facets into the Diamond
    await deployProtocolHandlerFacets(
      protocolDiamond,
      [
        "AccountHandlerFacet",
        "AgentHandlerFacet",
        "SellerHandlerFacet",
        "BuyerHandlerFacet",
        "DisputeResolverHandlerFacet",
        "ExchangeHandlerFacet",
        "OfferHandlerFacet",
        "FundsHandlerFacet",
        "DisputeHandlerFacet",
        "TwinHandlerFacet",
        "BundleHandlerFacet",
        "GroupHandlerFacet",
        "PauseHandlerFacet",
      ],
      maxPriorityFeePerGas
    );

    // Deploy the Protocol client implementation/proxy pairs (currently just the Boson Voucher)
    const protocolClientArgs = [protocolDiamond.address];
    const [, beacons, proxies] = await deployProtocolClients(protocolClientArgs, maxPriorityFeePerGas);
    const [beacon] = beacons;
    const [proxy] = proxies;

    // Set protocolFees
    protocolFeePercentage = "200"; // 2 %
    protocolFeeFlatBoson = ethers.utils.parseUnits("0.01", "ether").toString();
    buyerEscalationDepositPercentage = "1000"; // 10%

    // Add config Handler, so ids start at 1, and so voucher address can be found
    const protocolConfig = [
      // Protocol addresses
      {
        treasury: protocolTreasury.address,
        token: bosonToken.address,
        voucherBeacon: beacon.address,
        beaconProxy: proxy.address,
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
        maxRoyaltyPecentage: 1000, //10%
        maxResolutionPeriod: oneMonth,
        minDisputePeriod: oneWeek,
      },
      // Protocol fees
      {
        percentage: protocolFeePercentage,
        flatBoson: protocolFeeFlatBoson,
        buyerEscalationDepositPercentage,
      },
    ];

    // Deploy the Config facet, initializing the protocol config
    await deployProtocolConfigFacet(protocolDiamond, protocolConfig, maxPriorityFeePerGas);

    // Cast Diamond to IBosonAccountHandler. Use this interface to call all individual account handlers
    accountHandler = await ethers.getContractAt("IBosonAccountHandler", protocolDiamond.address);

    // Cast Diamond to IBosonOfferHandler
    offerHandler = await ethers.getContractAt("IBosonOfferHandler", protocolDiamond.address);

    // Cast Diamond to IGroupHandler
    groupHandler = await ethers.getContractAt("IBosonGroupHandler", protocolDiamond.address);

    // Deploy the SnapshotGate example
    [snapshotGate] = await deploySnapshotGateExample(["SnapshotGateToken", "SGT", protocolDiamond.address]);

    // Deploy the mock tokens
    [foreign20] = await deployMockTokens(["Foreign20"]);

  });

  // All supported Exchange methods
  context("📋 SnapshotGate Methods", async function () {
    beforeEach(async function () {
      // Initial ids for all the things
      offerId = "1";
      groupId = "1";
      agentId = "0"; // agent id is optional while creating an offer

      // Create a valid seller
      seller = mockSeller(operator.address, admin.address, clerk.address, treasury.address);
      expect(seller.isValid()).is.true;

      // AuthToken
      emptyAuthToken = mockAuthToken();
      expect(emptyAuthToken.isValid()).is.true;

      // VoucherInitValues
      voucherInitValues = mockVoucherInitValues();
      expect(voucherInitValues.isValid()).is.true;

      // Create the seller
      await accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues);

      // Create a valid dispute resolver
      disputeResolver = mockDisputeResolver(
        operatorDR.address,
        adminDR.address,
        clerkDR.address,
        treasuryDR.address,
        false
      );
      expect(disputeResolver.isValid()).is.true;

      // Create DisputeResolverFee array so offer creation will succeed
      disputeResolverFees = [
        new DisputeResolverFee(ethers.constants.AddressZero, "Native", "0"),
        new DisputeResolverFee(foreign20.address, "Foriegn20", "0"),
      ];

      // Make empty seller list, so every seller is allowed
      const sellerAllowList = [];

      // Register and activate the dispute resolver
      await accountHandler
        .connect(adminDR)
        .createDisputeResolver(disputeResolver, disputeResolverFees, sellerAllowList);
      await accountHandler.connect(deployer).activateDisputeResolver(disputeResolver.id);

      // Manufacture snapshot for upload
      snapshot = []; // { holder : string; tokenId: string; amount: string }[]
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
        [holder1.address]: holder1,
        [holder2.address]: holder2,
        [holder3.address]: holder3,
        [holder4.address]: holder4,
        [holder5.address]: holder5,
      };

      // Each holder will have a random amount of each token
      for (let holder of holders) {

        // Mint a bunch of exchange tokens for the holder and approve the gate to transfer them
        const amountToMint = "15000000000000000000";
        await foreign20.connect(holder).mint(holder.address, amountToMint);
        await foreign20.connect(holder).approve(snapshotGate.address, amountToMint);

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
            owner: holder.address,
            tokenId: i.toString(),
            amount: balance.toString(),
          });
        }
      }

      // Create gated offers in a loop

      offers = [];
      groups = [];

      // Make 2 passes, creating native token offers and then ERC20 offers
      for (let j = 0; j< 2; j++) {
        for (let i = 1; i <= snapshotTokenCount; i++) {
          // The token id
          const tokenId = i.toString(); // first and second batches use same token ids
          offerId = Number((snapshotTokenCount * j)+i).toString(); // offer id from first or second batch
          groupId = offerId;

          // The supply of this token
          const tokenSupply = snapshotTokenSupplies[tokenId];

          // Create the offer
          const mo = await mockOffer();
          ({ offerDates, offerDurations } = mo);
          offer = mo.offer;
          price = offer.price;

          // Set price in ERC-20 token if on second pass
          if (j>0){
            offer.exchangeToken = foreign20.address;
            offer.buyerCancelPenalty = "0";
          }

          offer.sellerDeposit = "0";
          offer.quantityAvailable = tokenSupply;
          disputeResolverId = mo.disputeResolverId;

          // Check if entities are valid
          expect(offer.isValid()).is.true;
          expect(offerDates.isValid()).is.true;
          expect(offerDurations.isValid()).is.true;

          // Create the offer
          await offerHandler.connect(operator).createOffer(offer, offerDates, offerDurations, disputeResolverId, agentId);
          offers.push(offer);

          // Required constructor params for Group
          offerIds = [offerId];

          // Create Condition
          condition = mockCondition({
            tokenAddress: snapshotGate.address,
            threshold: "0",
            maxCommits: tokenSupply,
            tokenType: TokenType.NonFungibleToken,
            tokenId: tokenId,
            method: EvaluationMethod.SpecificToken,
          });
          expect(condition.isValid()).to.be.true;

          // Create Group
          group = new Group(groupId, seller.id, offerIds);
          expect(group.isValid()).is.true;
          await groupHandler.connect(operator).createGroup(group, condition);
          groups.push(group);
        }
      }
      // End of gated offers creation
    });

    afterEach(async function () {
      // Reset the accountId iterator
      accountId.next(true);
    });

    context("👉 appendToSnapshot()", async function () {
      it("should emit a SnapshotAppended event", async function () {
        // Batch of one
        const batch = snapshot.slice(0, 1);

        await expect(snapshotGate.connect(deployer).appendToSnapshot(batch)).to.emit(snapshotGate, "SnapshotAppended");
      });

      it("should allow multiple invocations", async function () {
        // Split snapshot into two batches
        const batchSize = Math.floor(snapshot.length / 2);
        const batch1 = snapshot.slice(0, batchSize);
        const batch2 = snapshot.slice(batchSize + 1);

        await expect(snapshotGate.connect(deployer).appendToSnapshot(batch1)).to.emit(snapshotGate, "SnapshotAppended");

        await expect(snapshotGate.connect(deployer).appendToSnapshot(batch2)).to.emit(snapshotGate, "SnapshotAppended");
      });

      context("💔 Revert Reasons", async function () {
        it("snapshot is frozen", async function () {
          // Batch of one
          const batch = snapshot.slice(0, 1);

          // Freeze the snapshot tho
          await snapshotGate.connect(deployer).freezeSnapshot();

          // Attempt to append, expecting revert
          await expect(snapshotGate.connect(deployer).appendToSnapshot(batch)).to.revertedWith(
            "Cannot append to frozen snapshot"
          );
        });

        it("caller is not contract owner", async function () {
          // Batch of one
          const batch = snapshot.slice(0, 1);

          // Freeze the snapshot tho
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
        await expect(snapshotGate.connect(deployer).freezeSnapshot()).to.emit(snapshotGate, "SnapshotFrozen");
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
          .withArgs(entry.owner, offerId, entry.tokenId);
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
        await expect(
          snapshotGate.connect(holder).commitToGatedOffer(entry.owner, offerId, entry.tokenId)
        ).to.emit(snapshotGate, "SnapshotTokenCommitted")
          .withArgs(entry.owner, offerId, entry.tokenId);
      });

      context("💔 Revert Reasons", async function () {
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
            snapshotGate.connect(caller).commitToGatedOffer(caller.address, offerId, entry.tokenId, { value: price })
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
            snapshotGate.connect(caller).commitToGatedOffer(caller.address, offerId, entry.tokenId, { value: price })
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
          )
            .to.revertedWith("Condition specifies a different tokenId from the one given");
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

      it("should return expected values after a commit when price is in native token", async function () {
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
          expect(owner).to.equal(snapshotGate.address);
        }
      });
    });
  });
});
