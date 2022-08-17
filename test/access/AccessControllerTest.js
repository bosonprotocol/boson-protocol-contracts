const hre = require("hardhat");
const ethers = hre.ethers;
const { expect } = require("chai");
const Role = require("../../scripts/domain/Role");

/**
 *  Test the AccessController contract
 */
describe("AccessController", function () {
  // Shared args
  let deployer, admin, protocol, upgrader, associate, pauser, client, feeCollector;
  let AccessController, accessController, roleAdmin;

  beforeEach(async function () {
    // Make accounts available
    [deployer, admin, protocol, upgrader, associate, pauser, client, feeCollector] = await ethers.getSigners();

    // Deploy the contract
    AccessController = await ethers.getContractFactory("AccessController");
    accessController = await AccessController.deploy();
    await accessController.deployed();
  });

  context("📋 Deployer is limited to initial ADMIN role", async function () {
    it("Deployer should have ADMIN role", async function () {
      // Check role
      expect(await accessController.hasRole(Role.ADMIN, deployer.address), "Deployer doesn't have ADMIN role").is.true;
    });

    it("Deployer should not have PROTOCOL role", async function () {
      // Check role
      expect(await accessController.hasRole(Role.PROTOCOL, deployer.address), "Deployer has PROTOCOL role").is.false;
    });

    it("Deployer should not have UPGRADER role", async function () {
      // Check role
      expect(await accessController.hasRole(Role.UPGRADER, deployer.address), "Deployer has UPGRADER role").is.false;
    });

    it("Deployer should not have PAUSER role", async function () {
      // Check role
      expect(await accessController.hasRole(Role.PAUSER, deployer.address), "Deployer has PAUSER role").is.false;
    });

    it("Deployer should not have CLIENT role", async function () {
      // Check role
      expect(await accessController.hasRole(Role.CLIENT, deployer.address), "Deployer has CLIENT role").is.false;
    });

    it("Deployer should not have FEE_COLLECTOR role", async function () {
      // Check role
      expect(
        await accessController.hasRole(Role.FEE_COLLECTOR, deployer.address),
        "Deployer has FEE_COLLECTOR role"
      ).is.false;
    });

    it("Deployer should not have any un managed value as role", async function () {
      // Random unknown role
      let role = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("random"));

      // Check role
      expect(await accessController.hasRole(role, deployer.address), "Deployer has a random role").is.false;
    });
  });

  context("📋 ADMIN role is role admin for all other roles", async function () {
    it("ADMIN role should be ADMIN role admin", async function () {
      // Get ADMIN role admin
      roleAdmin = await accessController.getRoleAdmin(Role.ADMIN);

      // Test
      expect(roleAdmin === Role.ADMIN, "ADMIN role isn't ADMIN role admin").is.true;
    });

    it("ADMIN role should be PROTOCOL role admin", async function () {
      // Get PROTOCOL role admin
      roleAdmin = await accessController.getRoleAdmin(Role.PROTOCOL);

      // Test
      expect(roleAdmin === Role.ADMIN, "ADMIN role isn't PROTOCOL role admin").is.true;
    });

    it("ADMIN role should be UPGRADER role admin", async function () {
      // Get UPGRADER role admin
      roleAdmin = await accessController.getRoleAdmin(Role.UPGRADER);

      // Test
      expect(roleAdmin === Role.ADMIN, "ADMIN role isn't UPGRADER role admin").is.true;
    });

    it("ADMIN role should be PAUSER role admin", async function () {
      // Get PAUSER role admin
      roleAdmin = await accessController.getRoleAdmin(Role.PAUSER);

      // Test
      expect(roleAdmin === Role.ADMIN, "ADMIN role isn't PAUSER role admin").is.true;
    });

    it("ADMIN role should be CLIENT role admin", async function () {
      // Get CLIENT role admin
      roleAdmin = await accessController.getRoleAdmin(Role.CLIENT);

      // Test
      expect(roleAdmin === Role.ADMIN, "ADMIN role isn't CLIENT role admin").is.true;
    });

    it("ADMIN role should be FEE_COLLECTOR role admin", async function () {
      // Get FEE_COLLECTOR role admin
      roleAdmin = await accessController.getRoleAdmin(Role.FEE_COLLECTOR);

      // Test
      expect(roleAdmin === Role.ADMIN, "ADMIN role isn't FEE_COLLECTOR role admin").is.true;
    });
  });

  context("📋 Any ADMIN can grant all other roles", async function () {
    beforeEach(async function () {
      // Deployer grants ADMIN to another admin address
      await accessController.grantRole(Role.ADMIN, admin.address);
      expect(await accessController.hasRole(Role.ADMIN, admin.address)).is.true;
    });

    it("ADMIN role should be able to grant ADMIN role", async function () {
      // Grant Role
      try {
        await accessController.connect(admin).grantRole(Role.ADMIN, associate.address);
      } catch (e) {}

      // Test
      expect(
        await accessController.hasRole(Role.ADMIN, associate.address),
        "ADMIN role can't grant ADMIN role"
      ).is.true;
    });

    it("ADMIN role should be able to grant PROTOCOL role", async function () {
      // Grant Role
      try {
        await accessController.connect(admin).grantRole(Role.PROTOCOL, protocol.address);
      } catch (e) {}

      // Test
      expect(
        await accessController.hasRole(Role.PROTOCOL, protocol.address),
        "ADMIN role can't grant PROTOCOL role"
      ).is.true;
    });

    it("ADMIN role should be able to grant UPGRADER role", async function () {
      // Grant Role
      try {
        await accessController.connect(admin).grantRole(Role.UPGRADER, upgrader.address);
      } catch (e) {}

      // Test
      expect(
        await accessController.hasRole(Role.UPGRADER, upgrader.address),
        "ADMIN role can't grant UPGRADER role"
      ).is.true;
    });

    it("ADMIN role should be able to grant PAUSER role", async function () {
      // Grant Role
      try {
        await accessController.connect(admin).grantRole(Role.PAUSER, pauser.address);
      } catch (e) {}

      // Test
      expect(await accessController.hasRole(Role.PAUSER, pauser.address), "ADMIN role can't grant PAUSER role").is.true;
    });

    it("ADMIN role should be able to grant CLIENT role", async function () {
      // Grant Role
      try {
        await accessController.connect(admin).grantRole(Role.CLIENT, client.address);
      } catch (e) {}

      // Test
      expect(await accessController.hasRole(Role.CLIENT, client.address), "ADMIN role can't grant CLIENT role").is.true;
    });

    it("ADMIN role should be able to grant FEE_COLLECTOR role", async function () {
      // Grant Role
      try {
        await accessController.connect(admin).grantRole(Role.FEE_COLLECTOR, feeCollector.address);
      } catch (e) {}

      // Test
      expect(
        await accessController.hasRole(Role.FEE_COLLECTOR, feeCollector.address),
        "ADMIN role can't grant FEE_COLLECTOR role"
      ).is.true;
    });
  });

  context("📋 Any ADMIN can revoke all other roles", async function () {
    beforeEach(async function () {
      // Deployer grants roles to other addresses
      await accessController.connect(deployer).grantRole(Role.ADMIN, admin.address);
      await accessController.connect(deployer).grantRole(Role.PROTOCOL, protocol.address);
      await accessController.connect(deployer).grantRole(Role.UPGRADER, upgrader.address);
      await accessController.connect(deployer).grantRole(Role.PAUSER, pauser.address);
      await accessController.connect(deployer).grantRole(Role.CLIENT, client.address);
      await accessController.connect(deployer).grantRole(Role.FEE_COLLECTOR, feeCollector.address);
    });

    it("ADMIN role should be able to revoke ADMIN role", async function () {
      // Revoke Role
      try {
        await accessController.connect(admin).revokeRole(Role.ADMIN, deployer.address);
      } catch (e) {}

      // Test
      expect(
        await accessController.hasRole(Role.ADMIN, deployer.address),
        "ADMIN role can't revoke ADMIN role"
      ).is.false;
    });

    it("ADMIN role should be able to revoke PROTOCOL role", async function () {
      // Revoke Role
      try {
        await accessController.connect(admin).revokeRole(Role.PROTOCOL, protocol.address);
      } catch (e) {}

      // Test
      expect(
        await accessController.hasRole(Role.PROTOCOL, protocol.address),
        "ADMIN role can't revoke PROTOCOL role"
      ).is.false;
    });

    it("ADMIN role should be able to revoke UPGRADER role", async function () {
      // Revoke Role
      try {
        await accessController.connect(admin).revokeRole(Role.UPGRADER, upgrader.address);
      } catch (e) {}

      // Test
      expect(
        await accessController.hasRole(Role.UPGRADER, upgrader.address),
        "ADMIN role can't revoke UPGRADER role"
      ).is.false;
    });

    it("ADMIN role should be able to revoke PAUSER role", async function () {
      // Revoke Role
      try {
        await accessController.connect(admin).revokeRole(Role.PAUSER, pauser.address);
      } catch (e) {}

      // Test
      expect(
        await accessController.hasRole(Role.PAUSER, pauser.address),
        "ADMIN role can't revoke PAUSER role"
      ).is.false;
    });

    it("ADMIN role should be able to revoke CLIENT role", async function () {
      // Revoke Role
      try {
        await accessController.connect(admin).revokeRole(Role.CLIENT, client.address);
      } catch (e) {}

      // Test
      expect(
        await accessController.hasRole(Role.CLIENT, client.address),
        "ADMIN role can't revoke CLIENT role"
      ).is.false;
    });

    it("ADMIN role should be able to revoke FEE_COLLECTOR role", async function () {
      // Revoke Role
      try {
        await accessController.connect(admin).revokeRole(Role.FEE_COLLECTOR, feeCollector.address);
      } catch (e) {}

      // Test
      expect(
        await accessController.hasRole(Role.FEE_COLLECTOR, feeCollector.address),
        "ADMIN role can't revoke FEE_COLLECTOR role"
      ).is.false;
    });
  });

  context("📋 Any roled address can renounce its roles", async function () {
    beforeEach(async function () {
      // Deployer grants roles to other addresses
      await accessController.connect(deployer).grantRole(Role.ADMIN, admin.address);
      await accessController.connect(deployer).grantRole(Role.PROTOCOL, protocol.address);
      await accessController.connect(deployer).grantRole(Role.UPGRADER, upgrader.address);
      await accessController.connect(deployer).grantRole(Role.PAUSER, pauser.address);
      await accessController.connect(deployer).grantRole(Role.CLIENT, client.address);
      await accessController.connect(deployer).grantRole(Role.FEE_COLLECTOR, feeCollector.address);
    });

    it("ADMIN role should be able to renounce ADMIN role", async function () {
      // Renounce Role
      try {
        await accessController.connect(admin).renounceRole(Role.ADMIN, admin.address);
      } catch (e) {}

      // Test
      expect(
        await accessController.hasRole(Role.ADMIN, admin.address),
        "ADMIN role can't renounce ADMIN role"
      ).is.false;
    });

    it("PROTOCOL role should be able to renounce PROTOCOL role", async function () {
      // Renounce Role
      try {
        await accessController.connect(protocol).renounceRole(Role.PROTOCOL, protocol.address);
      } catch (e) {}

      // Test
      expect(
        await accessController.hasRole(Role.PROTOCOL, protocol.address),
        "PROTOCOL role can't renounce PROTOCOL role"
      ).is.false;
    });

    it("UPGRADER role should be able to renounce UPGRADER role", async function () {
      // Renounce Role
      try {
        await accessController.connect(upgrader).renounceRole(Role.UPGRADER, upgrader.address);
      } catch (e) {}

      // Test
      expect(
        await accessController.hasRole(Role.UPGRADER, upgrader.address),
        "UPGRADER role can't renounce UPGRADER role"
      ).is.false;
    });

    it("PAUSER role should be able to renounce PAUSER role", async function () {
      // Renounce Role
      try {
        await accessController.connect(pauser).renounceRole(Role.PAUSER, pauser.address);
      } catch (e) {}

      // Test
      expect(
        await accessController.hasRole(Role.PAUSER, pauser.address),
        "PAUSER role can't renounce PAUSER role"
      ).is.false;
    });

    it("CLIENT role should be able to renounce CLIENT role", async function () {
      // Renounce Role
      try {
        await accessController.connect(client).renounceRole(Role.CLIENT, client.address);
      } catch (e) {}

      // Test
      expect(
        await accessController.hasRole(Role.CLIENT, client.address),
        "CLIENT role can't renounce CLIENT role"
      ).is.false;
    });

    it("FEE_COLLECTOR role should be able to renounce FEE_COLLECTOR role", async function () {
      // Renounce Role
      try {
        await accessController.connect(feeCollector).renounceRole(Role.FEE_COLLECTOR, feeCollector.address);
      } catch (e) {}

      // Test
      expect(
        await accessController.hasRole(Role.FEE_COLLECTOR, feeCollector.address),
        "FEE_COLLECTOR role can't renounce FEE_COLLECTOR role"
      ).is.false;
    });
  });

  context("📋 Any address can have multiple roles", async function () {
    beforeEach(async function () {
      // Deployer grants ADMIN to another address
      await accessController.connect(deployer).grantRole(Role.ADMIN, admin.address);
    });

    it("ADMIN role should be able to grant multiple roles to same address", async function () {
      // Grant all roles to associate
      try {
        await accessController.connect(admin).grantRole(Role.ADMIN, associate.address);
        await accessController.connect(admin).grantRole(Role.PROTOCOL, associate.address);
        await accessController.connect(admin).grantRole(Role.UPGRADER, associate.address);
        await accessController.connect(admin).grantRole(Role.PAUSER, associate.address);
        await accessController.connect(admin).grantRole(Role.CLIENT, associate.address);
        await accessController.connect(admin).grantRole(Role.FEE_COLLECTOR, associate.address);
      } catch (e) {}

      // Check roles all apply for associate
      expect(await accessController.hasRole(Role.ADMIN, associate.address)).is.true;
      expect(await accessController.hasRole(Role.PROTOCOL, associate.address)).is.true;
      expect(await accessController.hasRole(Role.UPGRADER, associate.address)).is.true;
      expect(await accessController.hasRole(Role.PAUSER, associate.address)).is.true;
      expect(await accessController.hasRole(Role.CLIENT, associate.address)).is.true;
      expect(await accessController.hasRole(Role.FEE_COLLECTOR, associate.address)).is.true;
    });
  });
});
