const { ethers } = require("hardhat");
const { expect } = require("chai");
const { RoyaltyInfo, RoyaltyInfoList } = require("../../scripts/domain/RoyaltyInfo.js");

/**
 *  Test the RoyaltyInfo domain entity
 */
describe("RoyaltyInfo", function () {
  // Suite-wide scope
  let royaltyInfo, object, struct, promoted, clone, dehydrated, rehydrated, key, value;
  let recipients, bps;
  let accounts;

  beforeEach(async function () {
    // Required constructor params
    accounts = await ethers.getSigners();
    recipients = accounts.slice(0, 4).map((a) => a.address);
    bps = ["16", "32", "64", "128"];
  });

  context("📋 Constructor", async function () {
    it("Should allow creation of valid, fully populated RoyaltyInfo instance", async function () {
      royaltyInfo = new RoyaltyInfo(recipients, bps);
      expect(royaltyInfo.recipientsIsValid()).is.true;
      expect(royaltyInfo.bpsIsValid()).is.true;
      expect(royaltyInfo.isValid()).is.true;
    });
  });

  context("📋 Field validations", async function () {
    beforeEach(async function () {
      // Create a valid royaltyInfo, then set fields in tests directly
      royaltyInfo = new RoyaltyInfo(recipients, bps);
      expect(royaltyInfo.isValid()).is.true;
    });

    it("Always present, recipients must be the array containing eip55 compliant Ethereum addresses", async function () {
      // Invalid field value
      royaltyInfo.recipients = "zedzdeadbaby";
      expect(royaltyInfo.recipientsIsValid()).is.false;
      expect(royaltyInfo.isValid()).is.false;

      // Invalid field value
      royaltyInfo.recipients = new Date();
      expect(royaltyInfo.recipientsIsValid()).is.false;
      expect(royaltyInfo.isValid()).is.false;

      // Invalid field value
      royaltyInfo.recipients = 12;
      expect(royaltyInfo.recipientsIsValid()).is.false;
      expect(royaltyInfo.isValid()).is.false;

      // Invalid field value
      royaltyInfo.recipients = [accounts[2].address, "2"];
      expect(royaltyInfo.recipientsIsValid()).is.false;
      expect(royaltyInfo.isValid()).is.false;

      // Valid field value
      royaltyInfo.recipients = [accounts[5].address, accounts[6].address];
      royaltyInfo.bps = ["1", "2"]; // length must match
      expect(royaltyInfo.recipientsIsValid()).is.true;
      expect(royaltyInfo.isValid()).is.true;

      // Valid field value
      royaltyInfo.recipients = [accounts[2].address];
      royaltyInfo.bps = ["1"]; // length must match
      expect(royaltyInfo.recipientsIsValid()).is.true;
      expect(royaltyInfo.isValid()).is.true;

      // Valid field value
      royaltyInfo.recipients = [];
      royaltyInfo.bps = []; // length must match
      expect(royaltyInfo.recipientsIsValid()).is.true;
      expect(royaltyInfo.isValid()).is.true;
    });

    it("Always present, bps must be the array containing string representation of a BigNumber", async function () {
      // Invalid field value
      royaltyInfo.bps = "zedzdeadbaby";
      expect(royaltyInfo.bpsIsValid()).is.false;
      expect(royaltyInfo.isValid()).is.false;

      // Invalid field value
      royaltyInfo.bps = new Date();
      expect(royaltyInfo.bpsIsValid()).is.false;
      expect(royaltyInfo.isValid()).is.false;

      // Invalid field value
      royaltyInfo.bps = 12;
      expect(royaltyInfo.bpsIsValid()).is.false;
      expect(royaltyInfo.isValid()).is.false;

      // Valid field value
      royaltyInfo.bps = ["1", "2"];
      royaltyInfo.recipients = [accounts[0].address, accounts[1].address]; // length must match
      expect(royaltyInfo.bpsIsValid()).is.true;
      expect(royaltyInfo.isValid()).is.true;

      // Valid field value
      royaltyInfo.bps = ["126"];
      royaltyInfo.recipients = [accounts[0].address]; // length must match
      expect(royaltyInfo.bpsIsValid()).is.true;
      expect(royaltyInfo.isValid()).is.true;

      // Valid field value
      royaltyInfo.bps = [];
      royaltyInfo.recipients = []; // length must match
      expect(royaltyInfo.bpsIsValid()).is.true;
      expect(royaltyInfo.isValid()).is.true;
    });
  });

  context("📋 Utility functions", async function () {
    beforeEach(async function () {
      // Create a valid royaltyInfo, then set fields in tests directly
      royaltyInfo = new RoyaltyInfo(recipients, bps);
      expect(royaltyInfo.isValid()).is.true;

      // Get plain object
      object = {
        recipients,
        bps,
      };

      // Struct representation
      struct = [recipients, bps];
    });

    context("👉 Static", async function () {
      it("RoyaltyInfo.fromObject() should return a RoyaltyInfo instance with the same values as the given plain object", async function () {
        // Promote to instance
        promoted = RoyaltyInfo.fromObject(object);

        // Is a RoyaltyInfo instance
        expect(promoted instanceof RoyaltyInfo).is.true;

        // Key values all match
        for ([key, value] of Object.entries(royaltyInfo)) {
          expect(JSON.stringify(promoted[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("RoyaltyInfo.fromStruct() should return a RoyaltyInfo instance with the same values as the given struct", async function () {
        // Get condition from struct
        royaltyInfo = RoyaltyInfo.fromStruct(struct);

        // Ensure it marshals back to a valid royaltyInfo
        expect(royaltyInfo.isValid()).to.be.true;
      });
    });

    context("👉 Instance", async function () {
      it("instance.toString() should return a JSON string representation of the RoyaltyInfo instance", async function () {
        dehydrated = royaltyInfo.toString();
        rehydrated = JSON.parse(dehydrated);

        for ([key, value] of Object.entries(royaltyInfo)) {
          expect(JSON.stringify(rehydrated[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.toObject() should return a plain object representation of the RoyaltyInfo instance", async function () {
        // Get plain object
        object = royaltyInfo.toObject();

        // Not an RoyaltyInfo instance
        expect(object instanceof RoyaltyInfo).is.false;

        // Key values all match
        for ([key, value] of Object.entries(royaltyInfo)) {
          expect(JSON.stringify(object[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("RoyaltyInfo.toStruct() should return a struct representation of the RoyaltyInfo instance", async function () {
        // Get struct from royaltyInfo
        struct = royaltyInfo.toStruct();

        // Marshal back to a royaltyInfo instance
        royaltyInfo = RoyaltyInfo.fromStruct(struct);

        // Ensure it marshals back to a valid royaltyInfo
        expect(royaltyInfo.isValid()).to.be.true;
      });

      it("instance.clone() should return another RoyaltyInfo instance with the same property values", async function () {
        // Get plain object
        clone = royaltyInfo.clone();

        // Is an RoyaltyInfo instance
        expect(clone instanceof RoyaltyInfo).is.true;

        // Key values all match
        for ([key, value] of Object.entries(royaltyInfo)) {
          expect(JSON.stringify(clone[key]) === JSON.stringify(value)).is.true;
        }
      });
    });
  });
});

describe("RoyaltyInfoList", function () {
  // Suite-wide scope
  let accounts, royaltyInfo, royaltyInfoList, object, promoted, clone, dehydrated, rehydrated, key, value, struct;

  beforeEach(async function () {
    // Get a list of accounts
    accounts = await ethers.getSigners();

    // Required constructor params
    royaltyInfo = [
      new RoyaltyInfo(
        accounts.slice(0, 4).map((a) => a.address),
        ["1", "2", "3", "4"]
      ),
      new RoyaltyInfo([], []),
      new RoyaltyInfo(
        accounts.slice(1, 3).map((a) => a.address),
        ["10", "20"]
      ),
    ];
  });

  context("📋 Constructor", async function () {
    it("Should allow creation of valid, fully populated RoyaltyInfoList instance", async function () {
      // Create valid royaltyInfoRoyaltyInfoList
      royaltyInfoList = new RoyaltyInfoList(royaltyInfo);
      expect(royaltyInfoList.royaltyInfoIsValid()).is.true;
      expect(royaltyInfoList.isValid()).is.true;
    });
  });

  context("📋 Field validations", async function () {
    beforeEach(async function () {
      // Create valid RoyaltyInfoList, then set fields in tests directly
      royaltyInfoList = new RoyaltyInfoList(royaltyInfo);
      expect(royaltyInfoList.isValid()).is.true;
    });

    it("Always present, royaltyInfo must be an array of valid RoyaltyInfo instances", async function () {
      // Invalid field value
      royaltyInfoList.royaltyInfo = "0xASFADF";
      expect(royaltyInfoList.isValid()).is.false;

      // Invalid field value
      royaltyInfoList.royaltyInfo = royaltyInfo[0];
      expect(royaltyInfoList.isValid()).is.false;

      // Invalid field value
      royaltyInfoList.royaltyInfo = ["0xASFADF", "zedzdeadbaby"];
      expect(royaltyInfoList.isValid()).is.false;

      // Invalid field value
      royaltyInfoList.royaltyInfo = undefined;
      expect(royaltyInfoList.isValid()).is.false;

      // Invalid field value
      royaltyInfoList.royaltyInfo = [...royaltyInfo, "zedzdeadbaby"];
      expect(royaltyInfoList.isValid()).is.false;

      // Invalid field value
      royaltyInfoList.royaltyInfo = [new RoyaltyInfo(["111"], "mockToken")];
      expect(royaltyInfoList.isValid()).is.false;

      // Valid field value
      royaltyInfoList.royaltyInfo = [...royaltyInfo];
      expect(royaltyInfoList.isValid()).is.true;
    });
  });

  context("📋 Utility functions", async function () {
    beforeEach(async function () {
      // Create valid RoyaltyInfoList, then set fields in tests directly
      royaltyInfoList = new RoyaltyInfoList(royaltyInfo);
      expect(royaltyInfoList.isValid()).is.true;

      // Get plain object
      object = {
        royaltyInfo,
      };

      // Struct representation
      struct = royaltyInfo.map((f) => f.toStruct());
    });

    context("👉 Static", async function () {
      it("RoyaltyInfoList.fromObject() should return a RoyaltyInfoList instance with the same values as the given plain object", async function () {
        // Promote to instance
        promoted = RoyaltyInfoList.fromObject(object);

        // Is a Buyer instance
        expect(promoted instanceof RoyaltyInfoList).is.true;

        // Key values all match
        for ([key, value] of Object.entries(royaltyInfoList)) {
          expect(JSON.stringify(promoted[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("RoyaltyInfoList.fromStruct() should return a RoyaltyInfoList instance from a struct representation", async function () {
        // Get an instance from the struct
        royaltyInfoList = RoyaltyInfoList.fromStruct(struct);

        // Ensure it is valid
        expect(royaltyInfoList.isValid()).to.be.true;
      });
    });

    context("👉 Instance", async function () {
      it("instance.toString() should return a JSON string representation of the RoyaltyInfo instance", async function () {
        dehydrated = royaltyInfoList.toString();
        rehydrated = JSON.parse(dehydrated);

        for ([key, value] of Object.entries(royaltyInfoList)) {
          expect(JSON.stringify(rehydrated[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.toObject() should return a plain object representation of the RoyaltyInfoList instance", async function () {
        // Get plain object
        object = royaltyInfoList.toObject();

        // Not a RoyaltyInfoList instance
        expect(object instanceof RoyaltyInfoList).is.false;

        // Key values all match
        for ([key, value] of Object.entries(royaltyInfoList)) {
          expect(JSON.stringify(object[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("RoyaltyInfoList.toStruct() should return a struct representation of the RoyaltyInfoList instance", async function () {
        // Get struct from royaltyInfo
        struct = royaltyInfoList.toStruct();

        // Marshal back to a royaltyInfo instance
        royaltyInfoList = RoyaltyInfoList.fromStruct(struct);

        // Ensure it marshals back to a valid royaltyInfo
        expect(royaltyInfoList.isValid()).to.be.true;
      });

      it("instance.clone() should return another RoyaltyInfoList instance with the same property values", async function () {
        // Get plain object
        clone = royaltyInfoList.clone();

        // Is a RoyaltyInfo instance
        expect(clone instanceof RoyaltyInfoList).is.true;

        // Key values all match
        for ([key, value] of Object.entries(royaltyInfoList)) {
          expect(JSON.stringify(clone[key]) === JSON.stringify(value)).is.true;
        }
      });
    });
  });
});
