const { ethers, network } = require("hardhat");
const { ZeroAddress, getContractFactory, getSigners, randomBytes, AbiCoder, MaxUint256, Signature } = ethers;
const { expect } = require("chai");

const { mockSeller, mockVoucherInitValues, mockAuthToken, mockDisputeResolver, accountId } = require("../util/mock");
const { DisputeResolverFee } = require("../../scripts/domain/DisputeResolverFee");
const { prepareDataSignature, setupTestEnvironment, getSnapshot, revertToSnapshot } = require("../util/utils.js");

// Mirrors `BosonTypes.AuthorizationStrategy`
const AuthorizationStrategy = {
  None: 0,
  ERC3009: 1,
  EIP2612: 2,
  Permit2: 3,
};

// Canonical Permit2 address (must match `TransientAuthLib.PERMIT2`)
const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

const META_TRANSACTION_TYPES = {
  MetaTransaction: [
    { name: "nonce", type: "uint256" },
    { name: "from", type: "address" },
    { name: "contractAddress", type: "address" },
    { name: "functionName", type: "string" },
    { name: "functionSignature", type: "bytes" },
  ],
};

// EIP-2612 typed data
const PERMIT_TYPES = {
  Permit: [
    { name: "owner", type: "address" },
    { name: "spender", type: "address" },
    { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
};

// Permit2 typed data (matches MockPermit2 / Uniswap's Permit2)
const PERMIT2_TYPES = {
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

function encodeAuthQueue(entries) {
  return AbiCoder.defaultAbiCoder().encode(["bytes[]"], [entries]);
}

function wrapEntry(strategy, data) {
  return AbiCoder.defaultAbiCoder().encode(["uint8", "bytes"], [strategy, data]);
}

describe("Permit-strategy authorization queues (EIP-2612 + Permit2)", function () {
  let deployer, assistant, adminDR, treasuryDR, rando;
  let accountHandler, fundsHandler, metaTransactionsHandler;
  let protocolDiamondAddress;
  let snapshotId;
  let seller;

  before(async function () {
    accountId.next(true);

    const contracts = {
      accountHandler: "IBosonAccountHandler",
      fundsHandler: "IBosonFundsHandler",
      metaTransactionsHandler: "IBosonMetaTransactionsHandler",
    };

    ({
      signers: [, , rando, assistant, , adminDR, treasuryDR],
      contractInstances: { accountHandler, fundsHandler, metaTransactionsHandler },
      diamondAddress: protocolDiamondAddress,
    } = await setupTestEnvironment(contracts));

    [deployer] = await getSigners();

    snapshotId = await getSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
    snapshotId = await getSnapshot();
  });

  async function buildDepositMetaTx(signer, token, amount, nonce) {
    const fnSig = fundsHandler.interface.encodeFunctionData("depositFunds", [
      seller.id,
      await token.getAddress(),
      amount,
    ]);
    const message = {
      nonce: parseInt(nonce),
      from: await signer.getAddress(),
      contractAddress: await metaTransactionsHandler.getAddress(),
      functionName: "depositFunds(uint256,address,uint256)",
      functionSignature: fnSig,
    };
    const signature = await prepareDataSignature(
      signer,
      META_TRANSACTION_TYPES,
      "MetaTransaction",
      message,
      await metaTransactionsHandler.getAddress()
    );
    return { fnSig, message, signature };
  }

  async function setupSellerAndDR(token) {
    // Reset JS account-id counter so it stays in sync with the on-chain
    // protocol counter (which gets rolled back to fresh by each snapshot
    // revert).
    accountId.next(true);

    seller = mockSeller(
      await assistant.getAddress(),
      await assistant.getAddress(),
      ZeroAddress,
      await assistant.getAddress()
    );
    await accountHandler.connect(assistant).createSeller(seller, mockAuthToken(), mockVoucherInitValues());

    const dr = mockDisputeResolver(
      await adminDR.getAddress(),
      await adminDR.getAddress(),
      ZeroAddress,
      await treasuryDR.getAddress(),
      true
    );
    const drFees = [
      new DisputeResolverFee(ZeroAddress, "Native", "0"),
      new DisputeResolverFee(await token.getAddress(), "Token", "0"),
    ];
    await accountHandler.connect(adminDR).createDisputeResolver(dr, drFees, []);
  }

  // ====================================================================
  //  EIP-2612 path
  // ====================================================================
  context("👉 AuthorizationStrategy.EIP2612", async function () {
    let token;

    beforeEach(async function () {
      const Mock = await getContractFactory("MockERC2612Token");
      token = await Mock.deploy("DAI Test", "DAI");
      await token.waitForDeployment();
      await setupSellerAndDR(token);
    });

    async function buildEIP2612Entry(signer, amount, deadline) {
      const { chainId } = await ethers.provider.getNetwork();
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
        deadline,
      };
      const sig = await signer.signTypedData(domain, PERMIT_TYPES, message);
      const split = Signature.from(sig);
      const data = AbiCoder.defaultAbiCoder().encode(
        ["uint256", "uint8", "bytes32", "bytes32"],
        [deadline, split.v, split.r, split.s]
      );
      return wrapEntry(AuthorizationStrategy.EIP2612, data);
    }

    it("pulls funds via permit + transferFrom when queue carries an EIP-2612 entry", async function () {
      const amount = "1000";
      await token.mint(await assistant.getAddress(), amount);
      // Note: NO approve() — the EIP-2612 strategy provisions allowance via permit.

      const nonce = parseInt(randomBytes(8));
      const { fnSig, message, signature } = await buildDepositMetaTx(assistant, token, amount, nonce);
      const entry = await buildEIP2612Entry(assistant, amount, MaxUint256);
      const queue = encodeAuthQueue([entry]);

      await expect(
        metaTransactionsHandler
          .connect(deployer)
          .executeMetaTransactionWithAuthorization(
            await assistant.getAddress(),
            message.functionName,
            fnSig,
            nonce,
            signature,
            queue
          )
      ).to.emit(metaTransactionsHandler, "MetaTransactionExecuted");

      expect(await token.balanceOf(protocolDiamondAddress)).to.equal(amount);
      expect(await token.balanceOf(await assistant.getAddress())).to.equal(0);
      // Permit nonce was advanced
      expect(await token.nonces(await assistant.getAddress())).to.equal(1);
    });

    it("reverts when EIP-2612 signature is from a different signer", async function () {
      const amount = "500";
      await token.mint(await assistant.getAddress(), amount);

      const nonce = parseInt(randomBytes(8));
      const { fnSig, message, signature } = await buildDepositMetaTx(assistant, token, amount, nonce);
      // Signed by `rando`, but assistant is the metatx caller — permit's
      // recovered owner won't match.
      const entry = await buildEIP2612Entry(rando, amount, MaxUint256);
      const queue = encodeAuthQueue([entry]);

      await expect(
        metaTransactionsHandler
          .connect(deployer)
          .executeMetaTransactionWithAuthorization(
            await assistant.getAddress(),
            message.functionName,
            fnSig,
            nonce,
            signature,
            queue
          )
      ).to.be.reverted;
    });

    it("reverts when EIP-2612 deadline has expired", async function () {
      const amount = "500";
      await token.mint(await assistant.getAddress(), amount);

      const nonce = parseInt(randomBytes(8));
      const { fnSig, message, signature } = await buildDepositMetaTx(assistant, token, amount, nonce);
      const expiredDeadline = "1"; // long past
      const entry = await buildEIP2612Entry(assistant, amount, expiredDeadline);
      const queue = encodeAuthQueue([entry]);

      await expect(
        metaTransactionsHandler
          .connect(deployer)
          .executeMetaTransactionWithAuthorization(
            await assistant.getAddress(),
            message.functionName,
            fnSig,
            nonce,
            signature,
            queue
          )
      ).to.be.reverted;
    });

    it("tolerates a benign frontrun that already consumed the same permit", async function () {
      // Setup: build the same auth entry the relayer would, but submit the
      // user's own permit signature directly to the token first. This
      // mirrors a frontrunner who replays our permit before our metatx
      // lands. After the frontrun: allowance == amount, nonce advanced.
      // Our metatx should observe allowance == _amount, skip the redundant
      // permit, and pull funds via the allowance the frontrunner left.
      const amount = "1000";
      await token.mint(await assistant.getAddress(), amount);

      const deadline = MaxUint256;
      const ownerNonce = await token.nonces(await assistant.getAddress());
      const { chainId } = await ethers.provider.getNetwork();
      const domain = {
        name: await token.name(),
        version: "1",
        chainId,
        verifyingContract: await token.getAddress(),
      };
      const permitMessage = {
        owner: await assistant.getAddress(),
        spender: protocolDiamondAddress,
        value: amount,
        nonce: ownerNonce,
        deadline,
      };
      const sig = await assistant.signTypedData(domain, PERMIT_TYPES, permitMessage);
      const split = Signature.from(sig);

      // Frontrun: someone (here `rando`) replays the permit on-chain.
      await token
        .connect(rando)
        .permit(await assistant.getAddress(), protocolDiamondAddress, amount, deadline, split.v, split.r, split.s);
      expect(await token.allowance(await assistant.getAddress(), protocolDiamondAddress)).to.equal(amount);
      expect(await token.nonces(await assistant.getAddress())).to.equal(BigInt(ownerNonce) + 1n);

      // Build the queue entry pointing at the *same* (now-spent) signature.
      const data = AbiCoder.defaultAbiCoder().encode(
        ["uint256", "uint8", "bytes32", "bytes32"],
        [deadline, split.v, split.r, split.s]
      );
      const entry = wrapEntry(AuthorizationStrategy.EIP2612, data);
      const queue = encodeAuthQueue([entry]);

      const metatxNonce = parseInt(randomBytes(8));
      const { fnSig, message, signature } = await buildDepositMetaTx(assistant, token, amount, metatxNonce);

      // Metatx still succeeds: the allowance gate skips the redundant
      // permit() call, then safeTransferFrom uses the existing allowance.
      await metaTransactionsHandler
        .connect(deployer)
        .executeMetaTransactionWithAuthorization(
          await assistant.getAddress(),
          message.functionName,
          fnSig,
          metatxNonce,
          signature,
          queue
        );

      expect(await token.balanceOf(protocolDiamondAddress)).to.equal(amount);
      expect(await token.balanceOf(await assistant.getAddress())).to.equal(0);
    });

    it("rejects a cross-permit allowance-diversion attack", async function () {
      // Attack scenario: the user has signed two distinct permits.
      // The smaller-value permit is bound to a queue entry inside a
      // commitToOffer-style metatx. An attacker pre-submits the *larger*
      // permit to the token directly, which advances the nonce and leaves
      // the protocol with an allowance LARGER than the metatx's _amount.
      // Without the allowance gate, our metatx would silently divert the
      // user's larger permit to fund the smaller commit. With the gate,
      // the metatx must revert.
      const smallAmount = "100";
      const bigAmount = "1000";
      await token.mint(await assistant.getAddress(), bigAmount);

      const deadline = MaxUint256;
      const { chainId } = await ethers.provider.getNetwork();
      const domain = {
        name: await token.name(),
        version: "1",
        chainId,
        verifyingContract: await token.getAddress(),
      };

      // First permit: signed for nonce 0 (smallAmount). Will be embedded in
      // the metatx queue.
      const smallNonce = await token.nonces(await assistant.getAddress());
      const smallSig = await assistant.signTypedData(domain, PERMIT_TYPES, {
        owner: await assistant.getAddress(),
        spender: protocolDiamondAddress,
        value: smallAmount,
        nonce: smallNonce,
        deadline,
      });
      const smallSplit = Signature.from(smallSig);

      // Second permit: signed for nonce 1 (bigAmount). User signs it
      // assuming the first permit will be consumed first.
      const bigSig = await assistant.signTypedData(domain, PERMIT_TYPES, {
        owner: await assistant.getAddress(),
        spender: protocolDiamondAddress,
        value: bigAmount,
        nonce: BigInt(smallNonce) + 1n,
        deadline,
      });
      const bigSplit = Signature.from(bigSig);

      // Attacker frontruns: submits BOTH permits directly to the token.
      // First the small one (consumes nonce 0, sets allowance to 100),
      // then the big one (consumes nonce 1, overwrites allowance to 1000).
      await token
        .connect(rando)
        .permit(
          await assistant.getAddress(),
          protocolDiamondAddress,
          smallAmount,
          deadline,
          smallSplit.v,
          smallSplit.r,
          smallSplit.s
        );
      await token
        .connect(rando)
        .permit(
          await assistant.getAddress(),
          protocolDiamondAddress,
          bigAmount,
          deadline,
          bigSplit.v,
          bigSplit.r,
          bigSplit.s
        );
      expect(await token.allowance(await assistant.getAddress(), protocolDiamondAddress)).to.equal(bigAmount);

      // Now the attacker tries to submit the small-permit metatx.
      // The queue entry carries `smallSig`, but allowance == bigAmount
      // (not smallAmount), so the protocol routes to permit(), which
      // reverts (nonce 0 was already consumed by the frontrun). The
      // whole metatx must revert — no transfer, no commit, no theft.
      const data = AbiCoder.defaultAbiCoder().encode(
        ["uint256", "uint8", "bytes32", "bytes32"],
        [deadline, smallSplit.v, smallSplit.r, smallSplit.s]
      );
      const entry = wrapEntry(AuthorizationStrategy.EIP2612, data);
      const queue = encodeAuthQueue([entry]);

      const metatxNonce = parseInt(randomBytes(8));
      const { fnSig, message, signature } = await buildDepositMetaTx(assistant, token, smallAmount, metatxNonce);

      const protocolBalanceBefore = await token.balanceOf(protocolDiamondAddress);
      await expect(
        metaTransactionsHandler
          .connect(deployer)
          .executeMetaTransactionWithAuthorization(
            await assistant.getAddress(),
            message.functionName,
            fnSig,
            metatxNonce,
            signature,
            queue
          )
      ).to.be.reverted;

      // Allowance is untouched, no funds moved on the protocol side.
      expect(await token.allowance(await assistant.getAddress(), protocolDiamondAddress)).to.equal(bigAmount);
      expect(await token.balanceOf(protocolDiamondAddress)).to.equal(protocolBalanceBefore);
    });
  });

  // ====================================================================
  //  Permit2 path
  // ====================================================================
  context("👉 AuthorizationStrategy.Permit2", async function () {
    let token;

    before(async function () {
      // Inject MockPermit2 bytecode at the canonical Permit2 address.
      const Mock = await getContractFactory("MockPermit2");
      const deployedMock = await Mock.deploy();
      await deployedMock.waitForDeployment();

      const code = await ethers.provider.getCode(await deployedMock.getAddress());
      await network.provider.send("hardhat_setCode", [PERMIT2_ADDRESS, code]);

      // Refresh snapshot to include the injected code.
      snapshotId = await getSnapshot();
    });

    beforeEach(async function () {
      // Use the existing MockERC3009Token as a vanilla ERC-20 (its ERC-3009
      // surface is irrelevant to Permit2 — Permit2 only uses transferFrom).
      const Token = await getContractFactory("MockERC3009Token");
      token = await Token.deploy("Generic", "GEN");
      await token.waitForDeployment();
      await setupSellerAndDR(token);

      // Permit2 requires a one-time on-chain approval per token.
      await token.connect(assistant).approve(PERMIT2_ADDRESS, MaxUint256);
    });

    async function buildPermit2Entry(signer, amount, permitNonce, deadline) {
      const { chainId } = await ethers.provider.getNetwork();
      const domain = {
        name: "Permit2",
        chainId,
        verifyingContract: PERMIT2_ADDRESS,
      };
      const message = {
        permitted: {
          token: await token.getAddress(),
          amount,
        },
        spender: protocolDiamondAddress,
        nonce: permitNonce,
        deadline,
      };
      const sig = await signer.signTypedData(domain, PERMIT2_TYPES, message);
      const data = AbiCoder.defaultAbiCoder().encode(["uint256", "uint256", "bytes"], [permitNonce, deadline, sig]);
      return wrapEntry(AuthorizationStrategy.Permit2, data);
    }

    it("pulls funds via Permit2.permitTransferFrom when queue carries a Permit2 entry", async function () {
      const amount = "1000";
      await token.mint(await assistant.getAddress(), amount);

      const metatxNonce = parseInt(randomBytes(8));
      const { fnSig, message, signature } = await buildDepositMetaTx(assistant, token, amount, metatxNonce);
      const permit2Nonce = "0";
      const entry = await buildPermit2Entry(assistant, amount, permit2Nonce, MaxUint256);
      const queue = encodeAuthQueue([entry]);

      await expect(
        metaTransactionsHandler
          .connect(deployer)
          .executeMetaTransactionWithAuthorization(
            await assistant.getAddress(),
            message.functionName,
            fnSig,
            metatxNonce,
            signature,
            queue
          )
      ).to.emit(metaTransactionsHandler, "MetaTransactionExecuted");

      expect(await token.balanceOf(protocolDiamondAddress)).to.equal(amount);
      expect(await token.balanceOf(await assistant.getAddress())).to.equal(0);
    });

    it("reverts when Permit2 nonce has already been used", async function () {
      const amount = "500";
      await token.mint(await assistant.getAddress(), Number(amount) * 2);

      const permit2Nonce = "42";

      // First spend consumes the nonce.
      let metatxNonce = parseInt(randomBytes(8));
      let metatx = await buildDepositMetaTx(assistant, token, amount, metatxNonce);
      let entry = await buildPermit2Entry(assistant, amount, permit2Nonce, MaxUint256);
      await metaTransactionsHandler
        .connect(deployer)
        .executeMetaTransactionWithAuthorization(
          await assistant.getAddress(),
          metatx.message.functionName,
          metatx.fnSig,
          metatxNonce,
          metatx.signature,
          encodeAuthQueue([entry])
        );

      // Replay attempt (different metatx nonce, same Permit2 nonce).
      metatxNonce = parseInt(randomBytes(8));
      metatx = await buildDepositMetaTx(assistant, token, amount, metatxNonce);
      entry = await buildPermit2Entry(assistant, amount, permit2Nonce, MaxUint256);
      await expect(
        metaTransactionsHandler
          .connect(deployer)
          .executeMetaTransactionWithAuthorization(
            await assistant.getAddress(),
            metatx.message.functionName,
            metatx.fnSig,
            metatxNonce,
            metatx.signature,
            encodeAuthQueue([entry])
          )
      ).to.be.reverted;
    });

    it("reverts when Permit2 signature is from a different signer", async function () {
      const amount = "500";
      await token.mint(await assistant.getAddress(), amount);

      const metatxNonce = parseInt(randomBytes(8));
      const { fnSig, message, signature } = await buildDepositMetaTx(assistant, token, amount, metatxNonce);
      const permit2Nonce = "0";
      // Signed by rando, but the metatx caller is assistant — Permit2 signer
      // recovery won't match.
      const entry = await buildPermit2Entry(rando, amount, permit2Nonce, MaxUint256);
      const queue = encodeAuthQueue([entry]);

      await expect(
        metaTransactionsHandler
          .connect(deployer)
          .executeMetaTransactionWithAuthorization(
            await assistant.getAddress(),
            message.functionName,
            fnSig,
            metatxNonce,
            signature,
            queue
          )
      ).to.be.reverted;
    });
  });
});
