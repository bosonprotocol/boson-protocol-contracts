const { ethers } = require("hardhat");
const { ZeroAddress, getContractAt } = ethers;
const { expect } = require("chai");

const Agent = require("../../scripts/domain/Agent");
const PausableRegion = require("../../scripts/domain/PausableRegion.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { mockAgent, accountId } = require("../util/mock");
const { setupTestEnvironment, getSnapshot, revertToSnapshot } = require("../util/utils");

/**
 *  Test the Boson Agent Handler
 */
describe("AgentHandler", function () {
  accountId.next(true);

  // Common vars
  let pauser, rando, other1, other2, other3;
  let accountHandler, pauseHandler;
  let agent, agentStruct, agent2, agent2Struct, expectedAgent, expectedAgentStruct;
  let nextAccountId;
  let invalidAccountId, id, id2, key, value, exists;
  let snapshotId;
  let bosonErrors;

  before(async function () {
    // Specify contracts needed for this test
    const contracts = {
      accountHandler: "IBosonAccountHandler",
      pauseHandler: "IBosonPauseHandler",
    };

    ({
      signers: [pauser, rando, other1, other2, other3],
      contractInstances: { accountHandler, pauseHandler },
    } = await setupTestEnvironment(contracts));

    bosonErrors = await getContractAt("BosonErrors", await accountHandler.getAddress());

    // Get snapshot id
    snapshotId = await getSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(snapshotId);
    snapshotId = await getSnapshot();
  });

  // All supported Agent methods
  context("📋 Agent Methods", async function () {
    beforeEach(async function () {
      // The first agent id
      nextAccountId = "1";
      invalidAccountId = "666";

      // Create a valid agent, then set fields in tests directly
      agent = mockAgent(await other1.getAddress());
      expect(agent.isValid()).is.true;

      // How that agent looks as a returned struct
      agentStruct = agent.toStruct();
    });

    afterEach(async function () {
      // Reset the accountId iterator
      accountId.next(true);
    });

    context("👉 createAgent()", async function () {
      it("should emit a AgentCreated event", async function () {
        // Create an agent, testing for the event
        await expect(accountHandler.connect(rando).createAgent(agent))
          .to.emit(accountHandler, "AgentCreated")
          .withArgs(agent.id, agentStruct, await rando.getAddress());
      });

      it("should update state", async function () {
        // Create an agent
        await accountHandler.connect(rando).createAgent(agent);

        // Get the agent as a struct
        [, agentStruct] = await accountHandler.connect(rando).getAgent(agent.id);

        // Parse into entity
        let returnedAgent = Agent.fromStruct(agentStruct);

        // Returned values should match the input in createAgent
        for ([key, value] of Object.entries(agent)) {
          expect(JSON.stringify(returnedAgent[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should ignore any provided id and assign the next available", async function () {
        agent.id = "444";

        // Create an agent, testing for the event
        await expect(accountHandler.connect(rando).createAgent(agent))
          .to.emit(accountHandler, "AgentCreated")
          .withArgs(nextAccountId, agentStruct, await rando.getAddress());

        // wrong agent id should not exist
        [exists] = await accountHandler.connect(rando).getAgent(agent.id);
        expect(exists).to.be.false;

        // next agent id should exist
        [exists] = await accountHandler.connect(rando).getAgent(nextAccountId);
        expect(exists).to.be.true;
      });

      it("should allow feePercentage of 0", async function () {
        // Create a valid agent with feePercentage = 0, as it is optional
        agent.feePercentage = "0";
        expect(agent.isValid()).is.true;

        // How that agent looks as a returned struct
        agentStruct = agent.toStruct();

        // Create an agent, testing for the event
        await expect(accountHandler.connect(rando).createAgent(agent))
          .to.emit(accountHandler, "AgentCreated")
          .withArgs(nextAccountId, agentStruct, await rando.getAddress());

        // Get the agent as a struct
        [, agentStruct] = await accountHandler.connect(rando).getAgent(agent.id);

        // Parse into entity
        let returnedAgent = Agent.fromStruct(agentStruct);

        // Returned values should match the input in createAgent
        for ([key, value] of Object.entries(agent)) {
          expect(JSON.stringify(returnedAgent[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should allow feePercentage plus protocol fee percentage == max", async function () {
        //Agent with feePercentage that, when added to the protocol fee percentage = maxTotalOfferFeePercentage
        //protocol fee percentage = 200 (2%), max = 4000 (40%)
        agent.feePercentage = "3800";
        expect(agent.isValid()).is.true;

        // How that agent looks as a returned struct
        agentStruct = agent.toStruct();

        // Create an agent, testing for the event
        await expect(accountHandler.connect(rando).createAgent(agent))
          .to.emit(accountHandler, "AgentCreated")
          .withArgs(nextAccountId, agentStruct, await rando.getAddress());

        // Get the agent as a struct
        [, agentStruct] = await accountHandler.connect(rando).getAgent(agent.id);

        // Parse into entity
        let returnedAgent = Agent.fromStruct(agentStruct);

        // Returned values should match the input in createAgent
        for ([key, value] of Object.entries(agent)) {
          expect(JSON.stringify(returnedAgent[key]) === JSON.stringify(value)).is.true;
        }
      });

      context("💔 Revert Reasons", async function () {
        it("The agents region of protocol is paused", async function () {
          // Pause the agents region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Agents]);

          // Attempt to create an agent, expecting revert
          await expect(accountHandler.connect(rando).createAgent(agent))
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Agents);
        });

        it("active is false", async function () {
          agent.active = false;

          // Attempt to Create an Agent, expecting revert
          await expect(accountHandler.connect(rando).createAgent(agent)).to.revertedWithCustomError(
            bosonErrors,
            RevertReasons.MUST_BE_ACTIVE
          );
        });

        it("addresses are the zero address", async function () {
          agent.wallet = ZeroAddress;

          // Attempt to Create an Agent, expecting revert
          await expect(accountHandler.connect(rando).createAgent(agent)).to.revertedWithCustomError(
            bosonErrors,
            RevertReasons.INVALID_ADDRESS
          );
        });

        it("wallet address is not unique to this agentId", async function () {
          // Create an agent
          await accountHandler.connect(rando).createAgent(agent);

          // Attempt to create another buyer with same wallet address
          await expect(accountHandler.connect(rando).createAgent(agent)).to.revertedWithCustomError(
            bosonErrors,
            RevertReasons.AGENT_ADDRESS_MUST_BE_UNIQUE
          );
        });

        it("feePercentage plus protocol fee percentage is above max", async function () {
          //Agent with feePercentage that, when added to the protocol fee percentage is above the maxTotalOfferFeePercentage
          //protocol fee percentage = 200 (2%), max = 4000 (40%)
          agent.feePercentage = "3900";
          expect(agent.isValid()).is.true;

          // Attempt to create another buyer with same wallet address
          await expect(accountHandler.connect(rando).createAgent(agent)).to.revertedWithCustomError(
            bosonErrors,
            RevertReasons.INVALID_AGENT_FEE_PERCENTAGE
          );
        });
      });
    });

    context("👉 updateAgent()", async function () {
      beforeEach(async function () {
        // Create an agent
        await accountHandler.connect(rando).createAgent(agent);

        // id of the current agent and increment nextAccountId
        id = nextAccountId++;
      });

      it("should emit an AgentUpdated event with correct values if values change", async function () {
        agent.wallet = await other2.getAddress();
        agent.active = false;
        agent.feePercentage = "3000"; //30%
        expect(agent.isValid()).is.true;

        //Update should not change id or active flag
        expectedAgent = agent.clone();
        expectedAgent.active = true;
        expect(expectedAgent.isValid()).is.true;
        expectedAgentStruct = expectedAgent.toStruct();

        //Update a agent, testing for the event
        await expect(accountHandler.connect(other1).updateAgent(agent))
          .to.emit(accountHandler, "AgentUpdated")
          .withArgs(agent.id, expectedAgentStruct, await other1.getAddress());
      });

      it("should emit an AgentUpdated event with correct values if values stay the same", async function () {
        //Update a agent, testing for the event
        await expect(accountHandler.connect(other1).updateAgent(agent))
          .to.emit(accountHandler, "AgentUpdated")
          .withArgs(agent.id, agentStruct, await other1.getAddress());
      });

      it("should update state of all fields except Id and active flag", async function () {
        agent.wallet = await other2.getAddress();
        agent.active = false;
        agent.feePercentage = "3000"; //30%
        expect(agent.isValid()).is.true;

        //Update should not change id or active flag
        expectedAgent = agent.clone();
        expectedAgent.active = true;
        expect(expectedAgent.isValid()).is.true;

        // Update agent
        await accountHandler.connect(other1).updateAgent(agent);

        // Get the agent as a struct
        [, agentStruct] = await accountHandler.connect(rando).getAgent(agent.id);

        // Parse into entity
        let returnedAgent = Agent.fromStruct(agentStruct);

        // Returned values should match the expected values
        for ([key, value] of Object.entries(expectedAgent)) {
          expect(JSON.stringify(returnedAgent[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should update state correctly if values are the same", async function () {
        // Update agent
        await accountHandler.connect(other1).updateAgent(agent);

        // Get the agent as a struct
        [, agentStruct] = await accountHandler.connect(rando).getAgent(agent.id);

        // Parse into entity
        let returnedAgent = Agent.fromStruct(agentStruct);

        // Returned values should match the input in updateAgent
        for ([key, value] of Object.entries(agent)) {
          expect(JSON.stringify(returnedAgent[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should update only feePercentage", async function () {
        agent.feePercentage = "3000"; //30%
        expect(agent.isValid()).is.true;

        agentStruct = agent.toStruct();

        // Update agent
        await accountHandler.connect(other1).updateAgent(agent);

        // Get the agent as a struct
        [, agentStruct] = await accountHandler.connect(rando).getAgent(agent.id);

        // Parse into entity
        let returnedAgent = Agent.fromStruct(agentStruct);

        // Returned values should match the input in updateAgent
        for ([key, value] of Object.entries(agent)) {
          expect(JSON.stringify(returnedAgent[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should update only wallet address", async function () {
        agent.wallet = await other2.getAddress();
        expect(agent.isValid()).is.true;

        agentStruct = agent.toStruct();

        // Update agent
        await accountHandler.connect(other1).updateAgent(agent);

        // Get the agent as a struct
        [, agentStruct] = await accountHandler.connect(rando).getAgent(agent.id);

        // Parse into entity
        let returnedAgent = Agent.fromStruct(agentStruct);

        // Returned values should match the input in updateAgent
        for ([key, value] of Object.entries(agent)) {
          expect(JSON.stringify(returnedAgent[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should update the correct agent", async function () {
        // Confgiure another agent
        id2 = nextAccountId++;
        agent2 = mockAgent(await other3.getAddress());
        agent2.id = id2.toString();
        expect(agent2.isValid()).is.true;

        agent2Struct = agent2.toStruct();

        //Create agent2, testing for the event
        await expect(accountHandler.connect(rando).createAgent(agent2))
          .to.emit(accountHandler, "AgentCreated")
          .withArgs(agent2.id, agent2Struct, await rando.getAddress());

        //Update first agent
        agent.wallet = await other2.getAddress();
        agent.feePercentage = "3000"; //30%
        expect(agent.isValid()).is.true;

        // Update agent
        await accountHandler.connect(other1).updateAgent(agent);

        // Get the first agent as a struct
        [, agentStruct] = await accountHandler.connect(rando).getAgent(agent.id);

        // Parse into entity
        let returnedAgent = Agent.fromStruct(agentStruct);

        // Returned values should match the input in updateAgent
        for ([key, value] of Object.entries(agent)) {
          expect(JSON.stringify(returnedAgent[key]) === JSON.stringify(value)).is.true;
        }

        //Check agent hasn't been changed
        [, agent2Struct] = await accountHandler.connect(rando).getAgent(agent2.id);

        // Parse into entity
        let returnedSeller2 = Agent.fromStruct(agent2Struct);

        //returnedSeller2 should still contain original values
        for ([key, value] of Object.entries(agent2)) {
          expect(JSON.stringify(returnedSeller2[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should be able to only update second time with new wallet address", async function () {
        agent.wallet = await other2.getAddress();
        agentStruct = agent.toStruct();

        // Update agent, testing for the event
        await expect(accountHandler.connect(other1).updateAgent(agent))
          .to.emit(accountHandler, "AgentUpdated")
          .withArgs(agent.id, agentStruct, await other1.getAddress());

        agent.wallet = await other3.getAddress();
        agentStruct = agent.toStruct();

        // Update agent, testing for the event
        await expect(accountHandler.connect(other2).updateAgent(agent))
          .to.emit(accountHandler, "AgentUpdated")
          .withArgs(agent.id, agentStruct, await other2.getAddress());

        // Attempt to update the agent with original wallet address, expecting revert
        await expect(accountHandler.connect(other1).updateAgent(agent)).to.revertedWithCustomError(
          bosonErrors,
          RevertReasons.NOT_AGENT_WALLET
        );
      });

      it("should allow feePercentage of 0", async function () {
        agent.feePercentage = "0";
        expect(agent.isValid()).is.true;
        agentStruct = agent.toStruct();

        // Update agent, testing for the event
        await expect(accountHandler.connect(other1).updateAgent(agent))
          .to.emit(accountHandler, "AgentUpdated")
          .withArgs(agent.id, agentStruct, await other1.getAddress());

        // Get the agent as a struct
        [, agentStruct] = await accountHandler.connect(rando).getAgent(id);

        // Parse into entity
        let returnedAgent = Agent.fromStruct(agentStruct);

        // Returned values should match the input in createAgent
        for ([key, value] of Object.entries(agent)) {
          expect(JSON.stringify(returnedAgent[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("should allow feePercentage plus protocol fee percentage == max", async function () {
        //Agent with feePercentage that, when added to the protocol fee percentage = maxTotalOfferFeePercentage
        //protocol fee percentage = 200 (2%), max = 4000 (40%)
        agent.feePercentage = "3800";
        expect(agent.isValid()).is.true;
        agentStruct = agent.toStruct();

        // Update agent, testing for the event
        await expect(accountHandler.connect(other1).updateAgent(agent))
          .to.emit(accountHandler, "AgentUpdated")
          .withArgs(agent.id, agentStruct, await other1.getAddress());

        // Get the agent as a struct
        [, agentStruct] = await accountHandler.connect(rando).getAgent(id);

        // Parse into entity
        let returnedAgent = Agent.fromStruct(agentStruct);

        // Returned values should match the input in createAgent
        for ([key, value] of Object.entries(agent)) {
          expect(JSON.stringify(returnedAgent[key]) === JSON.stringify(value)).is.true;
        }
      });

      context("💔 Revert Reasons", async function () {
        it("The agents region of protocol is paused", async function () {
          // Pause the agents region of the protocol
          await pauseHandler.connect(pauser).pause([PausableRegion.Agents]);

          // Attempt to update an agent, expecting revert
          await expect(accountHandler.connect(other1).updateAgent(agent))
            .to.revertedWithCustomError(bosonErrors, RevertReasons.REGION_PAUSED)
            .withArgs(PausableRegion.Agents);
        });

        it("Agent does not exist", async function () {
          // Set invalid id
          agent.id = "444";

          // Attempt to update the agent, expecting revert
          await expect(accountHandler.connect(other1).updateAgent(agent)).to.revertedWithCustomError(
            bosonErrors,
            RevertReasons.NO_SUCH_AGENT
          );

          // Set invalid id
          agent.id = "0";

          // Attempt to update the agent, expecting revert
          await expect(accountHandler.connect(other1).updateAgent(agent)).to.revertedWithCustomError(
            bosonErrors,
            RevertReasons.NO_SUCH_AGENT
          );
        });

        it("Caller is not agent wallet address", async function () {
          // Attempt to update the agent, expecting revert
          await expect(accountHandler.connect(other2).updateAgent(agent)).to.revertedWithCustomError(
            bosonErrors,
            RevertReasons.NOT_AGENT_WALLET
          );
        });

        it("wallet address is the zero address", async function () {
          agent.wallet = ZeroAddress;

          // Attempt to update the agent, expecting revert
          await expect(accountHandler.connect(other1).updateAgent(agent)).to.revertedWithCustomError(
            bosonErrors,
            RevertReasons.INVALID_ADDRESS
          );
        });

        it("feePercentage plus protocol fee percentage is above max", async function () {
          //Agent with feePercentage that, when added to the protocol fee percentage is above the maxTotalOfferFeePercentage
          //protocol fee percentage = 200 (2%), max = 4000 (40%)
          agent.feePercentage = "3900"; //39%
          expect(agent.isValid()).is.true;

          // Attempt to update the agent, expecting revert
          await expect(accountHandler.connect(other1).updateAgent(agent)).to.revertedWithCustomError(
            bosonErrors,
            RevertReasons.INVALID_AGENT_FEE_PERCENTAGE
          );
        });

        it("wallet address is not unique to this agent Id", async function () {
          id = await accountHandler.connect(rando).getNextAccountId();

          agent2 = mockAgent(await other2.getAddress());
          agent2.id = id.toString();

          agent2Struct = agent2.toStruct();

          //Create second agent, testing for the event
          await expect(accountHandler.connect(rando).createAgent(agent2))
            .to.emit(accountHandler, "AgentCreated")
            .withArgs(agent2.id, agent2Struct, await rando.getAddress());

          //Set wallet address value to be same as first agent created in Agent Methods beforeEach
          agent2.wallet = await other1.getAddress(); //already being used by agent 1

          // Attempt to update agent 2 with non-unique wallet address, expecting revert
          await expect(accountHandler.connect(other2).updateAgent(agent2)).to.revertedWithCustomError(
            bosonErrors,
            RevertReasons.AGENT_ADDRESS_MUST_BE_UNIQUE
          );
        });
      });
    });

    context("👉 getAgent()", async function () {
      beforeEach(async function () {
        // Create a agent
        await accountHandler.connect(rando).createAgent(agent);

        // id of the current agent and increment nextAccountId
        id = nextAccountId++;
      });

      it("should return true for exists if agent is found", async function () {
        // Get the exists flag
        [exists] = await accountHandler.connect(rando).getAgent(id);

        // Validate
        expect(exists).to.be.true;
      });

      it("should return false for exists if agent is not found", async function () {
        // Get the exists flag
        [exists] = await accountHandler.connect(rando).getAgent(invalidAccountId);

        // Validate
        expect(exists).to.be.false;
      });

      it("should return the details of the agent as a struct if found", async function () {
        // Get the agent as a struct
        [, agentStruct] = await accountHandler.connect(rando).getAgent(id);

        // Parse into entity
        agent = Agent.fromStruct(agentStruct);

        // Validate
        expect(agent.isValid()).to.be.true;
      });
    });
  });
});
