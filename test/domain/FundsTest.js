const hre = require("hardhat");
const { getSigners } = hre.ethers;
const { expect } = require("chai");
const { Funds, FundsList } = require("../../scripts/domain/Funds");

/**
 *  Test the Funds domain entity
 */
describe("Funds", function () {
  // Suite-wide scope
  let accounts, funds, object, promoted, clone, dehydrated, rehydrated, key, value, struct;
  let tokenAddress, tokenName, availableAmount;

  beforeEach(async function () {
    // Get a list of accounts
    accounts = await getSigners();
    tokenAddress = accounts[1].address;

    // Required constructor params
    tokenName = "MockToken";
    availableAmount = "100";
  });

  context("📋 Constructor", async function () {
    it("Should allow creation of valid, fully populated Funds instance", async function () {
      // Create valid funds
      funds = new Funds(tokenAddress, tokenName, availableAmount);
      expect(funds.tokenAddressIsValid()).is.true;
      expect(funds.tokenNameIsValid()).is.true;
      expect(funds.availableAmountIsValid()).is.true;
      expect(funds.isValid()).is.true;
    });
  });

  context("📋 Field validations", async function () {
    beforeEach(async function () {
      // Create valid funds, then set fields in tests directly
      funds = new Funds(tokenAddress, tokenName, availableAmount);
      expect(funds.isValid()).is.true;
    });

    it("Always present, tokenAddress must be a string representation of an EIP-55 compliant address", async function () {
      // Invalid field value
      funds.tokenAddress = "0xASFADF";
      expect(funds.tokenAddressIsValid()).is.false;
      expect(funds.isValid()).is.false;

      // Invalid field value
      funds.tokenAddress = "zedzdeadbaby";
      expect(funds.tokenAddressIsValid()).is.false;
      expect(funds.isValid()).is.false;

      // Valid field value
      funds.tokenAddress = accounts[0].address;
      expect(funds.tokenAddressIsValid()).is.true;
      expect(funds.isValid()).is.true;

      // Valid field value
      funds.tokenAddress = "0xec2fd5bd6fc7b576dae82c0b9640969d8de501a2";
      expect(funds.tokenAddressIsValid()).is.true;
      expect(funds.isValid()).is.true;
    });

    it("Always present, tokenName must be a string", async function () {
      // Invalid field value
      funds.tokenName = 12;
      expect(funds.tokenNameIsValid()).is.false;
      expect(funds.isValid()).is.false;

      // Valid field value
      funds.tokenName = "zedzdeadbaby";
      expect(funds.tokenNameIsValid()).is.true;
      expect(funds.isValid()).is.true;

      // Valid field value
      funds.tokenName = "QmYXc12ov6F2MZVZwPs5XeCBbf61cW3wKRk8h3D5NTYj4T";
      expect(funds.tokenNameIsValid()).is.true;
      expect(funds.isValid()).is.true;

      // Valid field value
      funds.tokenName = "";
      expect(funds.tokenNameIsValid()).is.true;
      expect(funds.isValid()).is.true;
    });

    it("Always present, availableAmount must be the string representation of a BigNumber", async function () {
      // Invalid field value
      funds.availableAmount = "zedzdeadbaby";
      expect(funds.availableAmountIsValid()).is.false;
      expect(funds.isValid()).is.false;

      // Invalid field value
      funds.availableAmount = new Date();
      expect(funds.availableAmountIsValid()).is.false;
      expect(funds.isValid()).is.false;

      // Invalid field value
      funds.availableAmount = 12;
      expect(funds.availableAmountIsValid()).is.false;
      expect(funds.isValid()).is.false;

      // Valid field value
      funds.availableAmount = "0";
      expect(funds.availableAmountIsValid()).is.true;
      expect(funds.isValid()).is.true;

      // Valid field value
      funds.availableAmount = "126";
      expect(funds.availableAmountIsValid()).is.true;
      expect(funds.isValid()).is.true;
    });
  });

  context("📋 Utility functions", async function () {
    beforeEach(async function () {
      // Create valid funds, then set fields in tests directly
      funds = new Funds(tokenAddress, tokenName, availableAmount);

      expect(funds.isValid()).is.true;

      // Get plain object
      object = {
        tokenAddress,
        tokenName,
        availableAmount,
      };

      // Struct representation
      struct = [tokenAddress, tokenName, availableAmount];
    });

    context("👉 Static", async function () {
      it("Funds.fromObject() should return a Funds instance with the same values as the given plain object", async function () {
        // Promote to instance
        promoted = Funds.fromObject(object);

        // Is a Buyer instance
        expect(promoted instanceof Funds).is.true;

        // Key values all match
        for ([key, value] of Object.entries(funds)) {
          expect(JSON.stringify(promoted[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("Funds.fromStruct() should return a Funds instance from a struct representation", async function () {
        // Get an instance from the struct
        funds = Funds.fromStruct(struct);

        // Ensure it is valid
        expect(funds.isValid()).to.be.true;
      });
    });

    context("👉 Instance", async function () {
      it("instance.toString() should return a JSON string representation of the Funds instance", async function () {
        dehydrated = funds.toString();
        rehydrated = JSON.parse(dehydrated);

        for ([key, value] of Object.entries(funds)) {
          expect(JSON.stringify(rehydrated[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.toObject() should return a plain object representation of the Funds instance", async function () {
        // Get plain object
        object = funds.toObject();

        // Not a Funds instance
        expect(object instanceof Funds).is.false;

        // Key values all match
        for ([key, value] of Object.entries(funds)) {
          expect(JSON.stringify(object[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("Funds.toStruct() should return a struct representation of the Funds instance", async function () {
        // Get struct from funds
        struct = funds.toStruct();

        // Marshal back to a funds instance
        funds = Funds.fromStruct(struct);

        // Ensure it marshals back to a valid funds
        expect(funds.isValid()).to.be.true;
      });

      it("instance.clone() should return another Funds instance with the same property values", async function () {
        // Get plain object
        clone = funds.clone();

        // Is a Funds instance
        expect(clone instanceof Funds).is.true;

        // Key values all match
        for ([key, value] of Object.entries(funds)) {
          expect(JSON.stringify(clone[key]) === JSON.stringify(value)).is.true;
        }
      });
    });
  });
});

describe("FundsList", function () {
  // Suite-wide scope
  let accounts, funds, fundsList, object, promoted, clone, dehydrated, rehydrated, key, value, struct;

  beforeEach(async function () {
    // Get a list of accounts
    accounts = await getSigners();

    // Required constructor params
    funds = [
      new Funds(accounts[1].address, "MockToken1", "100"),
      new Funds(accounts[2].address, "MockToken2", "200"),
      new Funds(accounts[3].address, "MockToken3", "300"),
    ];
  });

  context("📋 Constructor", async function () {
    it("Should allow creation of valid, fully populated FundsList instance", async function () {
      // Create valid fundsFundsList
      fundsList = new FundsList(funds);
      expect(fundsList.fundsIsValid()).is.true;
      expect(fundsList.isValid()).is.true;
    });
  });

  context("📋 Field validations", async function () {
    beforeEach(async function () {
      // Create valid FundsList, then set fields in tests directly
      fundsList = new FundsList(funds);
      expect(fundsList.isValid()).is.true;
    });

    it("Always present, funds must be an array of valid Funds instances", async function () {
      // Invalid field value
      fundsList.funds = "0xASFADF";
      expect(fundsList.isValid()).is.false;

      // Invalid field value
      fundsList.funds = funds[0];
      expect(fundsList.isValid()).is.false;

      // Invalid field value
      fundsList.funds = ["0xASFADF", "zedzdeadbaby"];
      expect(fundsList.isValid()).is.false;

      // Invalid field value
      fundsList.funds = undefined;
      expect(fundsList.isValid()).is.false;

      // Invalid field value
      fundsList.funds = [...funds, "zedzdeadbaby"];
      expect(fundsList.isValid()).is.false;

      // Invalid field value
      fundsList.funds = [new Funds("111", "mockToken", "100")];
      expect(fundsList.isValid()).is.false;

      // Valid field value
      fundsList.funds = [...funds];
      expect(fundsList.isValid()).is.true;
    });
  });

  context("📋 Utility functions", async function () {
    beforeEach(async function () {
      // Create valid FundsList, then set fields in tests directly
      fundsList = new FundsList(funds);
      expect(fundsList.isValid()).is.true;

      // Get plain object
      object = {
        funds,
      };

      // Struct representation
      struct = funds.map((f) => f.toStruct());
    });

    context("👉 Static", async function () {
      it("FundsList.fromObject() should return a FundsList instance with the same values as the given plain object", async function () {
        // Promote to instance
        promoted = FundsList.fromObject(object);

        // Is a Buyer instance
        expect(promoted instanceof FundsList).is.true;

        // Key values all match
        for ([key, value] of Object.entries(fundsList)) {
          expect(JSON.stringify(promoted[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("FundsList.fromStruct() should return a FundsList instance from a struct representation", async function () {
        // Get an instance from the struct
        fundsList = FundsList.fromStruct(struct);

        // Ensure it is valid
        expect(fundsList.isValid()).to.be.true;
      });
    });

    context("👉 Instance", async function () {
      it("instance.toString() should return a JSON string representation of the Funds instance", async function () {
        dehydrated = fundsList.toString();
        rehydrated = JSON.parse(dehydrated);

        for ([key, value] of Object.entries(fundsList)) {
          expect(JSON.stringify(rehydrated[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.toObject() should return a plain object representation of the FundsList instance", async function () {
        // Get plain object
        object = fundsList.toObject();

        // Not a FundsList instance
        expect(object instanceof FundsList).is.false;

        // Key values all match
        for ([key, value] of Object.entries(fundsList)) {
          expect(JSON.stringify(object[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("FundsList.toStruct() should return a struct representation of the FundsList instance", async function () {
        // Get struct from funds
        struct = fundsList.toStruct();

        // Marshal back to a funds instance
        fundsList = FundsList.fromStruct(struct);

        // Ensure it marshals back to a valid funds
        expect(fundsList.isValid()).to.be.true;
      });

      it("instance.clone() should return another FundsList instance with the same property values", async function () {
        // Get plain object
        clone = fundsList.clone();

        // Is a Funds instance
        expect(clone instanceof FundsList).is.true;

        // Key values all match
        for ([key, value] of Object.entries(fundsList)) {
          expect(JSON.stringify(clone[key]) === JSON.stringify(value)).is.true;
        }
      });
    });
  });
});
