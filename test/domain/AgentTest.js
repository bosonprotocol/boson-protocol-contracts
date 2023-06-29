const hre = require("hardhat");
const { getSigners } = hre.ethers;
const { expect } = require("chai");
const Agent = require("../../scripts/domain/Agent");

/**
 *  Test the Agent domain entity
 */
describe("Agent", function () {
  // Suite-wide scope
  let accounts, agent, object, promoted, clone, dehydrated, rehydrated, key, value, struct;
  let id, wallet, active, feePercentage;

  context("📋 Constructor", async function () {
    beforeEach(async function () {
      // Get a list of accounts
      accounts = await getSigners();
      wallet = accounts[1].address;

      // Required constructor params
      id = "0";
      active = true;
      feePercentage = "500"; //5%
    });

    it("Should allow creation of valid, fully populated Agent instance", async function () {
      id = "250";

      // Create a valid agent
      agent = new Agent(id, feePercentage, wallet, active);
      expect(agent.idIsValid()).is.true;
      expect(agent.feePercentageIsValid()).is.true;
      expect(agent.walletIsValid()).is.true;
      expect(agent.activeIsValid()).is.true;
      expect(agent.isValid()).is.true;
    });
  });

  context("📋 Field validations", async function () {
    beforeEach(async function () {
      // Get a list of accounts
      accounts = await getSigners();
      wallet = accounts[1].address;

      // Required constructor params
      id = "199";
      active = true;
      feePercentage = "500"; //5%

      // Create a valid agent, then set fields in tests directly
      agent = new Agent(id, feePercentage, wallet, active);
      expect(agent.isValid()).is.true;
    });

    it("Always present, id must be the string representation of a BigNumber", async function () {
      // Invalid field value
      agent.id = "zedzdeadbaby";
      expect(agent.idIsValid()).is.false;
      expect(agent.isValid()).is.false;

      // Invalid field value
      agent.id = new Date();
      expect(agent.idIsValid()).is.false;
      expect(agent.isValid()).is.false;

      // Valid field value
      agent.id = "0";
      expect(agent.idIsValid()).is.true;
      expect(agent.isValid()).is.true;

      // Valid field value
      agent.id = "126";
      expect(agent.idIsValid()).is.true;
      expect(agent.isValid()).is.true;
    });

    it("Always present, feePercentage must be the string representation of a BigNumber", async function () {
      // Invalid field value
      agent.feePercentage = "zedzdeadbaby";
      expect(agent.feePercentageIsValid()).is.false;
      expect(agent.isValid()).is.false;

      // Invalid field value
      agent.feePercentage = new Date();
      expect(agent.feePercentageIsValid()).is.false;
      expect(agent.isValid()).is.false;

      // Invalid field value
      agent.feePercentage = "10001"; // Value greater than 100% should be invalid
      expect(agent.feePercentageIsValid()).is.false;
      expect(agent.isValid()).is.false;

      // Valid field value
      agent.feePercentage = "0";
      expect(agent.feePercentageIsValid()).is.true;
      expect(agent.isValid()).is.true;

      // Valid field value
      agent.feePercentage = "126";
      expect(agent.feePercentageIsValid()).is.true;
      expect(agent.isValid()).is.true;
    });

    it("Always present, wallet must be a string representation of an EIP-55 compliant address", async function () {
      // Invalid field value
      agent.wallet = "0xASFADF";
      expect(agent.walletIsValid()).is.false;
      expect(agent.isValid()).is.false;

      // Invalid field value
      agent.wallet = "zedzdeadbaby";
      expect(agent.walletIsValid()).is.false;
      expect(agent.isValid()).is.false;

      // Valid field value
      agent.wallet = accounts[0].address;
      expect(agent.walletIsValid()).is.true;
      expect(agent.isValid()).is.true;

      // Valid field value
      agent.wallet = "0xec2fd5bd6fc7b576dae82c0b9640969d8de501a2";
      expect(agent.walletIsValid()).is.true;
      expect(agent.isValid()).is.true;
    });

    it("Always present, active must be a boolean", async function () {
      // Invalid field value
      agent.active = 12;
      expect(agent.activeIsValid()).is.false;
      expect(agent.isValid()).is.false;

      // Invalid field value
      agent.active = "zedzdeadbaby";
      expect(agent.activeIsValid()).is.false;
      expect(agent.isValid()).is.false;

      // Valid field value
      agent.active = false;
      expect(agent.activeIsValid()).is.true;
      expect(agent.isValid()).is.true;

      // Valid field value
      agent.active = true;
      expect(agent.activeIsValid()).is.true;
      expect(agent.isValid()).is.true;
    });
  });

  context("📋 Utility functions", async function () {
    beforeEach(async function () {
      // Get a list of accounts
      accounts = await getSigners();
      wallet = accounts[1].address;

      // Required constructor params
      id = "2";
      active = true;
      feePercentage = "500"; //5%

      // Create a valid agent, then set fields in tests directly
      agent = new Agent(id, feePercentage, wallet, active);
      expect(agent.isValid()).is.true;

      // Get plain object
      object = {
        id,
        feePercentage,
        wallet,
        active,
      };

      // Struct representation
      struct = [id, feePercentage, wallet, active];
    });

    context("👉 Static", async function () {
      it("Agent.fromObject() should return an Agent instance with the same values as the given plain object", async function () {
        // Promote to instance
        promoted = Agent.fromObject(object);

        // Is an Agent instance
        expect(promoted instanceof Agent).is.true;

        // Key values all match
        for ([key, value] of Object.entries(agent)) {
          expect(JSON.stringify(promoted[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("Agent.fromStruct() should return an Agent instance from a struct representation", async function () {
        // Get an instance from the struct
        agent = Agent.fromStruct(struct);

        // Ensure it is valid
        expect(agent.isValid()).to.be.true;
      });
    });

    context("👉 Instance", async function () {
      it("instance.toString() should return a JSON string representation of the Agent instance", async function () {
        dehydrated = agent.toString();
        rehydrated = JSON.parse(dehydrated);

        for ([key, value] of Object.entries(agent)) {
          expect(JSON.stringify(rehydrated[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.toObject() should return a plain object representation of the Agent instance", async function () {
        // Get plain object
        object = agent.toObject();

        // Not an Agent instance
        expect(object instanceof Agent).is.false;

        // Key values all match
        for ([key, value] of Object.entries(agent)) {
          expect(JSON.stringify(object[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("Agent.toStruct() should return a struct representation of the Agent instance", async function () {
        // Get struct from agent
        struct = agent.toStruct();

        // Marshal back to an agent instance
        agent = Agent.fromStruct(struct);

        // Ensure it marshals back to a valid agent
        expect(agent.isValid()).to.be.true;
      });

      it("instance.clone() should return another Agent instance with the same property values", async function () {
        // Get plain object
        clone = agent.clone();

        // Is an Agent instance
        expect(clone instanceof Agent).is.true;

        // Key values all match
        for ([key, value] of Object.entries(agent)) {
          expect(JSON.stringify(clone[key]) === JSON.stringify(value)).is.true;
        }
      });
    });
  });
});
