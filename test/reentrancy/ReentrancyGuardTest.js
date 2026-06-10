/**
 * Reentrancy guard matrix test.
 *
 * Verifies the global `nonReentrant` modifier on every state-modifying entry
 * point. For each "FROM" surface where the protocol hands control to an
 * untrusted contract (ETH receive, malicious ERC20 callback, ERC721/1155
 * receiver hooks, external price discovery contract, DR fee mutualizer
 * callback), we attempt to re-enter every "TO" function (every nonReentrant
 * external/public function across the diamond's facets).
 *
 * The malicious contract emits `ReentryAttempted(toSelector, blocked,
 * innerSelector)`; for every (FROM, TO) pair we assert `blocked == true` and
 * `innerSelector == 0x8beb9d16` (= bytes4(keccak256("ReentrancyGuard()"))).
 *
 * This serves as a regression guard: any future change that drops
 * `nonReentrant` from a TO function will fail at least one case.
 */

const { ethers } = require("hardhat");
const {
  ZeroAddress,
  MaxUint256,
  getSigners,
  parseUnits,
  parseEther,
  getContractAt,
  getContractFactory,
  keccak256,
  toUtf8Bytes,
} = ethers;
const { expect } = require("chai");

const Role = require("../../scripts/domain/Role");
const TokenType = require("../../scripts/domain/TokenType");
const Bundle = require("../../scripts/domain/Bundle");
const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
const { RoyaltyInfo } = require("../../scripts/domain/RoyaltyInfo");
const PriceType = require("../../scripts/domain/PriceType");
const PriceDiscovery = require("../../scripts/domain/PriceDiscovery");
const Side = require("../../scripts/domain/Side");
const {
  setupTestEnvironment,
  getSnapshot,
  revertToSnapshot,
  calculateBosonProxyAddress,
  calculateCloneAddress,
  deriveTokenId,
} = require("../util/utils.js");
const {
  mockSeller,
  mockOffer,
  mockTwin,
  mockDisputeResolver,
  mockVoucherInitValues,
  mockAuthToken,
  accountId,
} = require("../util/mock");
const {
  buildReentrancyTargets,
  buildCombinedInterface,
  rebuildCalldataForAttacker,
} = require("../util/reentrancy-targets.js");

const REENTRANCY_GUARD_SELECTOR = keccak256(toUtf8Bytes("ReentrancyGuard()")).slice(0, 10);
const TO_TARGETS = buildReentrancyTargets();

describe("[REENTRANCY] Global nonReentrant guard matrix", function () {
  let deployer, admin, assistant, treasury, rando, adminDR, treasuryDR;
  let assistantDR;
  let accountHandler, fundsHandler, configHandler;
  let twinHandler, bundleHandler, offerHandler, exchangeCommitHandler;
  let priceDiscoveryHandler, sequentialCommitHandler;
  let protocolDiamondAddress;
  let accessController;
  let bosonErrors;
  let weth;
  let cleanSnapshot;

  before(async function () {
    accountId.next(true);

    // WETH dependency for several facets
    const wethFactory = await getContractFactory("WETH9");
    weth = await wethFactory.deploy();
    await weth.waitForDeployment();

    const contracts = {
      accountHandler: "IBosonAccountHandler",
      fundsHandler: "IBosonFundsHandler",
      configHandler: "IBosonConfigHandler",
      twinHandler: "IBosonTwinHandler",
      bundleHandler: "IBosonBundleHandler",
      offerHandler: "IBosonOfferHandler",
      exchangeCommitHandler: "IBosonExchangeCommitHandler",
      priceDiscoveryHandler: "IBosonPriceDiscoveryHandler",
      sequentialCommitHandler: "IBosonSequentialCommitHandler",
    };

    let signers;
    let extra;
    ({
      signers,
      contractInstances: {
        accountHandler,
        fundsHandler,
        configHandler,
        twinHandler,
        bundleHandler,
        offerHandler,
        exchangeCommitHandler,
        priceDiscoveryHandler,
        sequentialCommitHandler,
      },
      diamondAddress: protocolDiamondAddress,
      extraReturnValues: extra,
    } = await setupTestEnvironment(contracts, { wethAddress: await weth.getAddress() }));

    accessController = extra.accessController;

    // signers from setupTestEnvironment start at index 3 (deployer/treasury/bosonToken/pauser are reserved)
    [, admin, treasury, rando, , adminDR, treasuryDR] = signers;
    assistant = admin;
    assistantDR = adminDR;

    [deployer] = await getSigners();

    bosonErrors = await getContractAt("BosonErrors", protocolDiamondAddress);

    // Per-target sanity check — every entry's calldata must have encoded
    // cleanly. `buildReentrancyTargets()` itself throws at module load if it
    // discovers zero targets (that's where the matrix's "0 passing" silent
    // failure mode is closed), so we don't re-check `.length` here.
    expect(
      TO_TARGETS.find((t) => t.error),
      "every TO must produce calldata without error"
    ).to.be.undefined;
    expect(REENTRANCY_GUARD_SELECTOR).to.equal("0x8beb9d16");

    // Snapshot a clean diamond so each FROM block starts from the same
    // base — without this, the seller/role state from one FROM bleeds
    // into the next and triggers SellerAddressMustBeUnique errors.
    cleanSnapshot = await getSnapshot();
  });

  /**
   * Helper: parse the malicious contract's ReentryAttempted events from a
   * transaction receipt, returning the LAST one (multiple hook calls can fire
   * but the contract self-disarms so only the first arming records the
   * attempt).
   */
  async function lastReentryEvent(attacker, txReceipt) {
    const iface = attacker.interface;
    const topic = iface.getEvent("ReentryAttempted").topicHash;
    const matching = txReceipt.logs.filter(
      (l) => l.address.toLowerCase() === attacker.target.toLowerCase() && l.topics[0] === topic
    );
    expect(matching.length, "ReentryAttempted event must be emitted").to.be.greaterThan(0);
    return iface.parseLog(matching[matching.length - 1]).args;
  }

  /**
   * Deploy the named malicious contract and grant it ADMIN / PAUSER /
   * FEE_COLLECTOR. Every FROM block needs these three roles on the attacker
   * so that role-gated TO functions (ConfigHandler setters, pause/unpause,
   * `withdrawProtocolFees`, `setAllowlistedFunctions`) reach the
   * `nonReentrant` modifier rather than failing early on the role check —
   * role modifiers run before `nonReentrant` in modifier order.
   */
  async function deployMaliciousAndGrantRoles(contractName) {
    const Factory = await getContractFactory(contractName);
    const malicious = await Factory.deploy();
    await malicious.waitForDeployment();
    const maliciousAddr = await malicious.getAddress();
    await accessController.grantRole(Role.ADMIN, maliciousAddr);
    await accessController.grantRole(Role.PAUSER, maliciousAddr);
    await accessController.grantRole(Role.FEE_COLLECTOR, maliciousAddr);
    return { malicious, maliciousAddr };
  }

  /**
   * Create the "standard" seller used by every FROM block except A (which
   * needs the malicious contract itself as treasury for the ETH-receive
   * hook). Passing `treasuryAddr` lets FROM A reuse this helper too.
   */
  async function createStandardSeller(treasuryAddr) {
    const seller = mockSeller(
      await assistant.getAddress(),
      await admin.getAddress(),
      ZeroAddress,
      treasuryAddr ?? (await treasury.getAddress())
    );
    await accountHandler.connect(admin).createSeller(seller, mockAuthToken(), mockVoucherInitValues());
    return seller;
  }

  /**
   * Create the dispute resolver used by FROM blocks C, D, E, E', F. The
   * native DR-fee amount varies by block (0 in E/E' to keep funds math
   * trivial; non-zero in C/D/F so the protocol exercises the
   * mutualizer/seller-pool path).
   */
  async function createStandardDisputeResolver(nativeFee = "0") {
    const disputeResolver = mockDisputeResolver(
      await assistantDR.getAddress(),
      await adminDR.getAddress(),
      ZeroAddress,
      await treasuryDR.getAddress(),
      true
    );
    const fees = [new DisputeResolverFee(ZeroAddress, "Native", nativeFee)];
    await accountHandler.connect(adminDR).createDisputeResolver(disputeResolver, fees, []);
    return disputeResolver;
  }

  /**
   * Build and create an offer with the no-fee / native-token defaults shared
   * by FROM blocks C, D, E, E', F. Returns the created offer.
   *
   * Parameters:
   * - `price` — offer price (bigint or string)
   * - `priceType` — `PriceType.Static` (default) or `PriceType.Discovery`
   * - `quantityAvailable` — defaults to `"1"`
   * - `voucherRedeemableFrom` — set to `"1"` for blocks that commit+redeem
   *   in one tx and can't fast-forward (C, D)
   * - `disputeResolverId` — required
   * - `mutualizerAddress` — defaults to `ZeroAddress`; FROM F passes the
   *   malicious mutualizer's address here
   *
   * Also clears the protocol fee (`setProtocolFeePercentage(0)`) so no BOSON
   * token mocking is needed.
   */
  async function createOfferWithDefaults({
    price,
    priceType = PriceType.Static,
    quantityAvailable = "1",
    voucherRedeemableFrom,
    disputeResolverId,
    mutualizerAddress = ZeroAddress,
  }) {
    const mo = await mockOffer();
    const { offerDates, offerDurations, offerFees, drParams } = mo;
    const offer = mo.offer;
    offer.priceType = priceType;
    offer.price = price.toString();
    offer.sellerDeposit = "0";
    offer.buyerCancelPenalty = "0";
    offer.quantityAvailable = quantityAvailable;
    offer.exchangeToken = ZeroAddress;
    offer.royaltyInfo = [new RoyaltyInfo([ZeroAddress], ["0"])];
    if (voucherRedeemableFrom !== undefined) {
      offerDates.voucherRedeemableFrom = voucherRedeemableFrom;
    }
    offerFees.protocolFee = "0";
    drParams.disputeResolverId = disputeResolverId;
    drParams.mutualizerAddress = mutualizerAddress;

    await configHandler.connect(deployer).setProtocolFeePercentage("0");
    await offerHandler.connect(assistant).createOffer(offer, offerDates, offerDurations, drParams, 0, MaxUint256);
    return offer;
  }

  /**
   * Reserve the offer's range to the assistant and pre-mint every voucher
   * in `offer.quantityAvailable`. Required for price-discovery offers (E /
   * E'). Returns the Boson voucher clone for follow-up approvals.
   */
  async function reserveAndPreMint(offer) {
    await offerHandler.connect(assistant).reserveRange(offer.id, offer.quantityAvailable, await assistant.getAddress());
    const beaconProxyAddress = await calculateBosonProxyAddress(protocolDiamondAddress);
    const expectedCloneAddress = calculateCloneAddress(
      protocolDiamondAddress,
      beaconProxyAddress,
      await admin.getAddress()
    );
    const bosonVoucher = await getContractAt("BosonVoucher", expectedCloneAddress);
    await bosonVoucher.connect(assistant).preMint(offer.id, offer.quantityAvailable);
    return { bosonVoucher, expectedCloneAddress };
  }

  // ============================================================
  // FROM Category A: ETH receive() via .call{value:}("")
  // ------------------------------------------------------------
  // The seller's treasury is the malicious contract. After assistant calls
  // withdrawFunds, the protocol does `treasury.call{value:}("")` which lands
  // in malicious.receive() — and triggers the inner re-entry attempt.
  // ============================================================
  describe("A. ETH withdraw → seller treasury (receive() hook)", function () {
    let malicious;
    let sellerId;
    let snapshotA;
    const depositAmount = parseUnits("1", "ether");

    before(async function () {
      // Start from a clean diamond so prior FROM blocks don't leak roles
      // or seller registrations into this one.
      await revertToSnapshot(cleanSnapshot);
      cleanSnapshot = await getSnapshot();
      accountId.next(true);

      let maliciousAddr;
      ({ malicious, maliciousAddr } = await deployMaliciousAndGrantRoles("MaliciousReentrant"));

      // Create a seller whose treasury is the malicious contract — this
      // is what arms the ETH receive() callback when the assistant later
      // withdraws to the seller's treasury.
      const seller = await createStandardSeller(maliciousAddr);
      sellerId = seller.id;

      // Fund the seller with native currency
      await fundsHandler.connect(rando).depositFunds(sellerId, ZeroAddress, depositAmount, { value: depositAmount });

      snapshotA = await getSnapshot();
    });

    afterEach(async function () {
      await revertToSnapshot(snapshotA);
      snapshotA = await getSnapshot();
    });

    for (const to of TO_TARGETS) {
      it(`blocks reentry into ${to.name}`, async function () {
        // For attacker-address-dependent targets (orchestration wrappers that
        // run createSellerInternal before reaching the inner nonReentrant
        // delegate), rebuild calldata with the malicious contract's address
        // in `_seller.assistant`/`admin` so the seller-creation pre-check
        // passes and execution reaches the inner guard.
        const callData = rebuildCalldataForAttacker(to, await malicious.getAddress());

        // Arm the malicious treasury: when it receives ETH it will call back
        // into the protocol via the TO function and record what happened.
        await malicious.arm(protocolDiamondAddress, callData, false);

        // Trigger: assistant withdraws to the seller's treasury (= malicious)
        const tx = await fundsHandler.connect(assistant).withdrawFunds(sellerId, [ZeroAddress], [depositAmount]);
        const receipt = await tx.wait();

        const args = await lastReentryEvent(malicious, receipt);
        expect(args.toSelector, "TO selector").to.equal(to.selector);
        expect(args.blocked, `${to.name} should be blocked by guard`).to.equal(true);
        expect(args.innerSelector, "inner revert selector").to.equal(REENTRANCY_GUARD_SELECTOR);
      });
    }
  });

  // ============================================================
  // FROM Category B: Malicious ERC20 callback in transferFundsIn
  // ------------------------------------------------------------
  // The malicious contract poses as an ERC20 exchange token. When the
  // protocol pulls funds in via `safeTransferFrom`, the malicious contract's
  // `transferFrom` runs — and from inside it we attempt to re-enter every TO
  // function. The protocol's reentrancy guard must block every attempt.
  //
  // The simplest trigger is `depositFunds(entityId, maliciousToken, amount)`:
  // it always calls `transferFundsIn` on the supplied token, with no
  // additional setup required (no offer, no DR). The malicious contract's
  // transferFrom self-credits `balances[protocol] += amount` so Boson's
  // balance-delta check in transferFundsIn passes and the outer tx survives
  // long enough for our ReentryAttempted event to be observed.
  // ============================================================
  describe("B. Malicious ERC20 deposit (transferFrom hook)", function () {
    let malicious;
    let maliciousAddr;
    let sellerId;
    let snapshotB;
    const depositAmount = parseUnits("1", "ether");

    before(async function () {
      await revertToSnapshot(cleanSnapshot);
      cleanSnapshot = await getSnapshot();
      accountId.next(true);

      ({ malicious, maliciousAddr } = await deployMaliciousAndGrantRoles("MaliciousReentrant"));

      // Create a normal seller (treasury = a regular EOA, not malicious,
      // so we don't accidentally introduce an ETH callback here).
      const seller = await createStandardSeller();
      sellerId = seller.id;

      snapshotB = await getSnapshot();
    });

    afterEach(async function () {
      await revertToSnapshot(snapshotB);
      snapshotB = await getSnapshot();
    });

    for (const to of TO_TARGETS) {
      it(`blocks reentry into ${to.name}`, async function () {
        // Rebuild calldata for attacker-dependent orchestration wrappers; for
        // all other targets this returns the cached zero-arg calldata.
        const callData = rebuildCalldataForAttacker(to, maliciousAddr);

        // Arm: when the protocol calls malicious.transferFrom, the malicious
        // contract will try to call back into the protocol via the TO
        // function.
        await malicious.arm(protocolDiamondAddress, callData, false);

        // Trigger: depositFunds calls IERC20(malicious).safeTransferFrom →
        // malicious.transferFrom → _attack.
        const tx = await fundsHandler.connect(rando).depositFunds(sellerId, maliciousAddr, depositAmount);
        const receipt = await tx.wait();

        const args = await lastReentryEvent(malicious, receipt);
        expect(args.toSelector, "TO selector").to.equal(to.selector);
        expect(args.blocked, `${to.name} should be blocked by guard`).to.equal(true);
        expect(args.innerSelector, "inner revert selector").to.equal(REENTRANCY_GUARD_SELECTOR);
      });
    }
  });

  // ============================================================
  // FROM Category C: ERC721 onERC721Received during twin redeem
  // ------------------------------------------------------------
  // The buyer wallet is the malicious contract. When the buyer redeems a
  // voucher backed by an ERC721 twin, the protocol does
  // `twin.safeTransferFrom(assistant, malicious, tokenId, "")` (assembly
  // call). The twin's safeTransferFrom calls `onERC721Received` on the
  // malicious contract, which fires `_attack`.
  //
  // We use the orchestration `commitToOfferAndRedeemVoucher` so commit and
  // redeem happen in a single tx and we don't need to fast-forward time
  // before redemption. The protocol catches twin-transfer failures via
  // try/catch and raises a dispute instead of reverting; the outer tx
  // succeeds so events are observable on chain.
  // ============================================================
  describe("C. ERC721 twin redeem (onERC721Received hook)", function () {
    let malicious;
    let maliciousAddr;
    let snapshotC;
    let offerId;
    const price = parseEther("0.5");

    before(async function () {
      await revertToSnapshot(cleanSnapshot);
      cleanSnapshot = await getSnapshot();
      accountId.next(true);

      ({ malicious, maliciousAddr } = await deployMaliciousAndGrantRoles("MaliciousReentrant"));

      // Deploy Foreign721 (used as the twin token) and mint to assistant
      const Foreign721 = await getContractFactory("Foreign721");
      const foreign721 = await Foreign721.deploy();
      await foreign721.waitForDeployment();
      await foreign721.connect(assistant).mint("1", "10");
      await foreign721.connect(assistant).setApprovalForAll(protocolDiamondAddress, true);

      const seller = await createStandardSeller();
      const disputeResolver = await createStandardDisputeResolver(parseEther("0.01").toString());

      // Offer with voucher immediately redeemable so the orchestration
      // commit+redeem doesn't fall foul of voucherRedeemableFrom.
      // disputePeriod stays at mock default (≥ minDisputePeriod = 1 week).
      const offer = await createOfferWithDefaults({
        price,
        voucherRedeemableFrom: "1",
        disputeResolverId: disputeResolver.id,
      });
      offerId = offer.id;

      // Create an ERC721 twin and bundle it with the offer
      const twin = mockTwin(await foreign721.getAddress(), TokenType.NonFungibleToken);
      twin.amount = "0";
      twin.supplyAvailable = "10";
      twin.tokenId = "1";
      await twinHandler.connect(assistant).createTwin(twin.toStruct());

      const bundle = new Bundle("1", seller.id, [offerId], [twin.id]);
      await bundleHandler.connect(assistant).createBundle(bundle.toStruct());

      // Deposit seller funds to cover the DR fee (handleDRFeeCollection
      // decreases the seller's available funds by feeAmount at commit time).
      // Buffer comfortably so multiple test cases can commit from one snapshot.
      const sellerPool = parseEther("5");
      await fundsHandler.connect(assistant).depositFunds(seller.id, ZeroAddress, sellerPool, { value: sellerPool });

      snapshotC = await getSnapshot();
    });

    afterEach(async function () {
      await revertToSnapshot(snapshotC);
      snapshotC = await getSnapshot();
    });

    // Build the commitToOfferAndRedeemVoucher calldata once; the orchestration
    // function lives in the diamond and is callable via the combined interface.
    const orchestrationIface = buildCombinedInterface();

    for (const to of TO_TARGETS) {
      it(`blocks reentry into ${to.name}`, async function () {
        // Rebuild calldata for attacker-dependent orchestration wrappers.
        const callData = rebuildCalldataForAttacker(to, maliciousAddr);

        // Arm: when the protocol delivers the twin to malicious via
        // safeTransferFrom, onERC721Received fires _attack.
        await malicious.arm(protocolDiamondAddress, callData, false);

        // Drive the protocol via the malicious contract so it becomes
        // msg.sender (== buyer wallet). Use orchestration commit+redeem
        // so we don't need to fast-forward time after commit.
        const commitAndRedeemCd = orchestrationIface.encodeFunctionData("commitToOfferAndRedeemVoucher", [offerId]);
        const tx = await malicious.connect(rando).executeProtocolCallValue(commitAndRedeemCd, { value: price });
        const receipt = await tx.wait();

        const args = await lastReentryEvent(malicious, receipt);
        expect(args.toSelector, "TO selector").to.equal(to.selector);
        expect(args.blocked, `${to.name} should be blocked by guard`).to.equal(true);
        expect(args.innerSelector, "inner revert selector").to.equal(REENTRANCY_GUARD_SELECTOR);
      });
    }
  });

  // ============================================================
  // FROM Category D: ERC1155 onERC1155Received during twin redeem
  // ------------------------------------------------------------
  // Same shape as FROM C, but the twin is an ERC1155 (MultiToken). The
  // assembly call uses
  // `safeTransferFrom(address,address,uint256,uint256,bytes)` which fires
  // `onERC1155Received` on the recipient (the malicious buyer wallet).
  // ============================================================
  describe("D. ERC1155 twin redeem (onERC1155Received hook)", function () {
    let malicious;
    let maliciousAddr;
    let snapshotD;
    let offerId;
    const price = parseEther("0.5");

    before(async function () {
      await revertToSnapshot(cleanSnapshot);
      cleanSnapshot = await getSnapshot();
      accountId.next(true);

      ({ malicious, maliciousAddr } = await deployMaliciousAndGrantRoles("MaliciousReentrant"));

      // Deploy Foreign1155 (the twin token) and mint to assistant
      const Foreign1155 = await getContractFactory("Foreign1155");
      const foreign1155 = await Foreign1155.deploy();
      await foreign1155.waitForDeployment();
      await foreign1155.connect(assistant).mint("1", "500");
      await foreign1155.connect(assistant).setApprovalForAll(protocolDiamondAddress, true);

      const seller = await createStandardSeller();
      const disputeResolver = await createStandardDisputeResolver(parseEther("0.01").toString());

      const offer = await createOfferWithDefaults({
        price,
        voucherRedeemableFrom: "1",
        disputeResolverId: disputeResolver.id,
      });
      offerId = offer.id;

      // Create an ERC1155 (MultiToken) twin and bundle it with the offer
      const twin = mockTwin(await foreign1155.getAddress(), TokenType.MultiToken);
      twin.tokenId = "1";
      twin.amount = "1";
      twin.supplyAvailable = "10";
      await twinHandler.connect(assistant).createTwin(twin.toStruct());

      const bundle = new Bundle("1", seller.id, [offerId], [twin.id]);
      await bundleHandler.connect(assistant).createBundle(bundle.toStruct());

      // Seller pool to cover DR fee
      const sellerPool = parseEther("5");
      await fundsHandler.connect(assistant).depositFunds(seller.id, ZeroAddress, sellerPool, { value: sellerPool });

      snapshotD = await getSnapshot();
    });

    afterEach(async function () {
      await revertToSnapshot(snapshotD);
      snapshotD = await getSnapshot();
    });

    const orchestrationIface = buildCombinedInterface();

    for (const to of TO_TARGETS) {
      it(`blocks reentry into ${to.name}`, async function () {
        // Rebuild calldata for attacker-dependent orchestration wrappers.
        const callData = rebuildCalldataForAttacker(to, maliciousAddr);

        // Arm: when the protocol delivers the ERC1155 twin to malicious via
        // safeTransferFrom, onERC1155Received fires _attack.
        await malicious.arm(protocolDiamondAddress, callData, false);

        const commitAndRedeemCd = orchestrationIface.encodeFunctionData("commitToOfferAndRedeemVoucher", [offerId]);
        const tx = await malicious.connect(rando).executeProtocolCallValue(commitAndRedeemCd, { value: price });
        const receipt = await tx.wait();

        const args = await lastReentryEvent(malicious, receipt);
        expect(args.toSelector, "TO selector").to.equal(to.selector);
        expect(args.blocked, `${to.name} should be blocked by guard`).to.equal(true);
        expect(args.innerSelector, "inner revert selector").to.equal(REENTRANCY_GUARD_SELECTOR);
      });
    }
  });

  // ============================================================
  // FROM Category E: External price discovery contract (fallback hook)
  // ------------------------------------------------------------
  // The protocol's `commitToPriceDiscoveryOffer` routes through the
  // BosonPriceDiscovery wrapper, which calls the user-supplied price
  // discovery contract via `functionCallWithValue`. The malicious contract
  // sits at that user-supplied address; the wrapper's low-level call lands
  // in `fallback()` which fires `_attack`.
  //
  // Verification strategy (different from A–D): the BosonPriceDiscovery
  // wrapper performs strict post-call validations (balance change, voucher
  // transfer, price match). If the malicious contract simply records the
  // reentry and returns, the wrapper reverts on those validations BEFORE
  // the outer tx finishes — and events from a reverted tx are wiped from
  // the receipt. We therefore arm with `bubbleUp = true`: when the inner
  // reentry hits the protocol's `ReentrancyGuard`, the malicious contract
  // re-throws that same error. The wrapper's low-level call propagates the
  // revert, and the outer `commitToPriceDiscoveryOffer` reverts with the
  // exact same custom error. We assert `revertedWithCustomError(bosonErrors,
  // "ReentrancyGuard")` — which is only reachable if the inner reentry was
  // attempted AND blocked by the guard.
  // ============================================================
  describe("E. External price discovery (fallback hook)", function () {
    let maliciousPD;
    let maliciousPdAddr;
    let snapshotE;
    let offerId;
    let priceDiscoveryStruct;
    let buyer;
    const price = parseEther("0.1");

    before(async function () {
      await revertToSnapshot(cleanSnapshot);
      cleanSnapshot = await getSnapshot();
      accountId.next(true);

      // Use a fresh buyer signer so the EOA has no prior buyer registration
      // that could collide between cases.
      const signers = await getSigners();
      buyer = signers[15];

      ({ malicious: maliciousPD, maliciousAddr: maliciousPdAddr } =
        await deployMaliciousAndGrantRoles("MaliciousPriceDiscovery"));

      // Deploy the real BosonPriceDiscovery wrapper that the protocol will
      // call into. The wrapper then forwards to the malicious contract via
      // functionCallWithValue → malicious.fallback() → _attack.
      const bpdFactory = await getContractFactory("BosonPriceDiscovery");
      const bpd = await bpdFactory.deploy(await weth.getAddress(), protocolDiamondAddress);
      await bpd.waitForDeployment();
      await configHandler.connect(deployer).setPriceDiscoveryAddress(await bpd.getAddress());

      await createStandardSeller();
      // DR fee = 0 so we don't need a mutualizer for this block.
      const disputeResolver = await createStandardDisputeResolver();

      const offer = await createOfferWithDefaults({
        price: "0",
        priceType: PriceType.Discovery,
        quantityAvailable: "10",
        disputeResolverId: disputeResolver.id,
      });
      offerId = offer.id;

      // Reserve range and pre-mint vouchers — required for price-discovery offers
      await reserveAndPreMint(offer);

      // Build the PriceDiscovery struct pointing at the malicious contract.
      // Side.Ask means the protocol calls wrapper.fulfilAskOrder, which then
      // does `priceDiscoveryContract.functionCallWithValue(data, 0)`.
      // The protocol requires priceDiscoveryData to be non-empty (InvalidPriceDiscovery
      // is raised otherwise), so we pass a 4-byte sentinel selector that no
      // malicious function matches → execution falls through to fallback() which
      // calls _attack.
      priceDiscoveryStruct = new PriceDiscovery(
        price.toString(),
        Side.Ask,
        maliciousPdAddr,
        maliciousPdAddr,
        "0xdeadbeef"
      );

      snapshotE = await getSnapshot();
    });

    afterEach(async function () {
      await revertToSnapshot(snapshotE);
      snapshotE = await getSnapshot();
    });

    for (const to of TO_TARGETS) {
      it(`blocks reentry into ${to.name}`, async function () {
        // Rebuild calldata for attacker-dependent orchestration wrappers.
        const callData = rebuildCalldataForAttacker(to, maliciousPdAddr);

        // Arm: bubble up the inner revert so it reaches the outer tx
        await maliciousPD.arm(protocolDiamondAddress, callData, true);

        // Native-denominated offers route the buyer's payment as wrapped
        // native (WETH) — buyer deposits and approves WETH, then commits
        // with msg.value = 0. Native ETH passed via msg.value triggers
        // `NativeNotAllowed` because validateIncomingPayment treats the
        // exchange token as wNative (ERC20) after substitution.
        await weth.connect(buyer).deposit({ value: price });
        await weth.connect(buyer).approve(await priceDiscoveryHandler.getAddress(), price);

        const tokenId = deriveTokenId(offerId, "1");
        const tx = priceDiscoveryHandler
          .connect(buyer)
          .commitToPriceDiscoveryOffer(await buyer.getAddress(), tokenId, priceDiscoveryStruct.toStruct());

        // The inner reentry must be blocked by the protocol's nonReentrant
        // modifier; the malicious contract bubbles up that revert; the
        // wrapper's low-level call propagates it; the outer tx reverts with
        // the exact same custom error.
        await expect(tx).to.be.revertedWithCustomError(bosonErrors, "ReentrancyGuard");
      });
    }
  });

  // ============================================================
  // FROM Category E': External price discovery in SEQUENTIAL commit
  // ------------------------------------------------------------
  // Same wrapper → user-supplied discovery contract → malicious fallback
  // pattern as FROM E, but invoked through `sequentialCommitToOffer`. This
  // exercises the resale path: a reseller already holds a committed
  // voucher, and a new buyer attempts to commit through the malicious
  // discovery contract. We use the same bubbleUp=true verification.
  // ============================================================
  describe("E'. Sequential commit (fallback hook)", function () {
    let maliciousPD;
    let maliciousPdAddr;
    let snapshotEPrime;
    let tokenId;
    let priceDiscoveryStruct;
    let newBuyer;
    const price = parseEther("0.1");
    const resalePrice = parseEther("0.2");

    before(async function () {
      await revertToSnapshot(cleanSnapshot);
      cleanSnapshot = await getSnapshot();
      accountId.next(true);

      const signers = await getSigners();
      const reseller = signers[15];
      newBuyer = signers[16];

      ({ malicious: maliciousPD, maliciousAddr: maliciousPdAddr } =
        await deployMaliciousAndGrantRoles("MaliciousPriceDiscovery"));

      // Deploy the real BosonPriceDiscovery wrapper
      const bpdFactory = await getContractFactory("BosonPriceDiscovery");
      const bpd = await bpdFactory.deploy(await weth.getAddress(), protocolDiamondAddress);
      await bpd.waitForDeployment();
      await configHandler.connect(deployer).setPriceDiscoveryAddress(await bpd.getAddress());

      await createStandardSeller();
      const disputeResolver = await createStandardDisputeResolver();

      const offer = await createOfferWithDefaults({
        price: "0",
        priceType: PriceType.Discovery,
        quantityAvailable: "10",
        disputeResolverId: disputeResolver.id,
      });
      const offerId = offer.id;

      const { bosonVoucher, expectedCloneAddress } = await reserveAndPreMint(offer);

      // Initial commit: use the real PriceDiscoveryMock to put a voucher
      // into the reseller's hands. The wrapper will hold the funds and
      // approve the mock to spend them; the mock will transfer the voucher
      // from assistant → wrapper, and transferFrom(wrapper, assistant, price)
      // to forward the funds back to the seller.
      const PDMockFactory = await getContractFactory("PriceDiscoveryMock");
      const pdMock = await PDMockFactory.deploy();
      await pdMock.waitForDeployment();
      const pdMockAddr = await pdMock.getAddress();

      tokenId = deriveTokenId(offerId, "1");
      const order = {
        seller: await assistant.getAddress(),
        buyer: await reseller.getAddress(),
        voucherContract: expectedCloneAddress,
        tokenId: tokenId,
        exchangeToken: await weth.getAddress(),
        price: price,
      };
      const initialPdData = pdMock.interface.encodeFunctionData("fulfilBuyOrder", [order]);

      // Seller (assistant) approves the mock to transfer the voucher.
      await bosonVoucher.connect(assistant).setApprovalForAll(pdMockAddr, true);
      // Seller also approves the protocol to encumber WETH paid by reseller
      // (the protocol pulls actualPrice back from seller after the mock pays them).
      await weth.connect(assistant).approve(await priceDiscoveryHandler.getAddress(), MaxUint256);

      // Reseller deposits WETH and approves protocol
      await weth.connect(reseller).deposit({ value: price });
      await weth.connect(reseller).approve(await priceDiscoveryHandler.getAddress(), price);

      const initialPriceDiscovery = new PriceDiscovery(
        price.toString(),
        Side.Ask,
        pdMockAddr,
        pdMockAddr,
        initialPdData
      );

      await priceDiscoveryHandler
        .connect(reseller)
        .commitToPriceDiscoveryOffer(await reseller.getAddress(), tokenId, initialPriceDiscovery.toStruct());

      // Now reseller holds the voucher. To do the resale via wrapper, the
      // reseller (voucher owner) must approve the wrapper to transfer the
      // voucher. Without this the wrapper's `_bosonVoucher.approve(...)`
      // path is unrelated — for Ask side, the wrapper expects the user's
      // priceDiscoveryContract to transfer the voucher INTO the wrapper.
      // For our reentrancy verification we never reach those checks (the
      // inner revert bubbles first), so the approval is not strictly
      // required; we still set it up to mirror a realistic flow.
      await bosonVoucher.connect(reseller).setApprovalForAll(maliciousPdAddr, true);

      // Build the malicious PriceDiscovery struct for the resale call
      priceDiscoveryStruct = new PriceDiscovery(
        resalePrice.toString(),
        Side.Ask,
        maliciousPdAddr,
        maliciousPdAddr,
        "0xdeadbeef"
      );

      snapshotEPrime = await getSnapshot();
    });

    afterEach(async function () {
      await revertToSnapshot(snapshotEPrime);
      snapshotEPrime = await getSnapshot();
    });

    for (const to of TO_TARGETS) {
      it(`blocks reentry into ${to.name}`, async function () {
        // Rebuild calldata for attacker-dependent orchestration wrappers.
        const callData = rebuildCalldataForAttacker(to, maliciousPdAddr);

        await maliciousPD.arm(protocolDiamondAddress, callData, true);

        // Fund and approve the new buyer's WETH payment
        await weth.connect(newBuyer).deposit({ value: resalePrice });
        await weth.connect(newBuyer).approve(await sequentialCommitHandler.getAddress(), resalePrice);

        const tx = sequentialCommitHandler
          .connect(newBuyer)
          .sequentialCommitToOffer(await newBuyer.getAddress(), tokenId, priceDiscoveryStruct.toStruct());

        await expect(tx).to.be.revertedWithCustomError(bosonErrors, "ReentrancyGuard");
      });
    }
  });

  // ============================================================
  // FROM Category F: DR fee mutualizer callback (requestDRFee at commit)
  // ------------------------------------------------------------
  // The offer is registered with a malicious mutualizer that implements
  // IDRFeeMutualizer. At commit time, the protocol calls
  // `IDRFeeMutualizer.requestDRFee(...)` on the mutualizer to pull the DR
  // fee in. The malicious mutualizer's `requestDRFee` calls `_attack`,
  // which attempts to re-enter the protocol via the armed TO calldata.
  //
  // Verification (same shape as FROM E/E'): arm with `bubbleUp = true` so
  // the inner ReentrancyGuard revert propagates out of `requestDRFee`
  // through the protocol's call and reverts the outer `commitToOffer`
  // with the same custom error.
  //
  // We don't exercise the `finalizeExchange` path: that path is wrapped in
  // a try/catch with a fixed gas stipend, so any inner revert is swallowed
  // by the protocol and the outer tx still succeeds — leaving no observable
  // signal for our verification.
  // ============================================================
  describe("F. DR fee mutualizer (requestDRFee hook)", function () {
    let maliciousMut;
    let maliciousMutAddr;
    let snapshotF;
    let offerId;
    let buyer;
    const price = parseEther("0.1");
    const drFee = parseEther("0.01");

    before(async function () {
      await revertToSnapshot(cleanSnapshot);
      cleanSnapshot = await getSnapshot();
      accountId.next(true);

      const signers = await getSigners();
      buyer = signers[17];

      ({ malicious: maliciousMut, maliciousAddr: maliciousMutAddr } =
        await deployMaliciousAndGrantRoles("ReentrantMutualizer"));

      await createStandardSeller();
      // Non-zero native DR fee so the protocol actually invokes requestDRFee.
      const disputeResolver = await createStandardDisputeResolver(drFee.toString());

      // Static offer wired to the malicious mutualizer.
      const offer = await createOfferWithDefaults({
        price,
        quantityAvailable: "10",
        disputeResolverId: disputeResolver.id,
        mutualizerAddress: maliciousMutAddr,
      });
      offerId = offer.id;

      snapshotF = await getSnapshot();
    });

    afterEach(async function () {
      await revertToSnapshot(snapshotF);
      snapshotF = await getSnapshot();
    });

    for (const to of TO_TARGETS) {
      it(`blocks reentry into ${to.name}`, async function () {
        // Rebuild calldata for attacker-dependent orchestration wrappers.
        const callData = rebuildCalldataForAttacker(to, maliciousMutAddr);

        await maliciousMut.arm(protocolDiamondAddress, callData, true);

        const tx = exchangeCommitHandler
          .connect(buyer)
          .commitToOffer(await buyer.getAddress(), offerId, { value: price });

        await expect(tx).to.be.revertedWithCustomError(bosonErrors, "ReentrancyGuard");
      });
    }
  });
});
