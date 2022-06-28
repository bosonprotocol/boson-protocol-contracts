const hre = require("hardhat");
const ethers = hre.ethers;
const { expect } = require("chai");
const Role = require("../../scripts/domain/Role");

/**
 *  Test the AccessController contract
 */
describe("AccessController", function () {
  // Shared args
  let deployer, admin, protocol, upgrader, associate;
  let AccessController, accessController, roleAdmin;

  beforeEach(async function () {
    // Make accounts available
    [deployer, admin, protocol, upgrader, associate] = await ethers.getSigners();

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
  });

  context("📋 Any ADMIN can revoke all other roles", async function () {
    beforeEach(async function () {
      // Deployer grants roles to other addresses
      await accessController.connect(deployer).grantRole(Role.ADMIN, admin.address);
      await accessController.connect(deployer).grantRole(Role.PROTOCOL, protocol.address);
      await accessController.connect(deployer).grantRole(Role.UPGRADER, upgrader.address);
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
  });

  context("📋 Any roled address can renounce its roles", async function () {
    beforeEach(async function () {
      // Deployer grants roles to other addresses
      await accessController.connect(deployer).grantRole(Role.ADMIN, admin.address);
      await accessController.connect(deployer).grantRole(Role.PROTOCOL, protocol.address);
      await accessController.connect(deployer).grantRole(Role.UPGRADER, upgrader.address);
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
      } catch (e) {}

      // Check roles all apply for associate
      expect(await accessController.hasRole(Role.ADMIN, associate.address)).is.true;
      expect(await accessController.hasRole(Role.PROTOCOL, associate.address)).is.true;
      expect(await accessController.hasRole(Role.UPGRADER, associate.address)).is.true;
    });
  });
});
