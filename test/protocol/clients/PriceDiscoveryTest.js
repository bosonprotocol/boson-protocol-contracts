const { ethers } = require("hardhat");
const { expect } = require("chai");
const { ZeroAddress, getSigners, getContractAt, getContractFactory, parseUnits } = ethers;

const PriceDiscovery = require("../../../scripts/domain/PriceDiscovery");
const Side = require("../../../scripts/domain/Side");
const { getInterfaceIds } = require("../../../scripts/config/supported-interfaces.js");
const { RevertReasons } = require("../../../scripts/config/revert-reasons");
const { getSnapshot, revertToSnapshot } = require("../../util/utils.js");
const { deployMockTokens } = require("../../../scripts/util/deploy-mock-tokens");

describe("IPriceDiscovery", function () {
  let interfaceIds;
  let bosonVoucher;
  let protocol, buyer, seller, rando, foreign20;
  let snapshotId;
  let bosonErrors;
  let bosonPriceDiscovery;
  let externalPriceDiscovery;
  let weth;

  before(async function () {
    // Get interface id
    const { IBosonPriceDiscovery, IERC721Receiver } = await getInterfaceIds();
    interfaceIds = { IBosonPriceDiscovery, IERC721Receiver };

    // Use EOA for tests
    [protocol, seller, buyer, rando] = await getSigners();

    // Add WETH
    const wethFactory = await getContractFactory("WETH9");
    weth = await wethFactory.deploy();
    await weth.waitForDeployment();

    const bosonPriceDiscoveryFactory = await getContractFactory("BosonPriceDiscovery");
    bosonPriceDiscovery = await bosonPriceDiscoveryFactory.deploy(await weth.getAddress(), protocol.address);
    await bosonPriceDiscovery.waitForDeployment();

    bosonErrors = await getContractAt("BosonErrors", await bosonPriceDiscovery.getAddress());

    // Deploy external price discovery
    const externalPriceDiscoveryFactory = await getContractFactory("PriceDiscoveryMock");
    externalPriceDiscovery = await externalPriceDiscoveryFactory.deploy();
    await externalPriceDiscovery.waitForDeployment();

    // Deploy BosonVoucher
    [bosonVoucher, foreign20] = await deployMockTokens(["Foreign721", "Foreign20"]); // For the purpose of testing, a regular erc721 is ok
    await foreign20.mint(seller.address, parseUnits("1000", "ether"));
    await foreign20.mint(buyer.address, parseUnits("1000", "ether"));
    await foreign20.mint(protocol.address, parseUnits("1000", "ether"));

    // Get snapshot id
    snapshotId = await getSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
    snapshotId = await getSnapshot();
  });

  // Interface support
  context("📋 Interfaces", async function () {
    context("👉 supportsInterface()", async function () {
      it("should indicate support for IBosonPriceDiscovery and IERC721Receiver interface", async function () {
        // IBosonPriceDiscovery interface
        let support = await bosonPriceDiscovery.supportsInterface(interfaceIds["IBosonPriceDiscovery"]);
        expect(support, "IBosonPriceDiscovery interface not supported").is.true;

        // IERC721Receiver interface
        support = await bosonPriceDiscovery.supportsInterface(interfaceIds["IERC721Receiver"]);
        expect(support, "IERC721Receiver interface not supported").is.true;
      });
    });
  });

  context("📋 Constructor", async function () {
    it("Deployment fails if wrapped native address is 0", async function () {
      const bosonPriceDiscoveryFactory = await getContractFactory("BosonPriceDiscovery");

      await expect(bosonPriceDiscoveryFactory.deploy(ZeroAddress, protocol.address)).to.revertedWithCustomError(
        bosonErrors,
        RevertReasons.INVALID_ADDRESS
      );
    });

    it("Deployment fails if protocol address is 0", async function () {
      const bosonPriceDiscoveryFactory = await getContractFactory("BosonPriceDiscovery");

      await expect(bosonPriceDiscoveryFactory.deploy(await weth.getAddress(), ZeroAddress)).to.revertedWithCustomError(
        bosonErrors,
        RevertReasons.INVALID_ADDRESS
      );
    });
  });

  context("General", async function () {
    context("👉 fulfilAskOrder()", async function () {
      let orderType = 0;

      context("Wrapped Native token", async function () {
        let order, price, priceDiscovery, exchangeToken;

        beforeEach(async function () {
          price = 100n;

          order = {
            seller: seller.address,
            buyer: buyer.address,
            voucherContract: await bosonVoucher.getAddress(),
            tokenId: 0,
            exchangeToken: await weth.getAddress(),
            price: price,
          };

          await externalPriceDiscovery.setExpectedValues(order, orderType);
          await weth.connect(protocol).deposit({ value: price });
          await weth.connect(protocol).transfer(await bosonPriceDiscovery.getAddress(), price);

          const calldata = externalPriceDiscovery.interface.encodeFunctionData("mockFulfil", [0]);

          priceDiscovery = new PriceDiscovery(
            price,
            Side.Ask,
            await externalPriceDiscovery.getAddress(),
            await externalPriceDiscovery.getAddress(),
            calldata
          );

          exchangeToken = await weth.getAddress();
        });

        it("forwards call to priceDiscovery", async function () {
          await expect(
            bosonPriceDiscovery
              .connect(protocol)
              .fulfilAskOrder(exchangeToken, priceDiscovery, await bosonVoucher.getAddress(), buyer.address)
          ).to.emit(externalPriceDiscovery, "MockFulfilCalled");
        });

        it("if priceDiscovery returns some funds, it forwards them to the buyer", async function () {
          const calldata = externalPriceDiscovery.interface.encodeFunctionData("mockFulfil", [10]);
          priceDiscovery.priceDiscoveryData = calldata;

          const buyerBalanceBefore = await weth.balanceOf(buyer.address);

          await bosonPriceDiscovery
            .connect(protocol)
            .fulfilAskOrder(exchangeToken, priceDiscovery, await bosonVoucher.getAddress(), buyer.address);

          const buyerBalanceAfter = await weth.balanceOf(buyer.address);
          expect(buyerBalanceAfter - buyerBalanceBefore).to.eq(price / 10n);
        });

        context("💔 Revert Reasons", async function () {
          it("Caller is not the protocol", async function () {
            await expect(
              bosonPriceDiscovery
                .connect(rando)
                .fulfilAskOrder(order.exchangeToken, priceDiscovery, await bosonVoucher.getAddress(), buyer.address)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.ACCESS_DENIED);
          });

          it("Price discovery reverts", async function () {
            order.price = 1000n;
            await externalPriceDiscovery.setExpectedValues(order, orderType);

            await expect(
              bosonPriceDiscovery
                .connect(protocol)
                .fulfilAskOrder(order.exchangeToken, priceDiscovery, await bosonVoucher.getAddress(), buyer.address)
            ).to.revertedWith("Address: low-level call with value failed");
          });

          it("Negative price not allowed", async function () {
            await weth.connect(protocol).deposit({ value: 1000n });
            await weth.connect(protocol).transfer(await externalPriceDiscovery.getAddress(), 1000n);

            const calldata = externalPriceDiscovery.interface.encodeFunctionData("mockFulfil", [110]);
            priceDiscovery.priceDiscoveryData = calldata;

            await expect(
              bosonPriceDiscovery
                .connect(protocol)
                .fulfilAskOrder(order.exchangeToken, priceDiscovery, await bosonVoucher.getAddress(), buyer.address)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.NEGATIVE_PRICE_NOT_ALLOWED);
          });
        });
      });

      context("ERC20 token", async function () {
        let order, price, exchangeToken, priceDiscovery;

        beforeEach(async function () {
          price = 100n;

          order = {
            seller: seller.address,
            buyer: buyer.address,
            voucherContract: await bosonVoucher.getAddress(),
            tokenId: 0,
            exchangeToken: await foreign20.getAddress(),
            price: price,
          };

          await externalPriceDiscovery.setExpectedValues(order, orderType);

          await foreign20.connect(protocol).transfer(await bosonPriceDiscovery.getAddress(), price);

          const calldata = externalPriceDiscovery.interface.encodeFunctionData("mockFulfil", [25]);

          priceDiscovery = new PriceDiscovery(
            price,
            Side.Ask,
            await externalPriceDiscovery.getAddress(),
            await externalPriceDiscovery.getAddress(),
            calldata
          );

          exchangeToken = await foreign20.getAddress();
        });

        it("if priceDiscovery returns some funds, it forwards then to the buyer", async function () {
          const buyerBalanceBefore = await foreign20.balanceOf(buyer.address);

          await bosonPriceDiscovery
            .connect(protocol)
            .fulfilAskOrder(exchangeToken, priceDiscovery, await bosonVoucher.getAddress(), buyer.address);

          const buyerBalanceAfter = await foreign20.balanceOf(buyer.address);
          expect(buyerBalanceAfter - buyerBalanceBefore).to.eq(price / 4n);
        });

        it("price discovery is not approved after the transaction is finalized", async function () {
          await bosonPriceDiscovery
            .connect(protocol)
            .fulfilAskOrder(exchangeToken, priceDiscovery, await bosonVoucher.getAddress(), buyer.address);

          const allowance = await foreign20.allowance(
            await bosonPriceDiscovery.getAddress(),
            await externalPriceDiscovery.getAddress()
          );
          expect(allowance).to.eq(0n);
        });

        context("💔 Revert Reasons", async function () {
          it("Price discovery reverts", async function () {
            order.price = 1000n;
            await externalPriceDiscovery.setExpectedValues(order, orderType);

            await expect(
              bosonPriceDiscovery
                .connect(protocol)
                .fulfilAskOrder(exchangeToken, priceDiscovery, await bosonVoucher.getAddress(), buyer.address)
            ).to.revertedWith(RevertReasons.ERC20_INSUFFICIENT_ALLOWANCE);
          });

          it("Negative price not allowed", async function () {
            await foreign20.connect(protocol).transfer(await externalPriceDiscovery.getAddress(), 1000);

            const calldata = externalPriceDiscovery.interface.encodeFunctionData("mockFulfil", [110]);
            priceDiscovery.priceDiscoveryData = calldata;

            await expect(
              bosonPriceDiscovery
                .connect(protocol)
                .fulfilAskOrder(exchangeToken, priceDiscovery, await bosonVoucher.getAddress(), buyer.address)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.NEGATIVE_PRICE_NOT_ALLOWED);
          });
        });
      });
    });

    context("👉 fulfilBidOrder()", async function () {
      let orderType = 1;
      let tokenId = 1;

      beforeEach(async function () {
        // mint the voucher
        // for the test purposes, we mint the voucher directly to the bosonPriceDiscovery contract
        await bosonVoucher.connect(protocol).mint(tokenId, 1);
        await bosonVoucher
          .connect(protocol)
          .transferFrom(protocol.address, await bosonPriceDiscovery.getAddress(), tokenId);
      });

      context("Native token", async function () {
        let order, price, priceDiscovery, exchangeToken;

        beforeEach(async function () {
          price = 100n;

          order = {
            seller: seller.address,
            buyer: buyer.address,
            voucherContract: await bosonVoucher.getAddress(),
            tokenId: tokenId,
            exchangeToken: await weth.getAddress(),
            price: price,
          };

          await externalPriceDiscovery.setExpectedValues(order, orderType);
          await weth.connect(protocol).deposit({ value: 10n * price });
          await weth.connect(protocol).transfer(await externalPriceDiscovery.getAddress(), 10n * price);

          const calldata = externalPriceDiscovery.interface.encodeFunctionData("mockFulfil", [100]);

          priceDiscovery = new PriceDiscovery(
            price,
            Side.Bid,
            await externalPriceDiscovery.getAddress(),
            await externalPriceDiscovery.getAddress(),
            calldata
          );

          exchangeToken = ZeroAddress;
        });

        it("forwards call to priceDiscovery", async function () {
          await expect(
            bosonPriceDiscovery
              .connect(protocol)
              .fulfilBidOrder(tokenId, exchangeToken, priceDiscovery, seller.address, await bosonVoucher.getAddress())
          ).to.emit(externalPriceDiscovery, "MockFulfilCalled");
        });

        it("actual price is returned to the protocol", async function () {
          const calldata = externalPriceDiscovery.interface.encodeFunctionData("mockFulfil", [110]);
          priceDiscovery.priceDiscoveryData = calldata;

          const protocolBalanceBefore = await weth.balanceOf(protocol.address);

          await bosonPriceDiscovery
            .connect(protocol)
            .fulfilBidOrder(tokenId, exchangeToken, priceDiscovery, seller.address, await bosonVoucher.getAddress());

          const protocolBalanceAfter = await weth.balanceOf(protocol.address);
          expect(protocolBalanceAfter - protocolBalanceBefore).to.eq((price * 11n) / 10n);
        });

        context("💔 Revert Reasons", async function () {
          it("Caller is not the protocol", async function () {
            await expect(
              bosonPriceDiscovery
                .connect(rando)
                .fulfilBidOrder(tokenId, exchangeToken, priceDiscovery, seller.address, await bosonVoucher.getAddress())
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.ACCESS_DENIED);
          });

          it("Price discovery reverts", async function () {
            priceDiscovery.conduit = ZeroAddress;

            await expect(
              bosonPriceDiscovery
                .connect(protocol)
                .fulfilBidOrder(tokenId, exchangeToken, priceDiscovery, seller.address, await bosonVoucher.getAddress())
            ).to.revertedWith(RevertReasons.ERC721_CALLER_NOT_OWNER_OR_APPROVED);
          });

          it("Negative price not allowed", async function () {
            await weth.connect(protocol).deposit({ value: 1000n });
            await weth.connect(protocol).transfer(await bosonPriceDiscovery.getAddress(), 1000n);

            const calldata = weth.interface.encodeFunctionData("transfer", [rando.address, 110]);

            const priceDiscovery = new PriceDiscovery(
              price,
              Side.Bid,
              await weth.getAddress(),
              await weth.getAddress(),
              calldata
            );

            await expect(
              bosonPriceDiscovery
                .connect(protocol)
                .fulfilBidOrder(tokenId, exchangeToken, priceDiscovery, seller.address, await bosonVoucher.getAddress())
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.NEGATIVE_PRICE_NOT_ALLOWED);
          });

          it("Insufficient value received", async function () {
            const calldata = externalPriceDiscovery.interface.encodeFunctionData("mockFulfil", [90]);

            priceDiscovery.priceDiscoveryData = calldata;

            await expect(
              bosonPriceDiscovery
                .connect(protocol)
                .fulfilBidOrder(tokenId, exchangeToken, priceDiscovery, seller.address, await bosonVoucher.getAddress())
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.INSUFFICIENT_VALUE_RECEIVED);
          });

          it("Voucher not transferred", async function () {
            const calldata = foreign20.interface.encodeFunctionData("transfer", [rando.address, 0]);

            const priceDiscovery = new PriceDiscovery(
              0,
              Side.Bid,
              await foreign20.getAddress(),
              await foreign20.getAddress(),
              calldata
            );

            await expect(
              bosonPriceDiscovery
                .connect(protocol)
                .fulfilBidOrder(tokenId, exchangeToken, priceDiscovery, seller.address, await bosonVoucher.getAddress())
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.VOUCHER_NOT_TRANSFERRED);
          });
        });
      });

      context("ERC20 token", async function () {
        let order, price, exchangeToken, priceDiscovery;

        beforeEach(async function () {
          price = 100n;

          order = {
            seller: seller.address,
            buyer: buyer.address,
            voucherContract: await bosonVoucher.getAddress(),
            tokenId: tokenId,
            exchangeToken: await foreign20.getAddress(),
            price: price,
          };

          await externalPriceDiscovery.setExpectedValues(order, orderType);

          await foreign20.connect(protocol).transfer(await externalPriceDiscovery.getAddress(), 2n * price);

          const calldata = externalPriceDiscovery.interface.encodeFunctionData("mockFulfil", [100]);

          priceDiscovery = new PriceDiscovery(
            price,
            Side.Bid,
            await externalPriceDiscovery.getAddress(),
            await externalPriceDiscovery.getAddress(),
            calldata
          );

          exchangeToken = await foreign20.getAddress();
        });

        it("forwards call to priceDiscovery", async function () {
          await expect(
            bosonPriceDiscovery
              .connect(protocol)
              .fulfilBidOrder(tokenId, exchangeToken, priceDiscovery, seller.address, await bosonVoucher.getAddress())
          ).to.emit(externalPriceDiscovery, "MockFulfilCalled");
        });

        it("actual price is returned to the protocol", async function () {
          const calldata = externalPriceDiscovery.interface.encodeFunctionData("mockFulfil", [110]);
          priceDiscovery.priceDiscoveryData = calldata;

          const protocolBalanceBefore = await foreign20.balanceOf(protocol.address);

          await bosonPriceDiscovery
            .connect(protocol)
            .fulfilBidOrder(tokenId, exchangeToken, priceDiscovery, seller.address, await bosonVoucher.getAddress());

          const protocolBalanceAfter = await foreign20.balanceOf(protocol.address);
          expect(protocolBalanceAfter - protocolBalanceBefore).to.eq((price * 11n) / 10n);
        });

        it("price discovery is not approved after the transaction is finalized", async function () {
          await bosonPriceDiscovery
            .connect(protocol)
            .fulfilBidOrder(tokenId, exchangeToken, priceDiscovery, seller.address, await bosonVoucher.getAddress());

          const approved = await bosonVoucher.getApproved(tokenId);
          expect(approved).to.eq(ZeroAddress);
        });

        context("💔 Revert Reasons", async function () {
          it("Price discovery reverts", async function () {
            order.price = 1000n;
            await externalPriceDiscovery.setExpectedValues(order, orderType);

            await expect(
              bosonPriceDiscovery
                .connect(protocol)
                .fulfilBidOrder(tokenId, exchangeToken, priceDiscovery, seller.address, await bosonVoucher.getAddress())
            ).to.revertedWith(RevertReasons.ERC20_EXCEEDS_BALANCE);
          });

          it("Negative price not allowed", async function () {
            await foreign20.connect(protocol).transfer(await bosonPriceDiscovery.getAddress(), 1000);

            const calldata = foreign20.interface.encodeFunctionData("transfer", [rando.address, 110]);

            const priceDiscovery = new PriceDiscovery(
              price,
              Side.Bid,
              await foreign20.getAddress(),
              await foreign20.getAddress(),
              calldata
            );

            await expect(
              bosonPriceDiscovery
                .connect(protocol)
                .fulfilBidOrder(tokenId, exchangeToken, priceDiscovery, seller.address, await bosonVoucher.getAddress())
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.NEGATIVE_PRICE_NOT_ALLOWED);
          });

          it("Insufficient value received", async function () {
            const calldata = externalPriceDiscovery.interface.encodeFunctionData("mockFulfil", [90]);

            priceDiscovery.priceDiscoveryData = calldata;

            await expect(
              bosonPriceDiscovery
                .connect(protocol)
                .fulfilBidOrder(tokenId, exchangeToken, priceDiscovery, seller.address, await bosonVoucher.getAddress())
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.INSUFFICIENT_VALUE_RECEIVED);
          });
        });
      });
    });

    context("👉 handleWrapper()", async function () {
      let orderType = 2;
      let tokenId = 1;

      // beforeEach(async function () {
      //   // mint the voucher
      //   // for the test purposes, we mint the voucher directly to the bosonPriceDiscovery contract
      //   await bosonVoucher.connect(protocol).mint(tokenId, 1);
      //   await bosonVoucher
      //     .connect(protocol)
      //     .transferFrom(protocol.address, await bosonPriceDiscovery.getAddress(), tokenId);
      // });

      context("Native token", async function () {
        let order, price, priceDiscovery, exchangeToken;

        beforeEach(async function () {
          price = 100n;

          order = {
            seller: seller.address,
            buyer: buyer.address,
            voucherContract: await bosonVoucher.getAddress(),
            tokenId: tokenId,
            exchangeToken: await weth.getAddress(),
            price: price,
          };

          await externalPriceDiscovery.setExpectedValues(order, orderType);
          await weth.connect(protocol).deposit({ value: 10n * price });
          await weth.connect(protocol).transfer(await externalPriceDiscovery.getAddress(), 10n * price);

          const calldata = externalPriceDiscovery.interface.encodeFunctionData("mockFulfil", [100]);

          priceDiscovery = new PriceDiscovery(
            price,
            Side.Wrapper,
            await externalPriceDiscovery.getAddress(),
            await externalPriceDiscovery.getAddress(),
            calldata
          );

          exchangeToken = ZeroAddress;
        });

        it("forwards call to priceDiscovery", async function () {
          await expect(bosonPriceDiscovery.connect(protocol).handleWrapper(exchangeToken, priceDiscovery)).to.emit(
            externalPriceDiscovery,
            "MockFulfilCalled"
          );
        });

        it("actual price is returned to the protocol", async function () {
          const protocolBalanceBefore = await weth.balanceOf(protocol.address);

          await bosonPriceDiscovery.connect(protocol).handleWrapper(exchangeToken, priceDiscovery);

          const protocolBalanceAfter = await weth.balanceOf(protocol.address);
          expect(protocolBalanceAfter - protocolBalanceBefore).to.eq(price);
        });

        context("💔 Revert Reasons", async function () {
          it("Caller is not the protocol", async function () {
            await expect(
              bosonPriceDiscovery.connect(rando).handleWrapper(exchangeToken, priceDiscovery)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.ACCESS_DENIED);
          });

          it("Price discovery reverts", async function () {
            await externalPriceDiscovery.setExpectedValues(order, 1);

            await expect(
              bosonPriceDiscovery.connect(protocol).handleWrapper(exchangeToken, priceDiscovery)
            ).to.revertedWith(RevertReasons.ERC721_INVALID_TOKEN_ID);
          });

          it("Negative price not allowed", async function () {
            await weth.connect(protocol).deposit({ value: 1000n });
            await weth.connect(protocol).transfer(await bosonPriceDiscovery.getAddress(), 1000n);

            const calldata = weth.interface.encodeFunctionData("transfer", [rando.address, 110]);

            const priceDiscovery = new PriceDiscovery(
              price,
              Side.Bid,
              await weth.getAddress(),
              await weth.getAddress(),
              calldata
            );

            await expect(
              bosonPriceDiscovery.connect(protocol).handleWrapper(exchangeToken, priceDiscovery)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.NEGATIVE_PRICE_NOT_ALLOWED);
          });

          it("Insufficient value received", async function () {
            const calldata = externalPriceDiscovery.interface.encodeFunctionData("mockFulfil", [90]);

            priceDiscovery.priceDiscoveryData = calldata;

            await expect(
              bosonPriceDiscovery.connect(protocol).handleWrapper(exchangeToken, priceDiscovery)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.PRICE_MISMATCH);
          });

          it("Returned too much", async function () {
            const calldata = externalPriceDiscovery.interface.encodeFunctionData("mockFulfil", [110]);

            priceDiscovery.priceDiscoveryData = calldata;

            await expect(
              bosonPriceDiscovery.connect(protocol).handleWrapper(exchangeToken, priceDiscovery)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.PRICE_MISMATCH);
          });
        });
      });

      context("ERC20 token", async function () {
        let order, price, exchangeToken, priceDiscovery;

        beforeEach(async function () {
          price = 100n;

          order = {
            seller: seller.address,
            buyer: buyer.address,
            voucherContract: await bosonVoucher.getAddress(),
            tokenId: tokenId,
            exchangeToken: await foreign20.getAddress(),
            price: price,
          };

          await externalPriceDiscovery.setExpectedValues(order, orderType);

          await foreign20.connect(protocol).transfer(await externalPriceDiscovery.getAddress(), 2n * price);

          const calldata = externalPriceDiscovery.interface.encodeFunctionData("mockFulfil", [100]);

          priceDiscovery = new PriceDiscovery(
            price,
            Side.Wrapper,
            await externalPriceDiscovery.getAddress(),
            await externalPriceDiscovery.getAddress(),
            calldata
          );

          exchangeToken = await foreign20.getAddress();
        });

        it("forwards call to priceDiscovery", async function () {
          await expect(bosonPriceDiscovery.connect(protocol).handleWrapper(exchangeToken, priceDiscovery)).to.emit(
            externalPriceDiscovery,
            "MockFulfilCalled"
          );
        });

        it("actual price is returned to the protocol", async function () {
          const protocolBalanceBefore = await foreign20.balanceOf(protocol.address);

          await bosonPriceDiscovery.connect(protocol).handleWrapper(exchangeToken, priceDiscovery);

          const protocolBalanceAfter = await foreign20.balanceOf(protocol.address);
          expect(protocolBalanceAfter - protocolBalanceBefore).to.eq(price);
        });

        context("💔 Revert Reasons", async function () {
          it("Price discovery reverts", async function () {
            order.price = 1000n;
            await externalPriceDiscovery.setExpectedValues(order, orderType);

            await expect(
              bosonPriceDiscovery.connect(protocol).handleWrapper(exchangeToken, priceDiscovery)
            ).to.revertedWith(RevertReasons.ERC20_EXCEEDS_BALANCE);
          });

          it("Negative price not allowed", async function () {
            await foreign20.connect(protocol).transfer(await bosonPriceDiscovery.getAddress(), 1000);

            const calldata = foreign20.interface.encodeFunctionData("transfer", [rando.address, 110]);

            const priceDiscovery = new PriceDiscovery(
              price,
              Side.Bid,
              await foreign20.getAddress(),
              await foreign20.getAddress(),
              calldata
            );

            await expect(
              bosonPriceDiscovery.connect(protocol).handleWrapper(exchangeToken, priceDiscovery)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.NEGATIVE_PRICE_NOT_ALLOWED);
          });

          it("Insufficient value received", async function () {
            const calldata = externalPriceDiscovery.interface.encodeFunctionData("mockFulfil", [90]);

            priceDiscovery.priceDiscoveryData = calldata;

            await expect(
              bosonPriceDiscovery.connect(protocol).handleWrapper(exchangeToken, priceDiscovery)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.PRICE_MISMATCH);
          });

          it("Returned too much", async function () {
            const calldata = externalPriceDiscovery.interface.encodeFunctionData("mockFulfil", [110]);

            priceDiscovery.priceDiscoveryData = calldata;

            await expect(
              bosonPriceDiscovery.connect(protocol).handleWrapper(exchangeToken, priceDiscovery)
            ).to.revertedWithCustomError(bosonErrors, RevertReasons.PRICE_MISMATCH);
          });
        });
      });
    });
  });

  context("📋 onERC721Received", async function () {
    it("Can receive voucher only during price discovery", async function () {
      const tokenId = 1;
      await bosonVoucher.connect(protocol).mint(tokenId, 1);

      await expect(
        bosonVoucher
          .connect(protocol)
          [
            "safeTransferFrom(address,address,uint256)"
          ](protocol.address, await bosonPriceDiscovery.getAddress(), tokenId)
      ).to.revertedWithCustomError(bosonErrors, RevertReasons.UNEXPECTED_ERC721_RECEIVED);
    });
  });
});
