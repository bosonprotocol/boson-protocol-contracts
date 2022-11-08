const hre = require("hardhat");
const ethers = hre.ethers;
const { expect } = require("chai");
const Role = require("../../scripts/domain/Role");
const { getInterfaceIds } = require("../../scripts/config/supported-interfaces.js");
const { RevertReasons } = require("../../scripts/config/revert-reasons.js");

/**
 *  Test the AccessController contract
 */
describe("AccessController", function () {
  // Shared args
  let deployer, admin, protocol, upgrader, associate, pauser, client, feeCollector, rando;
  let AccessController, accessController, roleAdmin;
  let InterfaceIds;

  before(async function () {
    // get interface Ids
    InterfaceIds = await getInterfaceIds();
  });

  beforeEach(async function () {
    // Make accounts available
    [deployer, admin, protocol, upgrader, associate, pauser, client, feeCollector, rando] = await ethers.getSigners();

    // Deploy the contract
    AccessController = await ethers.getContractFactory("AccessController");
    accessController = await AccessController.deploy();
    await accessController.deployed();
  });

  context("📋 Interfaces", async function () {
    context("👉 supportsInterface()", async function () {
      it("should indicate support for IAccessControl interface", async function () {
        // Current interfaceId for IAccessControl
        const support = await accessController.supportsInterface(InterfaceIds.IAccessControl);

        // Test
        expect(support, "IAccessControl interface not supported").is.true;
      });
    });
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
      // Grant Role, expecting the event
      await expect(accessController.connect(admin).grantRole(Role.ADMIN, associate.address))
        .to.emit(accessController, "RoleGranted")
        .withArgs(Role.ADMIN, associate.address, admin.address);

      // Test
      expect(
        await accessController.hasRole(Role.ADMIN, associate.address),
        "ADMIN role can't grant ADMIN role"
      ).is.true;
    });

    it("ADMIN role should be able to grant PROTOCOL role", async function () {
      // Grant Role, expecting the event
      await expect(accessController.connect(admin).grantRole(Role.PROTOCOL, protocol.address))
        .to.emit(accessController, "RoleGranted")
        .withArgs(Role.PROTOCOL, protocol.address, admin.address);

      // Test
      expect(
        await accessController.hasRole(Role.PROTOCOL, protocol.address),
        "ADMIN role can't grant PROTOCOL role"
      ).is.true;
    });

    it("ADMIN role should be able to grant UPGRADER role", async function () {
      // Grant Role, expecting the event
      await expect(accessController.connect(admin).grantRole(Role.UPGRADER, upgrader.address))
        .to.emit(accessController, "RoleGranted")
        .withArgs(Role.UPGRADER, upgrader.address, admin.address);

      // Test
      expect(
        await accessController.hasRole(Role.UPGRADER, upgrader.address),
        "ADMIN role can't grant UPGRADER role"
      ).is.true;
    });

    it("ADMIN role should be able to grant PAUSER role", async function () {
      // Grant Role, expecting the event
      await expect(accessController.connect(admin).grantRole(Role.PAUSER, pauser.address))
        .to.emit(accessController, "RoleGranted")
        .withArgs(Role.PAUSER, pauser.address, admin.address);

      // Test
      expect(await accessController.hasRole(Role.PAUSER, pauser.address), "ADMIN role can't grant PAUSER role").is.true;
    });

    it("ADMIN role should be able to grant CLIENT role", async function () {
      // Grant Role, expecting the event
      await expect(accessController.connect(admin).grantRole(Role.CLIENT, client.address))
        .to.emit(accessController, "RoleGranted")
        .withArgs(Role.CLIENT, client.address, admin.address);

      // Test
      expect(await accessController.hasRole(Role.CLIENT, client.address), "ADMIN role can't grant CLIENT role").is.true;
    });

    it("ADMIN role should be able to grant FEE_COLLECTOR role", async function () {
      // Grant Role, expecting the event
      await expect(accessController.connect(admin).grantRole(Role.FEE_COLLECTOR, feeCollector.address))
        .to.emit(accessController, "RoleGranted")
        .withArgs(Role.FEE_COLLECTOR, feeCollector.address, admin.address);

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
      // Revoke Role, expecting the event
      await expect(accessController.connect(admin).revokeRole(Role.ADMIN, deployer.address))
        .to.emit(accessController, "RoleRevoked")
        .withArgs(Role.ADMIN, deployer.address, admin.address);

      // Test
      expect(
        await accessController.hasRole(Role.ADMIN, deployer.address),
        "ADMIN role can't revoke ADMIN role"
      ).is.false;
    });

    it("ADMIN role should be able to revoke PROTOCOL role", async function () {
      // Revoke Role, expecting the event
      await expect(accessController.connect(admin).revokeRole(Role.PROTOCOL, protocol.address))
        .to.emit(accessController, "RoleRevoked")
        .withArgs(Role.PROTOCOL, protocol.address, admin.address);

      // Test
      expect(
        await accessController.hasRole(Role.PROTOCOL, protocol.address),
        "ADMIN role can't revoke PROTOCOL role"
      ).is.false;
    });

    it("ADMIN role should be able to revoke UPGRADER role", async function () {
      // Revoke Role, expecting the event
      await expect(accessController.connect(admin).revokeRole(Role.UPGRADER, upgrader.address))
        .to.emit(accessController, "RoleRevoked")
        .withArgs(Role.UPGRADER, upgrader.address, admin.address);

      // Test
      expect(
        await accessController.hasRole(Role.UPGRADER, upgrader.address),
        "ADMIN role can't revoke UPGRADER role"
      ).is.false;
    });

    it("ADMIN role should be able to revoke PAUSER role", async function () {
      // Revoke Role, expecting the event
      await expect(accessController.connect(admin).revokeRole(Role.PAUSER, pauser.address))
        .to.emit(accessController, "RoleRevoked")
        .withArgs(Role.PAUSER, pauser.address, admin.address);

      // Test
      expect(
        await accessController.hasRole(Role.PAUSER, pauser.address),
        "ADMIN role can't revoke PAUSER role"
      ).is.false;
    });

    it("ADMIN role should be able to revoke CLIENT role", async function () {
      // Revoke Role, expecting the event
      await expect(accessController.connect(admin).revokeRole(Role.CLIENT, client.address))
        .to.emit(accessController, "RoleRevoked")
        .withArgs(Role.CLIENT, client.address, admin.address);

      // Test
      expect(
        await accessController.hasRole(Role.CLIENT, client.address),
        "ADMIN role can't revoke CLIENT role"
      ).is.false;
    });

    it("ADMIN role should be able to revoke FEE_COLLECTOR role", async function () {
      // Revoke Role, expecting the event
      await expect(accessController.connect(admin).revokeRole(Role.FEE_COLLECTOR, feeCollector.address))
        .to.emit(accessController, "RoleRevoked")
        .withArgs(Role.FEE_COLLECTOR, feeCollector.address, admin.address);

      // Test
      expect(
        await accessController.hasRole(Role.FEE_COLLECTOR, feeCollector.address),
        "ADMIN role can't revoke FEE_COLLECTOR role"
      ).is.false;
    });

    it("Should not emit 'RoleRevoked' event if revoking a role that was not granted", async function () {
      // Revoke Role, should not emit the event
      await expect(accessController.connect(admin).revokeRole(Role.ADMIN, rando.address)).to.not.emit(
        accessController,
        "RoleRevoked"
      );

      // Test
      expect(await accessController.hasRole(Role.ADMIN, rando.address)).is.false;
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
      // Renounce Role, expecting the event
      await expect(accessController.connect(admin).renounceRole(Role.ADMIN, admin.address))
        .to.emit(accessController, "RoleRevoked")
        .withArgs(Role.ADMIN, admin.address, admin.address);

      // Test
      expect(
        await accessController.hasRole(Role.ADMIN, admin.address),
        "ADMIN role can't renounce ADMIN role"
      ).is.false;
    });

    it("PROTOCOL role should be able to renounce PROTOCOL role", async function () {
      // Renounce Role, expecting the event
      await expect(accessController.connect(protocol).renounceRole(Role.PROTOCOL, protocol.address))
        .to.emit(accessController, "RoleRevoked")
        .withArgs(Role.PROTOCOL, protocol.address, protocol.address);

      // Test
      expect(
        await accessController.hasRole(Role.PROTOCOL, protocol.address),
        "PROTOCOL role can't renounce PROTOCOL role"
      ).is.false;
    });

    it("UPGRADER role should be able to renounce UPGRADER role", async function () {
      // Renounce Role, expecting the event
      await expect(accessController.connect(upgrader).renounceRole(Role.UPGRADER, upgrader.address))
        .to.emit(accessController, "RoleRevoked")
        .withArgs(Role.UPGRADER, upgrader.address, upgrader.address);

      // Test
      expect(
        await accessController.hasRole(Role.UPGRADER, upgrader.address),
        "UPGRADER role can't renounce UPGRADER role"
      ).is.false;
    });

    it("PAUSER role should be able to renounce PAUSER role", async function () {
      // Renounce Role, expecting the event
      await expect(accessController.connect(pauser).renounceRole(Role.PAUSER, pauser.address))
        .to.emit(accessController, "RoleRevoked")
        .withArgs(Role.PAUSER, pauser.address, pauser.address);

      // Test
      expect(
        await accessController.hasRole(Role.PAUSER, pauser.address),
        "PAUSER role can't renounce PAUSER role"
      ).is.false;
    });

    it("CLIENT role should be able to renounce CLIENT role", async function () {
      // Renounce Role, expecting the event
      await expect(accessController.connect(client).renounceRole(Role.CLIENT, client.address))
        .to.emit(accessController, "RoleRevoked")
        .withArgs(Role.CLIENT, client.address, client.address);

      // Test
      expect(
        await accessController.hasRole(Role.CLIENT, client.address),
        "CLIENT role can't renounce CLIENT role"
      ).is.false;
    });

    it("FEE_COLLECTOR role should be able to renounce FEE_COLLECTOR role", async function () {
      // Renounce Role, expecting the event
      await expect(accessController.connect(feeCollector).renounceRole(Role.FEE_COLLECTOR, feeCollector.address))
        .to.emit(accessController, "RoleRevoked")
        .withArgs(Role.FEE_COLLECTOR, feeCollector.address, feeCollector.address);

      // Test
      expect(
        await accessController.hasRole(Role.FEE_COLLECTOR, feeCollector.address),
        "FEE_COLLECTOR role can't renounce FEE_COLLECTOR role"
      ).is.false;
    });

    it("Should not emit 'RoleRevoked' event if renouncing a role that was not granted", async function () {
      // Renounce Role, should not emit the event
      await expect(accessController.connect(rando).renounceRole(Role.ADMIN, rando.address)).to.not.emit(
        accessController,
        "RoleRevoked"
      );

      // Test
      expect(await accessController.hasRole(Role.ADMIN, rando.address)).is.false;
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

  context("💔 Revert Reasons", async function () {
    it("Caller is different from account to be renounced", async function () {
      // Renounce Role, expecting revert
      await expect(accessController.connect(admin).renounceRole(Role.ADMIN, deployer.address)).to.be.revertedWith(
        RevertReasons.CAN_ONLY_REVOKE_SELF
      );
    });

    it("Should revert if caller tries to grantRole but doesn't have ADMIN role", async function () {
      // Grant Role, expecting revert
      await expect(accessController.connect(rando).grantRole(Role.ADMIN, rando.address)).to.be.revertedWith(
        `AccessControl: account ${rando.address.toLowerCase()} is missing role ${Role.ADMIN}`
      );
    });
  });
});
