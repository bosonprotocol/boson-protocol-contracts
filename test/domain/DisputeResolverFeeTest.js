const hre = require("hardhat");
const { getSigners } = hre.ethers;
const { expect } = require("chai");
const { DisputeResolverFee, DisputeResolverFeeList } = require("../../scripts/domain/DisputeResolverFee");

/**
 *  Test the DisputeResolverFee domain entity
 */
describe("DisputeResolverFee", function () {
  // Suite-wide scope
  let accounts, disputeResolverFee, object, promoted, clone, dehydrated, rehydrated, key, value, struct;
  let tokenAddress, tokenName, feeAmount;

  beforeEach(async function () {
    // Get a list of accounts
    accounts = await getSigners();
    tokenAddress = accounts[1].address;

    // Required constructor params
    tokenName = "MockToken";
    feeAmount = "100";
  });

  context("📋 Constructor", async function () {
    it("Should allow creation of valid, fully populated DisputeResolverFee instance", async function () {
      // Create valid disputeResolverFee
      disputeResolverFee = new DisputeResolverFee(tokenAddress, tokenName, feeAmount);
      expect(disputeResolverFee.tokenAddressIsValid()).is.true;
      expect(disputeResolverFee.tokenNameIsValid()).is.true;
      expect(disputeResolverFee.feeAmountIsValid()).is.true;
      expect(disputeResolverFee.isValid()).is.true;
    });
  });

  context("📋 Field validations", async function () {
    beforeEach(async function () {
      // Create valid disputeResolverFee, then set fields in tests directly
      disputeResolverFee = new DisputeResolverFee(tokenAddress, tokenName, feeAmount);
      expect(disputeResolverFee.isValid()).is.true;
    });

    it("Always present, tokenAddress must be a string representation of an EIP-55 compliant address", async function () {
      // Invalid field value
      disputeResolverFee.tokenAddress = "0xASFADF";
      expect(disputeResolverFee.tokenAddressIsValid()).is.false;
      expect(disputeResolverFee.isValid()).is.false;

      // Invalid field value
      disputeResolverFee.tokenAddress = "zedzdeadbaby";
      expect(disputeResolverFee.tokenAddressIsValid()).is.false;
      expect(disputeResolverFee.isValid()).is.false;

      // Valid field value
      disputeResolverFee.tokenAddress = accounts[0].address;
      expect(disputeResolverFee.tokenAddressIsValid()).is.true;
      expect(disputeResolverFee.isValid()).is.true;

      // Valid field value
      disputeResolverFee.tokenAddress = "0xec2fd5bd6fc7b576dae82c0b9640969d8de501a2";
      expect(disputeResolverFee.tokenAddressIsValid()).is.true;
      expect(disputeResolverFee.isValid()).is.true;
    });

    it("Always present, tokenName must be a string", async function () {
      // Invalid field value
      disputeResolverFee.tokenName = 12;
      expect(disputeResolverFee.tokenNameIsValid()).is.false;
      expect(disputeResolverFee.isValid()).is.false;

      // Valid field value
      disputeResolverFee.tokenName = "zedzdeadbaby";
      expect(disputeResolverFee.tokenNameIsValid()).is.true;
      expect(disputeResolverFee.isValid()).is.true;

      // Valid field value
      disputeResolverFee.tokenName = "QmYXc12ov6F2MZVZwPs5XeCBbf61cW3wKRk8h3D5NTYj4T";
      expect(disputeResolverFee.tokenNameIsValid()).is.true;
      expect(disputeResolverFee.isValid()).is.true;

      // Valid field value
      disputeResolverFee.tokenName = "";
      expect(disputeResolverFee.tokenNameIsValid()).is.true;
      expect(disputeResolverFee.isValid()).is.true;
    });

    it("Always present, feeAmount must be the string representation of a BigNumber", async function () {
      // Invalid field value
      disputeResolverFee.feeAmount = "zedzdeadbaby";
      expect(disputeResolverFee.feeAmountIsValid()).is.false;
      expect(disputeResolverFee.isValid()).is.false;

      // Valid field value
      disputeResolverFee.feeAmount = "0";
      expect(disputeResolverFee.feeAmountIsValid()).is.true;
      expect(disputeResolverFee.isValid()).is.true;

      // Valid field value
      disputeResolverFee.feeAmount = "126";
      expect(disputeResolverFee.feeAmountIsValid()).is.true;
      expect(disputeResolverFee.isValid()).is.true;
    });
  });

  context("📋 Utility functions", async function () {
    beforeEach(async function () {
      // Create valid disputeResolverFee, then set fields in tests directly
      disputeResolverFee = new DisputeResolverFee(tokenAddress, tokenName, feeAmount);

      expect(disputeResolverFee.isValid()).is.true;

      // Get plain object
      object = {
        tokenAddress,
        tokenName,
        feeAmount,
      };

      // Struct representation
      struct = [tokenAddress, tokenName, feeAmount];
    });

    context("👉 Static", async function () {
      it("DisputeResolverFee.fromObject() should return a DisputeResolverFee instance with the same values as the given plain object", async function () {
        // Promote to instance
        promoted = DisputeResolverFee.fromObject(object);

        // Is a DisputeResolverFee instance
        expect(promoted instanceof DisputeResolverFee).is.true;

        // Key values all match
        for ([key, value] of Object.entries(disputeResolverFee)) {
          expect(JSON.stringify(promoted[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("DisputeResolverFee.fromStruct() should return a DisputeResolverFee instance from a struct representation", async function () {
        // Get an instance from the struct
        disputeResolverFee = DisputeResolverFee.fromStruct(struct);

        // Ensure it is valid
        expect(disputeResolverFee.isValid()).to.be.true;
      });
    });

    context("👉 Instance", async function () {
      it("instance.toString() should return a JSON string representation of the DisputeResolverFee instance", async function () {
        dehydrated = disputeResolverFee.toString();
        rehydrated = JSON.parse(dehydrated);

        for ([key, value] of Object.entries(disputeResolverFee)) {
          expect(JSON.stringify(rehydrated[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.toObject() should return a plain object representation of the DisputeResolverFee instance", async function () {
        // Get plain object
        object = disputeResolverFee.toObject();

        // Not a DisputeResolverFee instance
        expect(object instanceof DisputeResolverFee).is.false;

        // Key values all match
        for ([key, value] of Object.entries(disputeResolverFee)) {
          expect(JSON.stringify(object[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("DisputeResolverFee.toStruct() should return a struct representation of the DisputeResolverFee instance", async function () {
        // Get struct from disputeResolverFee
        struct = disputeResolverFee.toStruct();

        // Marshal back to a disputeResolverFee instance
        disputeResolverFee = DisputeResolverFee.fromStruct(struct);

        // Ensure it marshals back to a valid disputeResolverFee
        expect(disputeResolverFee.isValid()).to.be.true;
      });

      it("instance.clone() should return another DisputeResolverFee instance with the same property values", async function () {
        // Get plain object
        clone = disputeResolverFee.clone();

        // Is a DisputeResolverFee instance
        expect(clone instanceof DisputeResolverFee).is.true;

        // Key values all match
        for ([key, value] of Object.entries(disputeResolverFee)) {
          expect(JSON.stringify(clone[key]) === JSON.stringify(value)).is.true;
        }
      });
    });
  });
});

describe("DisputeResolverFeeList", function () {
  // Suite-wide scope
  let accounts,
    disputeResolverFees,
    disputeResolverFeeList,
    object,
    promoted,
    clone,
    dehydrated,
    rehydrated,
    key,
    value,
    struct;

  beforeEach(async function () {
    // Get a list of accounts
    accounts = await getSigners();

    // Required constructor params
    disputeResolverFees = [
      new DisputeResolverFee(accounts[1].address, "MockToken1", "100"),
      new DisputeResolverFee(accounts[2].address, "MockToken2", "200"),
      new DisputeResolverFee(accounts[3].address, "MockToken3", "300"),
    ];
  });

  context("📋 Constructor", async function () {
    it("Should allow creation of valid, fully populated DisputeResolverFeeList instance", async function () {
      // Create valid DisputeResolverFeeList
      disputeResolverFeeList = new DisputeResolverFeeList(disputeResolverFees);
      expect(disputeResolverFeeList.disputeResolverFeeIsValid()).is.true;
      expect(disputeResolverFeeList.isValid()).is.true;
    });
  });

  context("📋 Field validations", async function () {
    beforeEach(async function () {
      // Create valid DisputeResolverFeeList, then set fields in tests directly
      disputeResolverFeeList = new DisputeResolverFeeList(disputeResolverFees);
      expect(disputeResolverFeeList.isValid()).is.true;
    });

    it("Always present, disputeResolverFees must be an array of valid DisputeResolverFee instances", async function () {
      // Invalid field value
      disputeResolverFeeList.disputeResolverFees = "0xASFADF";
      expect(disputeResolverFeeList.isValid()).is.false;

      // Invalid field value
      disputeResolverFeeList.disputeResolverFee = disputeResolverFees[0];
      expect(disputeResolverFeeList.isValid()).is.false;

      // Invalid field value
      disputeResolverFeeList.disputeResolverFees = ["0xASFADF", "zedzdeadbaby"];
      expect(disputeResolverFeeList.isValid()).is.false;

      // Invalid field value
      disputeResolverFeeList.disputeResolverFees = undefined;
      expect(disputeResolverFeeList.isValid()).is.false;

      // Invalid field value
      disputeResolverFeeList.disputeResolverFees = [...disputeResolverFees, "zedzdeadbaby"];
      expect(disputeResolverFeeList.isValid()).is.false;

      // Invalid field value
      disputeResolverFeeList.disputeResolverFees = [new DisputeResolverFee("111", "mockToken", "100")];
      expect(disputeResolverFeeList.isValid()).is.false;

      // Valid field value
      disputeResolverFeeList.disputeResolverFees = [...disputeResolverFees];
      expect(disputeResolverFeeList.isValid()).is.true;
    });
  });

  context("📋 Utility functions", async function () {
    beforeEach(async function () {
      // Create valid DisputeResolverFeeList, then set fields in tests directly
      disputeResolverFeeList = new DisputeResolverFeeList(disputeResolverFees);
      expect(disputeResolverFeeList.isValid()).is.true;

      // Get plain object
      object = {
        disputeResolverFees,
      };

      // Struct representation
      struct = disputeResolverFees.map((d) => d.toStruct());
    });

    context("👉 Static", async function () {
      it("DisputeResolverFeeList.fromObject() should return a DisputeResolverFeeList instance with the same values as the given plain object", async function () {
        // Promote to instance
        promoted = DisputeResolverFeeList.fromObject(object);

        // Is a DisputeResolverFeeList instance
        expect(promoted instanceof DisputeResolverFeeList).is.true;

        // Key values all match
        for ([key, value] of Object.entries(disputeResolverFeeList)) {
          expect(JSON.stringify(promoted[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("DisputeResolverFeeList.fromStruct() should return a DisputeResolverFeeList instance from a struct representation", async function () {
        // Get an instance from the struct
        disputeResolverFeeList = DisputeResolverFeeList.fromStruct(struct);

        // Ensure it is valid
        expect(disputeResolverFeeList.isValid()).to.be.true;
      });
    });

    context("👉 Instance", async function () {
      it("instance.toString() should return a JSON string representation of the DisputeResolverFeeList instance", async function () {
        dehydrated = disputeResolverFeeList.toString();
        rehydrated = JSON.parse(dehydrated);

        for ([key, value] of Object.entries(disputeResolverFeeList)) {
          expect(JSON.stringify(rehydrated[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.toObject() should return a plain object representation of the DisputeResolverFeeList instance", async function () {
        // Get plain object
        object = disputeResolverFeeList.toObject();

        // Not a DisputeResolverFeeList instance
        expect(object instanceof DisputeResolverFeeList).is.false;

        // Key values all match
        for ([key, value] of Object.entries(disputeResolverFeeList)) {
          expect(JSON.stringify(object[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("DisputeResolverFeeList.toStruct() should return a struct representation of the DisputeResolverFeeList instance", async function () {
        // Get struct from DisputeResolverFeeList
        struct = disputeResolverFeeList.toStruct();

        // Marshal back to a DisputeResolverFeeList instance
        disputeResolverFeeList = DisputeResolverFeeList.fromStruct(struct);

        // Ensure it marshals back to a valid DisputeResolverFeeList
        expect(disputeResolverFeeList.isValid()).to.be.true;
      });

      it("instance.clone() should return another DisputeResolverFeeList instance with the same property values", async function () {
        // Get plain object
        clone = disputeResolverFeeList.clone();

        // Is a DisputeResolverFeeList instance
        expect(clone instanceof DisputeResolverFeeList).is.true;

        // Key values all match
        for ([key, value] of Object.entries(disputeResolverFeeList)) {
          expect(JSON.stringify(clone[key]) === JSON.stringify(value)).is.true;
        }
      });
    });
  });
});
