const { ethers, network } = require("hardhat");
const {
  getContractAt,
  ZeroAddress,
  getSigners,
  getContractFactory,
  MaxUint256,
  parseUnits,
  randomBytes,
  zeroPadValue,
  AbiCoder,
  Signature,
  encodeBytes32String,
  provider,
} = ethers;
const { expect } = require("chai");

const OfferCreator = require("../../scripts/domain/OfferCreator");
const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
const { RoyaltyInfo } = require("../../scripts/domain/RoyaltyInfo");
const {
  calculateCloneAddress,
  calculateBosonProxyAddress,
  setupTestEnvironment,
  getSnapshot,
  revertToSnapshot,
  deriveTokenId,
  getEvent,
  prepareDataSignature,
} = require("../util/utils.js");
const {
  mockOffer,
  mockDisputeResolver,
  mockSeller,
  mockBuyer,
  mockVoucherInitValues,
  mockAuthToken,
  accountId,
} = require("../util/mock");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");

// Per-entry authorization strategy tag (mirrors BosonTypes.TokenTransferAuthorizationStrategy)
const TokenTransferAuthorizationStrategy = { None: 0, ERC3009: 1, EIP2612: 2, Permit2: 3 };

// Canonical Permit2 address (must match `TokenTransferAuthorizationLib.PERMIT2`)
const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

// EIP-712 types for ERC-3009 ReceiveWithAuthorization (matches MockERC3009Token)
const RECEIVE_WITH_AUTHORIZATION_TYPES = {
  ReceiveWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
};

// EIP-712 types for EIP-2612 Permit (matches OZ ERC20Permit / DAI / USDC-on-newer-chains)
const EIP2612_PERMIT_TYPES = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
};

// EIP-712 types for Permit2 PermitTransferFrom
const PERMIT2_TRANSFER_FROM_TYPES = {
  PermitTransferFrom: [
    { name: "permitted", type: "TokenPermissions" },
    { name: "spender", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
  TokenPermissions: [
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
  ],
};

// Generic metatx type
const META_TRANSACTION_TYPES = {
  MetaTransaction: [
    { name: "nonce", type: "uint256" },
    { name: "from", type: "address" },
    { name: "contractAddress", type: "address" },
    { name: "functionName", type: "string" },
    { name: "functionSignature", type: "bytes" },
  ],
};

/**
 * Test the Buyer-Initiated Exchange feature (BPIP-9), specifically the
 * `commitToOffer() - Seller Commits` (a.k.a. `commitToBuyerOffer`) context,
 * but invoked through `executeMetaTransactionWithTokenTransferAuthorization`
 * with a token-transfer-authorization queue instead of a pre-approved ERC-20
 * allowance.
 *
 * Mirrors the original `commitToOffer() - Seller Commits` context from
 * `BuyerInitiatedOfferTest.js`, run three times — once per strategy:
 * ERC-3009, EIP-2612, and Permit2. The shared body lives in
 * `defineSellerCommitsTests`; each strategy provides its own token, entry
 * builder, and one-time setup (e.g. Permit2 needs the seller to one-time
 * `approve(PERMIT2, MaxUint256)` on the token).
 *
 * In every strategy: the seller (assistant) signs both the metatx and a
 * single-entry token-transfer authorization for `sellerDeposit`. No
 * `approve(protocol, ...)` call is made for the seller side. The buyer
 * pre-deposits the price into the protocol via the standard
 * approve+depositFunds flow, since this context only exercises the
 * seller-side commit.
 */
describe("Buyer-Initiated Exchange — Seller Commits with authorization", function () {
  let rando, assistant, admin, treasury, adminDR, treasuryDR, buyer1, buyer2, assistant2;
  let accountHandler, fundsHandler, exchangeHandler, exchangeCommitHandler, offerHandler;
  let metaTransactionsHandler;
  let seller, seller2;
  let offer, offerDates, offerDurations;
  let buyerCreatedOffer;
  let mockToken; // MockERC3009Token (used for ERC-3009 + Permit2 strategies)
  let mockToken2612; // MockERC2612Token (used for EIP-2612 strategy)
  let buyerId, buyerId2, sellerId, sellerId2;
  let disputeResolver;
  let voucherInitValues, emptyAuthToken;
  let agentId, offerFeeLimit;
  let snapshot;
  let nextOfferId;
  let weth;
  let protocolDiamondAddress;
  let deployer;

  before(async function () {
    [, , rando, assistant, admin, , treasury, , adminDR, , treasuryDR, buyer1, buyer2, assistant2] = await getSigners();

    const wethFactory = await getContractFactory("WETH9");
    weth = await wethFactory.deploy();
    await weth.waitForDeployment();

    const contracts = {
      accountHandler: "IBosonAccountHandler",
      offerHandler: "IBosonOfferHandler",
      exchangeHandler: "IBosonExchangeHandler",
      exchangeCommitHandler: "IBosonExchangeCommitHandler",
      fundsHandler: "IBosonFundsHandler",
      metaTransactionsHandler: "IBosonMetaTransactionsHandler",
    };

    // Deploy the ERC-3009 token. The Permit2 strategy reuses this token (it's
    // an ERC-20 underneath); the EIP-2612 strategy uses its own permit-token.
    const Mock3009 = await getContractFactory("MockERC3009Token");
    mockToken = await Mock3009.deploy("Foreign20", "F20");
    await mockToken.waitForDeployment();

    // Deploy the EIP-2612 permit-supporting token used in the EIP-2612 context.
    const Mock2612 = await getContractFactory("MockERC2612Token");
    mockToken2612 = await Mock2612.deploy("Foreign2612", "F26");
    await mockToken2612.waitForDeployment();

    // Inject MockPermit2 at the canonical Permit2 address. The Permit2
    // sub-context relies on this code being present at PERMIT2_ADDRESS so
    // `TokenTransferAuthorizationLib._consumePermit2` calls land on it.
    const MockP2 = await getContractFactory("MockPermit2");
    const deployedP2 = await MockP2.deploy();
    await deployedP2.waitForDeployment();
    const code = await provider.getCode(await deployedP2.getAddress());
    await network.provider.send("hardhat_setCode", [PERMIT2_ADDRESS, code]);

    ({
      signers: [, admin, treasury, rando, adminDR, treasuryDR, assistant2],
      contractInstances: {
        accountHandler,
        offerHandler,
        exchangeHandler,
        exchangeCommitHandler,
        fundsHandler,
        metaTransactionsHandler,
      },
      diamondAddress: protocolDiamondAddress,
    } = await setupTestEnvironment(contracts, { wethAddress: await weth.getAddress() }));

    [deployer] = await getSigners();

    assistant = admin;

    snapshot = await getSnapshot();
  });

  beforeEach(async function () {
    await revertToSnapshot(snapshot);
    snapshot = await getSnapshot();

    accountId.next(true);

    seller = mockSeller(
      await assistant.getAddress(),
      await admin.getAddress(),
      ZeroAddress,
      await treasury.getAddress()
    );
    expect(seller.isValid()).is.true;

    voucherInitValues = mockVoucherInitValues();
    expect(voucherInitValues.isValid()).is.true;

    emptyAuthToken = mockAuthToken();
    expect(emptyAuthToken.isValid()).is.true;
    await accountHandler.connect(admin).createSeller(seller, emptyAuthToken, voucherInitValues);
    sellerId = seller.id;

    seller2 = mockSeller(
      await assistant2.getAddress(),
      await assistant2.getAddress(),
      ZeroAddress,
      await treasury.getAddress()
    );
    expect(seller2.isValid()).is.true;
    await accountHandler.connect(assistant2).createSeller(seller2, emptyAuthToken, voucherInitValues);
    sellerId2 = seller2.id;

    const buyer = mockBuyer(await buyer1.getAddress());
    expect(buyer.isValid()).is.true;
    await accountHandler.connect(buyer1).createBuyer(buyer);
    buyerId = buyer.id;

    const buyerEntity2 = mockBuyer(await buyer2.getAddress());
    expect(buyerEntity2.isValid()).is.true;
    await accountHandler.connect(buyer2).createBuyer(buyerEntity2);
    buyerId2 = buyerEntity2.id;

    disputeResolver = mockDisputeResolver(
      await adminDR.getAddress(),
      await adminDR.getAddress(),
      ZeroAddress,
      await treasuryDR.getAddress(),
      true
    );
    expect(disputeResolver.isValid()).is.true;

    // DR supports both tokens so any strategy can pick the appropriate one.
    const disputeResolverFees = [
      new DisputeResolverFee(ZeroAddress, "Native", "0"),
      new DisputeResolverFee(await mockToken.getAddress(), "Foreign20", "0"),
      new DisputeResolverFee(await mockToken2612.getAddress(), "Foreign2612", "0"),
    ];

    await accountHandler.connect(adminDR).createDisputeResolver(disputeResolver, disputeResolverFees, []);

    nextOfferId = "1";

    ({ offer, offerDates, offerDurations } = await mockOffer());

    // Buyer-created offer scaffold; the strategy-specific context fills in
    // `exchangeToken` based on which token the strategy uses.
    buyerCreatedOffer = offer.clone();
    buyerCreatedOffer.sellerId = "0";
    buyerCreatedOffer.creator = OfferCreator.Buyer;
    buyerCreatedOffer.buyerId = buyerId;
    buyerCreatedOffer.collectionIndex = "0";
    buyerCreatedOffer.royaltyInfo = [new RoyaltyInfo([], [])];

    agentId = "0";
    offerFeeLimit = MaxUint256;

    // Top up wallets in both tokens so each strategy has the funds it needs
    // without re-minting per context.
    const big = parseUnits("100", "ether").toString();
    for (const tok of [mockToken, mockToken2612]) {
      await tok.mint(await assistant.getAddress(), big);
      await tok.mint(await assistant2.getAddress(), big);
      await tok.mint(await buyer1.getAddress(), big);
      await tok.mint(await buyer2.getAddress(), big);
    }
  });

  afterEach(async function () {
    accountId.next(true);
  });

  // Helpers ---------------------------------------------------------------

  // ERC-3009 entry builder: signs `ReceiveWithAuthorization` typed message
  // against the token's domain.
  function makeERC3009Builder(token) {
    return async function (signer, value) {
      const validAfter = 0;
      const validBefore = MaxUint256;
      const authNonce = zeroPadValue("0x" + Buffer.from(randomBytes(32)).toString("hex"), 32);
      const params = {
        from: await signer.getAddress(),
        to: protocolDiamondAddress,
        value,
        validAfter,
        validBefore,
        nonce: authNonce,
      };
      const { chainId } = await provider.getNetwork();
      const domain = {
        name: await token.name(),
        version: "1",
        chainId,
        verifyingContract: await token.getAddress(),
      };
      const sig = await signer.signTypedData(domain, RECEIVE_WITH_AUTHORIZATION_TYPES, params);
      const split = Signature.from(sig);
      const erc3009Data = AbiCoder.defaultAbiCoder().encode(
        ["uint256", "uint256", "bytes32", "uint8", "bytes32", "bytes32"],
        [validAfter, validBefore, authNonce, split.v, split.r, split.s]
      );
      return AbiCoder.defaultAbiCoder().encode(
        ["uint8", "bytes"],
        [TokenTransferAuthorizationStrategy.ERC3009, erc3009Data]
      );
    };
  }

  // EIP-2612 entry builder: signs `Permit` typed message bound to value ==
  // amount, spender == protocol.
  function makeEIP2612Builder(token) {
    return async function (signer, amount) {
      const { chainId } = await provider.getNetwork();
      const domain = {
        name: await token.name(),
        version: "1",
        chainId,
        verifyingContract: await token.getAddress(),
      };
      const message = {
        owner: await signer.getAddress(),
        spender: protocolDiamondAddress,
        value: amount,
        nonce: await token.nonces(await signer.getAddress()),
        deadline: MaxUint256,
      };
      const sig = await signer.signTypedData(domain, EIP2612_PERMIT_TYPES, message);
      const split = Signature.from(sig);
      const data = AbiCoder.defaultAbiCoder().encode(
        ["uint256", "uint8", "bytes32", "bytes32"],
        [message.deadline, split.v, split.r, split.s]
      );
      return AbiCoder.defaultAbiCoder().encode(["uint8", "bytes"], [TokenTransferAuthorizationStrategy.EIP2612, data]);
    };
  }

  // Permit2 entry builder: signs a `PermitTransferFrom` typed message against
  // the canonical Permit2 contract; nonce is fresh per call so multiple
  // entries in the same queue don't clash.
  function makePermit2Builder(token) {
    return async function (signer, amount) {
      const { chainId } = await provider.getNetwork();
      const domain = {
        name: "Permit2",
        chainId,
        verifyingContract: PERMIT2_ADDRESS,
      };
      const permitNonce = BigInt("0x" + Buffer.from(randomBytes(8)).toString("hex"));
      const message = {
        permitted: { token: await token.getAddress(), amount },
        spender: protocolDiamondAddress,
        nonce: permitNonce,
        deadline: MaxUint256,
      };
      const sig = await signer.signTypedData(domain, PERMIT2_TRANSFER_FROM_TYPES, message);
      const data = AbiCoder.defaultAbiCoder().encode(
        ["uint256", "uint256", "bytes"],
        [permitNonce, message.deadline, sig]
      );
      return AbiCoder.defaultAbiCoder().encode(["uint8", "bytes"], [TokenTransferAuthorizationStrategy.Permit2, data]);
    };
  }

  /**
   * Drop-in replacement for
   *   `exchangeCommitHandler.connect(sellerSigner).commitToBuyerOffer(offerId, sellerParams)`
   *
   * Wraps the call in `executeMetaTransactionWithTokenTransferAuthorization`. The queue
   * always has one slot for the seller pull. If `amount` is 0 the slot is
   * filled with `"0x"` and the protocol discards it. For revert tests that
   * want the safeTransferFrom fallback path, set `forceFallback: true` to
   * insert an empty marker instead of a real auth.
   *
   * `entryBuilder` is the strategy-specific builder closure (returned by
   * `makeERC3009Builder` / `makeEIP2612Builder` / `makePermit2Builder`).
   */
  async function commitToBuyerOfferWithAuth({
    caller,
    sellerSigner,
    targetOfferId,
    sellerParams,
    amount,
    entryBuilder,
    forceFallback = false,
  }) {
    caller = caller ?? deployer;

    const fragment = exchangeCommitHandler.interface.getFunction("commitToBuyerOffer");
    const functionName = fragment.format("sighash");
    const fnSig = exchangeCommitHandler.interface.encodeFunctionData("commitToBuyerOffer", [
      targetOfferId,
      sellerParams,
    ]);

    const metatxNonce = parseInt(randomBytes(8));
    const metatxMessage = {
      nonce: metatxNonce,
      from: await sellerSigner.getAddress(),
      contractAddress: await metaTransactionsHandler.getAddress(),
      functionName,
      functionSignature: fnSig,
    };
    const signature = await prepareDataSignature(
      sellerSigner,
      META_TRANSACTION_TYPES,
      "MetaTransaction",
      metatxMessage,
      await metaTransactionsHandler.getAddress()
    );

    let entry = "0x";
    if (!forceFallback && amount && BigInt(amount) > 0n) {
      entry = await entryBuilder(sellerSigner, amount);
    }

    return metaTransactionsHandler
      .connect(caller)
      .executeMetaTransactionWithTokenTransferAuthorization(
        await sellerSigner.getAddress(),
        functionName,
        fnSig,
        metatxNonce,
        signature,
        [entry]
      );
  }

  // -----------------------------------------------------------------------
  //  Shared test factory
  // -----------------------------------------------------------------------

  /**
   * Registers the full `commitToOffer() with authorization - Seller Commits`
   * test set under a strategy-specific context. Each strategy provides its
   * own token (used as the offer's `exchangeToken`), entry builder, and an
   * optional `oneTimeSetup` callback (e.g. Permit2 needs the seller(s) to
   * `approve(PERMIT2, MaxUint256)` on the token before the metatx can pull).
   */
  function defineSellerCommitsTests({ strategyName, getToken, entryBuilder, oneTimeSetup }) {
    context(`👉 commitToOffer() with authorization - Seller Commits (${strategyName})`, async function () {
      let token, builder, price, sellerDeposit;

      beforeEach(async function () {
        token = getToken();
        builder = entryBuilder(token);

        if (oneTimeSetup) {
          await oneTimeSetup({ token, sellers: [assistant, assistant2] });
        }

        // Point the offer at this strategy's token, then create it.
        buyerCreatedOffer.exchangeToken = await token.getAddress();
        await offerHandler
          .connect(buyer1)
          .createOffer(
            buyerCreatedOffer,
            offerDates,
            offerDurations,
            { disputeResolverId: disputeResolver.id, mutualizerAddress: ZeroAddress },
            agentId,
            offerFeeLimit
          );

        price = buyerCreatedOffer.price;
        sellerDeposit = buyerCreatedOffer.sellerDeposit;

        // Buyer pre-deposits payment via the standard approve+depositFunds flow.
        // (This context exercises the seller-side commit only.)
        await token.connect(buyer1).approve(protocolDiamondAddress, price);
        await fundsHandler.connect(buyer1).depositFunds(buyerId, await token.getAddress(), price);
      });

      it("should emit SellerCommitted, FundsDeposited, and FundsEncumbered events when seller commits to buyer offer", async function () {
        const expectedExchangeId = "1";

        const sellerParams = {
          collectionIndex: 0,
          royaltyInfo: { recipients: [ZeroAddress], bps: [0] },
          mutualizerAddress: ZeroAddress,
        };

        const tx = await commitToBuyerOfferWithAuth({
          sellerSigner: assistant,
          targetOfferId: nextOfferId,
          sellerParams,
          amount: sellerDeposit,
          entryBuilder: builder,
        });

        const receipt = await tx.wait();
        const event = getEvent(receipt, exchangeCommitHandler, "SellerCommitted");

        expect(event[0]).to.equal(BigInt(nextOfferId));
        expect(event[1]).to.equal(BigInt(sellerId));
        expect(event[2]).to.equal(BigInt(expectedExchangeId));
        expect(event[5]).to.equal(await assistant.getAddress());

        const exchange = event[3];
        expect(exchange[0]).to.equal(BigInt(expectedExchangeId));
        expect(exchange[1]).to.equal(BigInt(nextOfferId));
        expect(exchange[2]).to.equal(buyerId);
        expect(exchange[3]).to.equal(0n);

        const voucher = event[4];
        expect(voucher[0]).to.be.gt(0);
        expect(voucher[1]).to.be.gt(0);

        await expect(tx)
          .to.emit(fundsHandler, "FundsDeposited")
          .withArgs(sellerId, assistant.address, buyerCreatedOffer.exchangeToken, buyerCreatedOffer.sellerDeposit);
        await expect(tx)
          .to.emit(fundsHandler, "FundsEncumbered")
          .withArgs(sellerId, buyerCreatedOffer.exchangeToken, buyerCreatedOffer.sellerDeposit, assistant.address);
      });

      it("should update state correctly when seller commits to buyer offer", async function () {
        const expectedExchangeId = "1";

        const externalId = "Brand1";
        voucherInitValues.collectionSalt = encodeBytes32String(externalId);
        await accountHandler.connect(assistant).createNewCollection(externalId, voucherInitValues);

        const sellerParams = {
          collectionIndex: 1,
          royaltyInfo: { recipients: [ZeroAddress], bps: [0] },
          mutualizerAddress: ZeroAddress,
        };

        await commitToBuyerOfferWithAuth({
          sellerSigner: assistant,
          targetOfferId: nextOfferId,
          sellerParams,
          amount: sellerDeposit,
          entryBuilder: builder,
        });

        const [existsExchange, exchange] = await exchangeHandler.getExchange(expectedExchangeId);
        expect(existsExchange).to.be.true;
        expect(exchange.buyerId).to.equal(buyerId);

        const [existsOffer, updatedOffer] = await offerHandler.getOffer(nextOfferId);
        expect(existsOffer).to.be.true;
        expect(updatedOffer.sellerId).to.equal(sellerId);
        expect(updatedOffer.collectionIndex).to.equal(1);
      });

      it("should mint voucher to buyer when seller commits", async function () {
        const expectedExchangeId = "1";

        const sellerParams = {
          collectionIndex: 0,
          royaltyInfo: { recipients: [ZeroAddress], bps: [0] },
          mutualizerAddress: ZeroAddress,
        };

        await commitToBuyerOfferWithAuth({
          sellerSigner: assistant,
          targetOfferId: nextOfferId,
          sellerParams,
          amount: sellerDeposit,
          entryBuilder: builder,
        });

        const [existsOffer, updatedOffer] = await offerHandler.getOffer(nextOfferId);
        expect(existsOffer).to.be.true;
        expect(updatedOffer.sellerId).to.equal(sellerId);

        const voucherTokenId = deriveTokenId(nextOfferId, expectedExchangeId);
        const voucherCloneAddress = calculateCloneAddress(
          await accountHandler.getAddress(),
          await calculateBosonProxyAddress(await accountHandler.getAddress()),
          seller.assistant
        );
        const voucherContract = await getContractAt("IBosonVoucher", voucherCloneAddress);
        const voucherOwner = await voucherContract.ownerOf(voucherTokenId);
        expect(voucherOwner).to.equal(await buyer1.getAddress());
      });

      it("should handle multiple sellers committing to different buyer offers", async function () {
        const buyerCreatedOffer2 = buyerCreatedOffer.clone();
        buyerCreatedOffer2.buyerId = buyerId2;

        await offerHandler
          .connect(buyer2)
          .createOffer(
            buyerCreatedOffer2,
            offerDates,
            offerDurations,
            { disputeResolverId: disputeResolver.id, mutualizerAddress: ZeroAddress },
            agentId,
            offerFeeLimit
          );

        // 2nd buyer pre-deposits via standard path
        await token.connect(buyer2).approve(protocolDiamondAddress, price);
        await fundsHandler.connect(buyer2).depositFunds(buyerId2, await token.getAddress(), price);

        const sellerParams = {
          collectionIndex: 0,
          royaltyInfo: { recipients: [ZeroAddress], bps: [0] },
          mutualizerAddress: ZeroAddress,
        };

        await expect(
          commitToBuyerOfferWithAuth({
            sellerSigner: assistant,
            targetOfferId: "1",
            sellerParams,
            amount: sellerDeposit,
            entryBuilder: builder,
          })
        ).to.emit(exchangeCommitHandler, "SellerCommitted");

        await expect(
          commitToBuyerOfferWithAuth({
            sellerSigner: assistant2,
            targetOfferId: "2",
            sellerParams,
            amount: sellerDeposit,
            entryBuilder: builder,
          })
        ).to.emit(exchangeCommitHandler, "SellerCommitted");

        const [, exchange1] = await exchangeHandler.getExchange("1");
        const [, exchange2] = await exchangeHandler.getExchange("2");

        expect(exchange1.buyerId).to.equal(buyerId);
        expect(exchange2.buyerId).to.equal(buyerId2);

        const [, offer1] = await offerHandler.getOffer("1");
        const [, offer2] = await offerHandler.getOffer("2");
        expect(offer1.sellerId).to.equal(sellerId);
        expect(offer2.sellerId).to.equal(sellerId2);
      });

      context("💔 Revert Reasons", async function () {
        it("should revert if seller has insufficient deposit funds", async function () {
          // Auth is signed for less than the offer's sellerDeposit. The
          // strategy-specific call constructs its own message with the offer's
          // sellerDeposit as the value, so the on-chain hash differs from the
          // signed hash → token-side recovery returns the wrong signer →
          // revert. (For Permit2 specifically, the recovered owner won't
          // match `from` because `permitted.amount` differs.)
          const insufficientDeposit = parseUnits("0.1", "ether");

          const sellerParams = {
            collectionIndex: 0,
            royaltyInfo: { recipients: [ZeroAddress], bps: [0] },
            mutualizerAddress: ZeroAddress,
          };

          await expect(
            commitToBuyerOfferWithAuth({
              sellerSigner: assistant,
              targetOfferId: nextOfferId,
              sellerParams,
              amount: insufficientDeposit,
              entryBuilder: builder,
            })
          ).to.be.reverted;
        });

        it("should revert if buyer has insufficient payment funds", async function () {
          // 2nd buyer creates an offer but does NOT pre-deposit; commit tries to
          // encumber from buyer's available funds → InsufficientAvailableFunds.
          const buyerCreatedOffer2 = buyerCreatedOffer.clone();
          buyerCreatedOffer2.buyerId = buyerId2;

          await offerHandler
            .connect(buyer2)
            .createOffer(
              buyerCreatedOffer2,
              offerDates,
              offerDurations,
              { disputeResolverId: disputeResolver.id, mutualizerAddress: ZeroAddress },
              agentId,
              offerFeeLimit
            );

          const sellerParams = {
            collectionIndex: 0,
            royaltyInfo: { recipients: [ZeroAddress], bps: [0] },
            mutualizerAddress: ZeroAddress,
          };

          await expect(
            commitToBuyerOfferWithAuth({
              sellerSigner: assistant,
              targetOfferId: "2",
              sellerParams,
              amount: sellerDeposit,
              entryBuilder: builder,
            })
          ).to.be.revertedWithCustomError(exchangeCommitHandler, "InsufficientAvailableFunds");
        });

        it("should revert if non-seller tries to commit to buyer offer", async function () {
          const sellerParams = {
            collectionIndex: 0,
            royaltyInfo: { recipients: [ZeroAddress], bps: [0] },
            mutualizerAddress: ZeroAddress,
          };

          await expect(
            commitToBuyerOfferWithAuth({
              sellerSigner: rando,
              targetOfferId: nextOfferId,
              sellerParams,
              amount: sellerDeposit,
              entryBuilder: builder,
            })
          ).to.be.revertedWithCustomError(exchangeCommitHandler, "NotAssistant");
        });

        it("should revert if collection index exceeds seller's additional collections", async function () {
          const sellerParams = {
            collectionIndex: 1,
            royaltyInfo: { recipients: [ZeroAddress], bps: [0] },
            mutualizerAddress: ZeroAddress,
          };

          await expect(
            commitToBuyerOfferWithAuth({
              sellerSigner: assistant,
              targetOfferId: nextOfferId,
              sellerParams,
              amount: sellerDeposit,
              entryBuilder: builder,
            })
          ).to.be.revertedWithCustomError(exchangeCommitHandler, "NoSuchCollection");
        });

        it("should revert if mutualizer is EOA", async function () {
          const sellerParams = {
            collectionIndex: 0,
            royaltyInfo: { recipients: [ZeroAddress], bps: [0] },
            mutualizerAddress: assistant.address,
          };

          await expect(
            commitToBuyerOfferWithAuth({
              sellerSigner: assistant,
              targetOfferId: nextOfferId,
              sellerParams,
              amount: sellerDeposit,
              entryBuilder: builder,
            })
          ).to.be.revertedWithCustomError(exchangeCommitHandler, RevertReasons.UNSUPPORTED_MUTUALIZER);
        });

        it("should revert if mutualizer does not support IDRFeeMutualizer interface", async function () {
          const sellerParams = {
            collectionIndex: 0,
            royaltyInfo: { recipients: [ZeroAddress], bps: [0] },
            mutualizerAddress: await token.getAddress(),
          };

          await expect(
            commitToBuyerOfferWithAuth({
              sellerSigner: assistant,
              targetOfferId: nextOfferId,
              sellerParams,
              amount: sellerDeposit,
              entryBuilder: builder,
            })
          ).to.be.revertedWithCustomError(exchangeCommitHandler, RevertReasons.UNSUPPORTED_MUTUALIZER);
        });
      });
    });
  }

  // -----------------------------------------------------------------------

  context("🤝 Seller Commitment to Buyer Offers", async function () {
    // ERC-3009: token natively supports `receiveWithAuthorization`, no
    // pre-approval needed.
    defineSellerCommitsTests({
      strategyName: "ERC-3009",
      getToken: () => mockToken,
      entryBuilder: makeERC3009Builder,
    });

    // EIP-2612: token natively supports `permit`, no pre-approval needed.
    defineSellerCommitsTests({
      strategyName: "EIP-2612",
      getToken: () => mockToken2612,
      entryBuilder: makeEIP2612Builder,
    });

    // Permit2: any ERC-20 works, but each potential signer must one-time
    // `approve(PERMIT2, MaxUint256)` on the token. Reuse the ERC-3009 mock
    // here since it's a standard ERC-20 underneath.
    defineSellerCommitsTests({
      strategyName: "Permit2",
      getToken: () => mockToken,
      entryBuilder: makePermit2Builder,
      oneTimeSetup: async ({ token, sellers }) => {
        for (const s of sellers) {
          await token.connect(s).approve(PERMIT2_ADDRESS, MaxUint256);
        }
      },
    });
  });
});
