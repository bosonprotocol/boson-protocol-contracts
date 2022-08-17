const hre = require("hardhat");
const ethers = hre.ethers;
const { expect } = require("chai");

const Role = require("../../scripts/domain/Role");
const Agent = require("../../scripts/domain/Agent");
const PausableRegion = require("../../scripts/domain/PausableRegion.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");
const { deployProtocolDiamond } = require("../../scripts/util/deploy-protocol-diamond.js");
const { deployProtocolHandlerFacets } = require("../../scripts/util/deploy-protocol-handler-facets.js");
const { deployProtocolConfigFacet } = require("../../scripts/util/deploy-protocol-config-facet.js");
const { deployProtocolClients } = require("../../scripts/util/deploy-protocol-clients");
const { oneMonth } = require("../utils/constants");
const { mockAgent } = require("../utils/mock");

/**
 *  Test the Boson Agent Handler
 */
describe("AgentHandler", function () {
  // Common vars
  let deployer, pauser, rando, other1, other2, other3;
  let protocolDiamond, accessController, accountHandler, pauseHandler, gasLimit;
  let agent, agentStruct, agent2, agent2Struct, expectedAgent, expectedAgentStruct;
  let nextAccountId;
  let invalidAccountId, id, id2, key, value, exists;
  let protocolFeePercentage, protocolFeeFlatBoson, buyerEscalationDepositPercentage;

  beforeEach(async function () {
    // Make accounts available
    [deployer, pauser, rando, other1, other2, other3] = await ethers.getSigners();

    // Deploy the Protocol Diamond
    [protocolDiamond, , , , accessController] = await deployProtocolDiamond();

    // Temporarily grant UPGRADER role to deployer account
    await accessController.grantRole(Role.UPGRADER, deployer.address);

    // Grant PROTOCOL role to ProtocolDiamond address and renounces admin
    await accessController.grantRole(Role.PROTOCOL, protocolDiamond.address);

    // Temporarily grant PAUSER role to pauser account
    await accessController.grantRole(Role.PAUSER, pauser.address);

    // Cut the protocol handler facets into the Diamond
    await deployProtocolHandlerFacets(protocolDiamond, [
      "AccountHandlerFacet",
      "AgentHandlerFacet",
      "PauseHandlerFacet",
    ]);

    // Deploy the Protocol client implementation/proxy pairs (currently just the Boson Voucher)
    const protocolClientArgs = [accessController.address, protocolDiamond.address];
    const [, beacons, proxies] = await deployProtocolClients(protocolClientArgs, gasLimit);
    const [beacon] = beacons;
    const [proxy] = proxies;

    // set protocolFees
    protocolFeePercentage = "200"; // 2 %
    protocolFeeFlatBoson = ethers.utils.parseUnits("0.01", "ether").toString();
    buyerEscalationDepositPercentage = "1000"; // 10%

    // Add config Handler, so ids start at 1, and so voucher address can be found
    const protocolConfig = [
      // Protocol addresses
      {
        treasury: ethers.constants.AddressZero,
        token: ethers.constants.AddressZero,
        voucherBeacon: beacon.address,
        beaconProxy: proxy.address,
      },
      // Protocol limits
      {
        maxExchangesPerBatch: 0,
        maxOffersPerGroup: 0,
        maxTwinsPerBundle: 0,
        maxOffersPerBundle: 0,
        maxOffersPerBatch: 0,
        maxTokensPerWithdrawal: 0,
        maxFeesPerDisputeResolver: 100,
        maxEscalationResponsePeriod: oneMonth,
        maxDisputesPerBatch: 0,
        maxAllowedSellers: 100,
        maxTotalOfferFeePercentage: 4000, //40%
        maxRoyaltyPecentage: 1000, //10%
      },
      // Protocol fees
      {
        percentage: protocolFeePercentage,
        flatBoson: protocolFeeFlatBoson,
      },
      buyerEscalationDepositPercentage,
    ];

    await deployProtocolConfigFacet(protocolDiamond, protocolConfig, gasLimit);

    // Cast Diamond to IBosonAccountHandler
    accountHandler = await ethers.getContractAt("IBosonAccountHandler", protocolDiamond.address);

    // Cast Diamond to IBosonPauseHandler
    pauseHandler = await ethers.getContractAt("IBosonPauseHandler", protocolDiamond.address);
  });

  // All supported Agent methods
  context("📋 Agent Methods", async function () {
    beforeEach(async function () {
      // The first agent id
      nextAccountId = "1";
      invalidAccountId = "666";

      // Create a valid agent, then set fields in tests directly
      agent = mockAgent(other1.address);
      expect(agent.isValid()).is.true;

      // How that agent looks as a returned struct
      agentStruct = agent.toStruct();
    });

    context("👉 createAgent()", async function () {
      it("should emit a AgentCreated event", async function () {
        // Create an agent, testing for the event
        await expect(accountHandler.connect(rando).createAgent(agent))
          .to.emit(accountHandler, "AgentCreated")
          .withArgs(agent.id, agentStruct, rando.address);
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
          .withArgs(nextAccountId, agentStruct, rando.address);

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
          .withArgs(nextAccountId, agentStruct, rando.address);

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
          .withArgs(nextAccountId, agentStruct, rando.address);

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
          await expect(accountHandler.connect(rando).createAgent(agent)).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("active is false", async function () {
          agent.active = false;

          // Attempt to Create an Agent, expecting revert
          await expect(accountHandler.connect(rando).createAgent(agent)).to.revertedWith(RevertReasons.MUST_BE_ACTIVE);
        });

        it("addresses are the zero address", async function () {
          agent.wallet = ethers.constants.AddressZero;

          // Attempt to Create an Agent, expecting revert
          await expect(accountHandler.connect(rando).createAgent(agent)).to.revertedWith(RevertReasons.INVALID_ADDRESS);
        });

        it("wallet address is not unique to this agentId", async function () {
          // Create an agent
          await accountHandler.connect(rando).createAgent(agent);

          // Attempt to create another buyer with same wallet address
          await expect(accountHandler.connect(rando).createAgent(agent)).to.revertedWith(
            RevertReasons.AGENT_ADDRESS_MUST_BE_UNIQUE
          );
        });

        it("feePercentage plus protocol fee percentage is above max", async function () {
          //Agent with feePercentage that, when added to the protocol fee percentage is above the maxTotalOfferFeePercentage
          //protocol fee percentage = 200 (2%), max = 4000 (40%)
          agent.feePercentage = "3900";
          expect(agent.isValid()).is.true;

          // Attempt to create another buyer with same wallet address
          await expect(accountHandler.connect(rando).createAgent(agent)).to.revertedWith(
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
        agent.wallet = other2.address;
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
          .withArgs(agent.id, expectedAgentStruct, other1.address);
      });

      it("should emit an AgentUpdated event with correct values if values stay the same", async function () {
        //Update a agent, testing for the event
        await expect(accountHandler.connect(other1).updateAgent(agent))
          .to.emit(accountHandler, "AgentUpdated")
          .withArgs(agent.id, agentStruct, other1.address);
      });

      it("should update state of all fields except Id and active flag", async function () {
        agent.wallet = other2.address;
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
        agent.wallet = other2.address;
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
        agent2 = mockAgent(other3.address);
        agent2.id = id2.toString();
        expect(agent2.isValid()).is.true;

        agent2Struct = agent2.toStruct();

        //Create agent2, testing for the event
        await expect(accountHandler.connect(rando).createAgent(agent2))
          .to.emit(accountHandler, "AgentCreated")
          .withArgs(agent2.id, agent2Struct, rando.address);

        //Update first agent
        agent.wallet = other2.address;
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
        agent.wallet = other2.address;
        agentStruct = agent.toStruct();

        // Update agent, testing for the event
        await expect(accountHandler.connect(other1).updateAgent(agent))
          .to.emit(accountHandler, "AgentUpdated")
          .withArgs(agent.id, agentStruct, other1.address);

        agent.wallet = other3.address;
        agentStruct = agent.toStruct();

        // Update agent, testing for the event
        await expect(accountHandler.connect(other2).updateAgent(agent))
          .to.emit(accountHandler, "AgentUpdated")
          .withArgs(agent.id, agentStruct, other2.address);

        // Attempt to update the agent with original wallet address, expecting revert
        await expect(accountHandler.connect(other1).updateAgent(agent)).to.revertedWith(RevertReasons.NOT_AGENT_WALLET);
      });

      it("should allow feePercentage of 0", async function () {
        agent.feePercentage = "0";
        expect(agent.isValid()).is.true;
        agentStruct = agent.toStruct();

        // Update agent, testing for the event
        await expect(accountHandler.connect(other1).updateAgent(agent))
          .to.emit(accountHandler, "AgentUpdated")
          .withArgs(agent.id, agentStruct, other1.address);

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
          .withArgs(agent.id, agentStruct, other1.address);

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
          await expect(accountHandler.connect(other1).updateAgent(agent)).to.revertedWith(RevertReasons.REGION_PAUSED);
        });

        it("Agent does not exist", async function () {
          // Set invalid id
          agent.id = "444";

          // Attempt to update the agent, expecting revert
          await expect(accountHandler.connect(other1).updateAgent(agent)).to.revertedWith(RevertReasons.NO_SUCH_AGENT);

          // Set invalid id
          agent.id = "0";

          // Attempt to update the agent, expecting revert
          await expect(accountHandler.connect(other1).updateAgent(agent)).to.revertedWith(RevertReasons.NO_SUCH_AGENT);
        });

        it("Caller is not agent wallet address", async function () {
          // Attempt to update the agent, expecting revert
          await expect(accountHandler.connect(other2).updateAgent(agent)).to.revertedWith(
            RevertReasons.NOT_AGENT_WALLET
          );
        });

        it("wallet address is the zero address", async function () {
          agent.wallet = ethers.constants.AddressZero;

          // Attempt to update the agent, expecting revert
          await expect(accountHandler.connect(other1).updateAgent(agent)).to.revertedWith(
            RevertReasons.INVALID_ADDRESS
          );
        });

        it("feePercentage plus protocol fee percentage is above max", async function () {
          //Agent with feePercentage that, when added to the protocol fee percentage is above the maxTotalOfferFeePercentage
          //protocol fee percentage = 200 (2%), max = 4000 (40%)
          agent.feePercentage = "3900"; //39%
          expect(agent.isValid()).is.true;

          // Attempt to update the agent, expecting revert
          await expect(accountHandler.connect(other1).updateAgent(agent)).to.revertedWith(
            RevertReasons.INVALID_AGENT_FEE_PERCENTAGE
          );
        });

        it("wallet address is not unique to this agent Id", async function () {
          id = await accountHandler.connect(rando).getNextAccountId();

          agent2 = mockAgent(other2.address);
          agent2.id = id.toString();

          agent2Struct = agent2.toStruct();

          //Create second agent, testing for the event
          await expect(accountHandler.connect(rando).createAgent(agent2))
            .to.emit(accountHandler, "AgentCreated")
            .withArgs(agent2.id, agent2Struct, rando.address);

          //Set wallet address value to be same as first agent created in Agent Methods beforeEach
          agent2.wallet = other1.address; //already being used by agent 1

          // Attempt to update agent 2 with non-unique wallet address, expecting revert
          await expect(accountHandler.connect(other2).updateAgent(agent2)).to.revertedWith(
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
