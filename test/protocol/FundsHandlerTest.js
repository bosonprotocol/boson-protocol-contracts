const hre = require("hardhat");
const ethers = hre.ethers;
const { expect } = require("chai");
const { gasLimit } = require("../../environments");

const Role = require("../../scripts/domain/Role");
const Seller = require("../../scripts/domain/Seller");
const { Funds, FundsList } = require("../../scripts/domain/Funds");
const Offer = require("../../scripts/domain/Offer");

const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const { deployProtocolHandlerFacets } = require("../../scripts/util/deploy-protocol-handler-facets.js");
const { deployProtocolConfigFacet } = require("../../scripts/util/deploy-protocol-config-facet.js");
const { deployProtocolClients } = require("../../scripts/util/deploy-protocol-clients");
const { deployMockTokens } = require("../../scripts/util/deploy-mock-tokens");

/**
 *  Test the Boson Funds Handler interface
 */
describe("IBosonFundsHandler", function () {
  // Common vars
  let InterfaceIds;
  let accounts, deployer, rando, operator, admin, clerk, treasury;
  let erc165,
    protocolDiamond,
    accessController,
    accountHandler,
    fundsHandler,
    exchangeHandler,
    offerHandler,
    bosonVoucher;
  let support, oneMonth, oneWeek;
  let seller, active;
  let id, buyer, offerToken, offerNative, offerId, sellerId;
  let mockToken, bosonToken;
  let depositAmount;
  let price,
    sellerDeposit,
    buyerCancelPenalty,
    quantityAvailable,
    validFromDate,
    validUntilDate,
    redeemableFromDate,
    fulfillmentPeriodDuration,
    voucherValidDuration,
    exchangeToken,
    metadataUri,
    metadataHash,
    voided;
  let block, blockNumber;

  before(async function () {
    // get interface Ids
    InterfaceIds = await getInterfaceIds();
  });

  beforeEach(async function () {
    // Make accounts available
    accounts = await ethers.getSigners();
    deployer = accounts[0];
    operator = accounts[1];
    admin = accounts[2];
    clerk = accounts[3];
    treasury = accounts[4];
    rando = accounts[5];
    buyer = accounts[6];

    // Deploy the Protocol Diamond
    [protocolDiamond, , , accessController] = await deployProtocolDiamond();

    // Temporarily grant UPGRADER role to deployer account
    await accessController.grantRole(Role.UPGRADER, deployer.address);

    // Grant PROTOCOL role to ProtocolDiamond address and renounces admin
    await accessController.grantRole(Role.PROTOCOL, protocolDiamond.address);

    // Cut the protocol handler facets into the Diamond
    await deployProtocolHandlerFacets(protocolDiamond, [
      "AccountHandlerFacet",
      "FundsHandlerFacet",
      "ExchangeHandlerFacet",
      "OfferHandlerFacet",
    ]);

    // Deploy the Protocol client implementation/proxy pairs (currently just the Boson Voucher)
    const protocolClientArgs = [accessController.address, protocolDiamond.address];
    [, , [bosonVoucher]] = await deployProtocolClients(protocolClientArgs, gasLimit);

    // Add config Handler, so offer id starts at 1
    const protocolConfig = [
      "0x0000000000000000000000000000000000000000",
      "0x0000000000000000000000000000000000000000",
      bosonVoucher.address,
      "0",
      "100",
      "100",
      "100",
      "100",
    ];
    await deployProtocolConfigFacet(protocolDiamond, protocolConfig, gasLimit);

    // Cast Diamond to IERC165
    erc165 = await ethers.getContractAt("IERC165", protocolDiamond.address);

    // Cast Diamond to IBosonAccountHandler
    accountHandler = await ethers.getContractAt("IBosonAccountHandler", protocolDiamond.address);

    // Cast Diamond to IBosonFundsHandler
    fundsHandler = await ethers.getContractAt("IBosonFundsHandler", protocolDiamond.address);

    // Cast Diamond to IBosonOfferHandler
    offerHandler = await ethers.getContractAt("IBosonOfferHandler", protocolDiamond.address);

    // Cast Diamond to IBosonExchangeHandler
    exchangeHandler = await ethers.getContractAt("IBosonExchangeHandler", protocolDiamond.address);

    // Deploy the mock token
    [mockToken] = await deployMockTokens(gasLimit, ["Foreign20"]);
  });

  // Interface support (ERC-156 provided by ProtocolDiamond, others by deployed facets)
  context("📋 Interfaces", async function () {
    context("👉 supportsInterface()", async function () {
      it("should indicate support for IBosonFundsHandler interface", async function () {
        // Current interfaceId for IBosonFundsHandler
        support = await erc165.supportsInterface(InterfaceIds.IBosonFundsHandler);

        // Test
        await expect(support, "IBosonFundsHandler interface not supported").is.true;
      });
    });
  });

  // All supported methods - single offer
  context("📋 Funds Handler Methods", async function () {
    beforeEach(async function () {
      // create a seller
      // Required constructor params
      id = "1"; // argument sent to contract for createSeller will be ignored

      active = true;

      // Create a valid seller, then set fields in tests directly
      seller = new Seller(id, operator.address, admin.address, clerk.address, treasury.address, active);
      expect(seller.isValid()).is.true;

      await accountHandler.connect(admin).createSeller(seller);

      // top up operators account
      await mockToken.mint(operator.address, "1000000");

      // approve protocol to transfer the tokens
      await mockToken.connect(operator).approve(protocolDiamond.address, "1000000");

      // set the deposit amount
      depositAmount = "100";
    });

    context("👉 depositFunds()", async function () {
      it("should emit a FundsDeposited event", async function () {
        // Deposit funds, testing for the event
        // Deposit token
        await expect(fundsHandler.connect(operator).depositFunds(seller.id, mockToken.address, depositAmount))
          .to.emit(fundsHandler, "FundsDeposited")
          .withArgs(seller.id, operator.address, mockToken.address, depositAmount);

        // Deposit native currency
        await expect(
          fundsHandler
            .connect(rando)
            .depositFunds(seller.id, ethers.constants.AddressZero, depositAmount, { value: depositAmount })
        )
          .to.emit(fundsHandler, "FundsDeposited")
          .withArgs(seller.id, rando.address, ethers.constants.AddressZero, depositAmount);
      });

      it("should update state", async function () {
        // Deposit token
        await fundsHandler.connect(operator).depositFunds(seller.id, mockToken.address, depositAmount);

        // Read on chain state
        let returnedAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));

        // Chain state should match the expected available funds
        let expectedAvailableFunds = new FundsList([new Funds(mockToken.address, "Foreign20", depositAmount)]);
        expect(returnedAvailableFunds).to.eql(expectedAvailableFunds);

        // Deposit native currency to the same seller id
        await fundsHandler
          .connect(rando)
          .depositFunds(seller.id, ethers.constants.AddressZero, depositAmount, { value: depositAmount });

        // Get new on chain state
        returnedAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));

        // Chain state should match the expected available funds
        expectedAvailableFunds.funds.push(new Funds(ethers.constants.AddressZero, "Native currency", depositAmount));
        expect(returnedAvailableFunds).to.eql(expectedAvailableFunds);
      });

      it("should be possible to top up the account", async function () {
        // Deposit token
        await fundsHandler.connect(operator).depositFunds(seller.id, mockToken.address, depositAmount);

        // Read on chain state
        let returnedAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));

        // Chain state should match the expected available funds
        let expectedAvailableFunds = new FundsList([new Funds(mockToken.address, "Foreign20", depositAmount)]);
        expect(returnedAvailableFunds).to.eql(expectedAvailableFunds);

        // Deposit the same token again
        await fundsHandler.connect(operator).depositFunds(seller.id, mockToken.address, 2 * depositAmount);

        // Get new on chain state
        returnedAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));

        // Chain state should match the expected available funds
        expectedAvailableFunds = new FundsList([new Funds(mockToken.address, "Foreign20", `${3 * depositAmount}`)]);
        expect(returnedAvailableFunds).to.eql(expectedAvailableFunds);
      });

      context("💔 Revert Reasons", async function () {
        it("Seller id does not exist", async function () {
          // Attempt to deposit the funds, expecting revert
          seller.id = "555";
          await expect(
            fundsHandler.connect(rando).depositFunds(seller.id, mockToken.address, depositAmount)
          ).to.revertedWith(RevertReasons.NO_SUCH_SELLER);
        });

        it("Native currency deposited, but the token address is not zero", async function () {
          // Attempt to deposit the funds, expecting revert
          await expect(
            fundsHandler
              .connect(rando)
              .depositFunds(seller.id, mockToken.address, depositAmount, { value: depositAmount })
          ).to.revertedWith(RevertReasons.NATIVE_WRONG_ADDRESS);
        });

        it("Native currency deposited, but the amount does not match msg.value", async function () {
          // Attempt to deposit the funds, expecting revert
          await expect(
            fundsHandler
              .connect(rando)
              .depositFunds(seller.id, ethers.constants.AddressZero, depositAmount * 2, { value: depositAmount })
          ).to.revertedWith(RevertReasons.NATIVE_WRONG_AMOUNT);
        });

        it("Token address contract does not support transferFrom", async function () {
          // Deploy a contract without the transferFrom
          [bosonToken] = await deployMockTokens(gasLimit, ["BosonToken"]);

          // Attempt to deposit the funds, expecting revert
          await expect(
            fundsHandler.connect(rando).depositFunds(seller.id, bosonToken.address, depositAmount)
          ).to.revertedWith(RevertReasons.TOKEN_TRANSFER_FAILED);
        });

        it("Token address is not a contract", async function () {
          // Attempt to deposit the funds, expecting revert
          await expect(
            fundsHandler.connect(rando).depositFunds(seller.id, admin.address, depositAmount)
          ).to.revertedWith("");
        });

        it("Token contract revert for another reason", async function () {
          // insufficient funds
          // approve more than account actually have
          await mockToken.connect(rando).approve(protocolDiamond.address, depositAmount);
          // Attempt to deposit the funds, expecting revert
          await expect(
            fundsHandler.connect(rando).depositFunds(seller.id, mockToken.address, depositAmount)
          ).to.revertedWith(RevertReasons.ERC20_EXCEEDS_BALANCE);

          // not approved
          depositAmount = "10000000";
          await expect(
            fundsHandler.connect(operator).depositFunds(seller.id, mockToken.address, depositAmount)
          ).to.revertedWith(RevertReasons.ERC20_INSUFFICIENT_ALLOWANCE);
        });
      });
    });

    context("👉 getAvailableFunds()", async function () {
      it("Returns info also for ERC20 tokens without the name", async function () {
        // Deploy the mock token with no name
        [mockToken] = await deployMockTokens(gasLimit, ["Foreign20NoName"]);
        // top up operators account
        await mockToken.mint(operator.address, "1000000");
        // approve protocol to transfer the tokens
        await mockToken.connect(operator).approve(protocolDiamond.address, "1000000");

        // Deposit token
        await fundsHandler.connect(operator).depositFunds(seller.id, mockToken.address, depositAmount);

        // Read on chain state
        let returnedAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));

        // Chain state should match the expected available funds
        let expectedAvailableFunds = new FundsList([
          new Funds(mockToken.address, "Token name unspecified", depositAmount),
        ]);
        expect(returnedAvailableFunds).to.eql(expectedAvailableFunds);
      });
    });
  });

  // Funds library methods.
  // Cannot be invoked directly, so tests calls the methods that use them
  context("📋 FundsLib  Methods", async function () {
    beforeEach(async function () {
      // Initial ids for all the things
      id = offerId = sellerId = "1";

      // Create an offer to commit to
      oneWeek = 604800 * 1000; //  7 days in milliseconds
      oneMonth = 2678400 * 1000; // 31 days in milliseconds

      // Get the current block info
      blockNumber = await ethers.provider.getBlockNumber();
      block = await ethers.provider.getBlock(blockNumber);

      // Required constructor params
      price = ethers.utils.parseUnits("1.5", "ether").toString();
      sellerDeposit = price = ethers.utils.parseUnits("0.25", "ether").toString();
      buyerCancelPenalty = price = ethers.utils.parseUnits("0.05", "ether").toString();
      quantityAvailable = "2";
      validFromDate = ethers.BigNumber.from(block.timestamp).toString(); // valid from now
      validUntilDate = ethers.BigNumber.from(block.timestamp)
        .add(oneMonth * 6)
        .toString(); // until 6 months
      redeemableFromDate = ethers.BigNumber.from(block.timestamp).add(oneWeek).toString(); // redeemable in 1 week
      fulfillmentPeriodDuration = oneMonth.toString(); // fulfillment period is one month
      voucherValidDuration = oneMonth.toString(); // offers valid for one month
      exchangeToken = mockToken.address; // Zero addy ~ chain base currency
      metadataHash = "QmYXc12ov6F2MZVZwPs5XeCBbf61cW3wKRk8h3D5NTYj4T";
      metadataUri = `https://ipfs.io/ipfs/${metadataHash}`;
      voided = false;

      // Create a valid seller
      seller = new Seller(id, operator.address, admin.address, clerk.address, treasury.address, true);
      expect(seller.isValid()).is.true;
      await accountHandler.connect(admin).createSeller(seller);

      // Create a valid offer entity
      offerToken = new Offer(
        offerId,
        sellerId,
        price,
        sellerDeposit,
        buyerCancelPenalty,
        quantityAvailable,
        validFromDate,
        validUntilDate,
        redeemableFromDate,
        fulfillmentPeriodDuration,
        voucherValidDuration,
        exchangeToken,
        metadataUri,
        metadataHash,
        voided
      );
      expect(offerToken.isValid()).is.true;

      offerNative = offerToken.clone();
      offerNative.id = "2";
      offerNative.exchangeToken = ethers.constants.AddressZero;
      expect(offerNative.isValid()).is.true;

      // Create both offers
      await offerHandler.connect(operator).createOffer(offerToken);
      await offerHandler.connect(operator).createOffer(offerNative);

      // top up seller's and buyer's account
      await mockToken.mint(operator.address, `${2 * sellerDeposit}`);
      await mockToken.mint(buyer.address, `${2 * price}`);

      // approve protocol to transfer the tokens
      await mockToken.connect(operator).approve(protocolDiamond.address, `${2 * sellerDeposit}`);
      await mockToken.connect(buyer).approve(protocolDiamond.address, `${2 * price}`);

      // deposit to seller's pool
      await fundsHandler.connect(operator).depositFunds(seller.id, mockToken.address, `${2 * sellerDeposit}`);
      await fundsHandler
        .connect(operator)
        .depositFunds(seller.id, ethers.constants.AddressZero, `${2 * sellerDeposit}`, {
          value: `${2 * sellerDeposit}`,
        });
    });

    context("👉 encumberFunds()", async function () {
      it("should emit a FundsEncumbered event", async function () {
        let buyerId = "2"; // 1: seller, 2: buyer

        // Commit to an offer with erc20 token, test for FundsEncumbered event
        await expect(exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerToken.id))
          .to.emit(exchangeHandler, "FundsEncumbered")
          .withArgs(buyerId, mockToken.address, price)
          .to.emit(exchangeHandler, "FundsEncumbered")
          .withArgs(sellerId, mockToken.address, sellerDeposit);

        // Commit to an offer with native currency, test for FundsEncumbered event
        await expect(exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerNative.id, { value: price }))
          .to.emit(exchangeHandler, "FundsEncumbered")
          .withArgs(buyerId, ethers.constants.AddressZero, price)
          .to.emit(exchangeHandler, "FundsEncumbered")
          .withArgs(sellerId, ethers.constants.AddressZero, sellerDeposit);
      });

      it("should update state", async function () {
        // contract token value
        const contractTokenBalanceBefore = await mockToken.balanceOf(protocolDiamond.address);
        // contract native token balance
        const contractNativeBalanceBefore = await ethers.provider.getBalance(protocolDiamond.address);
        // seller's available funds
        const sellersAvailableFundsBefore = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));

        // Commit to an offer with tokens
        await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerToken.id);

        // Check that token balance increased
        const contractTokenBalanceAfter = await mockToken.balanceOf(protocolDiamond.address);
        // contract token balance should increase for the incoming price
        // seller's deposit was already held in the contract's pool before
        expect(contractTokenBalanceAfter.sub(contractTokenBalanceBefore).toString()).to.eql(
          price,
          "Token wrong balance increase"
        );

        // Check that seller's pool balance was reduced
        let sellersAvailableFundsAfter = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
        // token is the first on the list of the available funds and the amount should be decreased for the sellerDeposit
        expect(
          ethers.BigNumber.from(sellersAvailableFundsBefore.funds[0].availableAmount)
            .sub(ethers.BigNumber.from(sellersAvailableFundsAfter.funds[0].availableAmount))
            .toString()
        ).to.eql(sellerDeposit, "Token seller available funds mismatch");

        // Commit to an offer with tokens
        await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerNative.id, { value: price });

        // check that native currency balance increased
        const contractNativeBalanceAfter = await ethers.provider.getBalance(protocolDiamond.address);
        // contract token balance should increase for the incoming price
        // seller's deposit was already held in the contract's pool before
        expect(contractNativeBalanceAfter.sub(contractNativeBalanceBefore).toString()).to.eql(
          price,
          "Native currency wrong balance increase"
        );

        // Check that seller's pool balance was reduced
        sellersAvailableFundsAfter = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
        // native currecny is the second on the list of the available funds and the amount should be decreased for the sellerDeposit
        expect(
          ethers.BigNumber.from(sellersAvailableFundsBefore.funds[1].availableAmount)
            .sub(ethers.BigNumber.from(sellersAvailableFundsAfter.funds[1].availableAmount))
            .toString()
        ).to.eql(sellerDeposit, "Native currency seller available funds mismatch");
      });

      it("if seller's available funds drop to 0, token should be removed from the tokenList", async function () {
        // seller's available funds
        let sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
        expect(sellersAvailableFunds.funds.length).to.eql(2, "Funds length mismatch");
        expect(sellersAvailableFunds.funds[0].tokenAddress).to.eql(
          mockToken.address,
          "Token contract address mismatch"
        );
        expect(sellersAvailableFunds.funds[1].tokenAddress).to.eql(
          ethers.constants.AddressZero,
          "Native currency address mismatch"
        );

        // Commit to offer with token twice to empty the seller's pool
        await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerToken.id);
        await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerToken.id);

        // Token address should be removed and have only native currency in the list
        sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
        expect(sellersAvailableFunds.funds.length).to.eql(1, "Funds length mismatch");
        expect(sellersAvailableFunds.funds[0].tokenAddress).to.eql(
          ethers.constants.AddressZero,
          "Native currency address mismatch"
        );

        // Commit to offer with token twice to empty the seller's pool
        await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerNative.id, { value: price });
        await exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerNative.id, { value: price });

        // Token address should be removed and have only native currency in the list
        sellersAvailableFunds = FundsList.fromStruct(await fundsHandler.getAvailableFunds(seller.id));
        expect(sellersAvailableFunds.funds.length).to.eql(0, "Funds length mismatch");
      });

      it("when someone else deposits on buyer's behalf, callers funds are transferred", async function () {
        let randoBuyerId = "2"; // 1: seller, 2: rando
        // buyer will commit to an offer on rando's behalf
        // get token balance before the commit
        const buyerTokenBalanceBefore = await mockToken.balanceOf(buyer.address);
        const randoTokenBalanceBefore = await mockToken.balanceOf(rando.address);

        // commit to an offer with token on rando's behalf
        await exchangeHandler.connect(buyer).commitToOffer(rando.address, offerToken.id);

        // get token balance after the commit
        const buyerTokenBalanceAfter = await mockToken.balanceOf(buyer.address);
        const randoTokenBalanceAfter = await mockToken.balanceOf(rando.address);

        // buyer's balance should decrease, rando's should remain
        expect(buyerTokenBalanceBefore.sub(buyerTokenBalanceAfter).toString()).to.eql(
          price,
          "Buyer's token balance should decrease for a price"
        );
        expect(randoTokenBalanceAfter.toString()).to.eql(
          randoTokenBalanceBefore.toString(),
          "Rando's token balance should remain the same"
        );
        // make sure that rando is actually the buyer of the exchange
        let exchange;
        [, exchange] = await exchangeHandler.getExchange("1");
        expect(exchange.buyerId.toString()).to.eql(randoBuyerId, "Wrong buyer id");

        // get native currency balance before the commit
        const buyerNativeBalanceBefore = await ethers.provider.getBalance(buyer.address);
        const randoNativeBalanceBefore = await ethers.provider.getBalance(rando.address);

        // commit to an offer with native currency on rando's behalf
        const tx = await exchangeHandler.connect(buyer).commitToOffer(rando.address, offerNative.id, { value: price });
        const txReceipt = await tx.wait();
        const txCost = tx.gasPrice.mul(txReceipt.gasUsed);

        // get token balance after the commit
        const buyerNativeBalanceAfter = await ethers.provider.getBalance(buyer.address);
        const randoNativeBalanceAfter = await ethers.provider.getBalance(rando.address);

        // buyer's balance should decrease, rando's should remain
        expect(buyerNativeBalanceBefore.sub(buyerNativeBalanceAfter).sub(txCost).toString()).to.eql(
          price,
          "Buyer's native balance should decrease for a price"
        );
        expect(randoNativeBalanceAfter.toString()).to.eql(
          randoNativeBalanceBefore.toString(),
          "Rando's native balance should remain the same"
        );
        // make sure that rando is actually the buyer of the exchange
        [, exchange] = await exchangeHandler.getExchange("2");
        expect(exchange.buyerId.toString()).to.eql(randoBuyerId, "Wrong buyer id");

        // make sure that randoBuyerId actually belongs to rando address
        [, buyer] = await accountHandler.getBuyer(randoBuyerId);
        expect(buyer.wallet).to.eql(rando.address, "Wrong buyer address");
      });

      context("💔 Revert Reasons", async function () {
        it("Insufficient native currency sent", async function () {
          // Attempt to commit to an offer, expecting revert
          await expect(
            exchangeHandler
              .connect(buyer)
              .commitToOffer(buyer.address, offerNative.id, { value: ethers.BigNumber.from(price).sub("1").toString() })
          ).to.revertedWith(RevertReasons.INSUFFICIENT_VALUE_SENT);
        });

        it("Native currency sent together with ERC20 token transfer", async function () {
          // Attempt to commit to an offer, expecting revert
          await expect(
            exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerToken.id, { value: price })
          ).to.revertedWith(RevertReasons.NATIVE_NOT_ALLOWED);
        });

        it("Token address contract does not support transferFrom", async function () {
          // Deploy a contract without the transferFrom
          [bosonToken] = await deployMockTokens(gasLimit, ["BosonToken"]);

          // create an offer with a bad token contrat
          offerToken.exchangeToken = bosonToken.address;
          offerToken.id = "3";
          await offerHandler.connect(operator).createOffer(offerToken);

          // Attempt to commit to an offer, expecting revert
          await expect(exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerToken.id)).to.revertedWith(
            RevertReasons.TOKEN_TRANSFER_FAILED
          );
        });

        it("Token address is not a contract", async function () {
          // create an offer with a bad token contrat
          offerToken.exchangeToken = admin.address;
          offerToken.id = "3";
          await offerHandler.connect(operator).createOffer(offerToken);

          // Attempt to commit to an offer, expecting revert
          await expect(exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerToken.id)).to.revertedWith("");
        });

        it("Token contract revert for another reason", async function () {
          // insufficient funds
          // approve more than account actually have
          await mockToken.connect(rando).approve(protocolDiamond.address, price);
          // Attempt to commit to an offer, expecting revert
          await expect(exchangeHandler.connect(rando).commitToOffer(rando.address, offerToken.id)).to.revertedWith(
            RevertReasons.ERC20_EXCEEDS_BALANCE
          );

          // not approved
          await mockToken
            .connect(rando)
            .approve(protocolDiamond.address, ethers.BigNumber.from(price).sub("1").toString());
          // Attempt to commit to an offer, expecting revert
          await expect(exchangeHandler.connect(rando).commitToOffer(rando.address, offerToken.id)).to.revertedWith(
            RevertReasons.ERC20_INSUFFICIENT_ALLOWANCE
          );
        });

        it("Seller'a availableFunds is less than the required sellerDeposit", async function () {
          // create an offer with token with higher seller deposit
          offerToken.sellerDeposit = ethers.BigNumber.from(offerToken.sellerDeposit).mul("4");
          offerToken.id = "3";
          await offerHandler.connect(operator).createOffer(offerToken);

          // Attempt to commit to an offer, expecting revert
          await expect(exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerToken.id)).to.revertedWith(
            RevertReasons.INSUFFICIENT_AVAILABLE_FUNDS
          );

          // create an offer with native currency with higher seller deposit
          offerNative.sellerDeposit = ethers.BigNumber.from(offerNative.sellerDeposit).mul("4");
          offerNative.id = "4";
          await offerHandler.connect(operator).createOffer(offerNative);

          // Attempt to commit to an offer, expecting revert
          await expect(
            exchangeHandler.connect(buyer).commitToOffer(buyer.address, offerNative.id, { value: price })
          ).to.revertedWith(RevertReasons.INSUFFICIENT_AVAILABLE_FUNDS);
        });
      });
    });
  });
});
