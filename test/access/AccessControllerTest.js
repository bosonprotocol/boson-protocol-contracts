const { ethers } = require("hardhat");
const { getContractFactory, getSigners, keccak256, toUtf8Bytes, ZeroAddress } = ethers;
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
    [deployer, admin, protocol, upgrader, associate, pauser, client, feeCollector, rando] = await getSigners();

    // Deploy the contract
    AccessController = await getContractFactory("AccessController");
    accessController = await AccessController.deploy(deployer.address);
    await accessController.waitForDeployment();
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
      expect(
        await accessController.hasRole(Role.ADMIN, await deployer.getAddress()),
        "Deployer doesn't have ADMIN role"
      ).is.true;
    });

    it("Deployer should not have PROTOCOL role", async function () {
      // Check role
      expect(await accessController.hasRole(Role.PROTOCOL, await deployer.getAddress()), "Deployer has PROTOCOL role")
        .is.false;
    });

    it("Deployer should not have UPGRADER role", async function () {
      // Check role
      expect(await accessController.hasRole(Role.UPGRADER, await deployer.getAddress()), "Deployer has UPGRADER role")
        .is.false;
    });

    it("Deployer should not have PAUSER role", async function () {
      // Check role
      expect(await accessController.hasRole(Role.PAUSER, await deployer.getAddress()), "Deployer has PAUSER role").is
        .false;
    });

    it("Deployer should not have CLIENT role", async function () {
      // Check role
      expect(await accessController.hasRole(Role.CLIENT, await deployer.getAddress()), "Deployer has CLIENT role").is
        .false;
    });

    it("Deployer should not have FEE_COLLECTOR role", async function () {
      // Check role
      expect(
        await accessController.hasRole(Role.FEE_COLLECTOR, await deployer.getAddress()),
        "Deployer has FEE_COLLECTOR role"
      ).is.false;
    });

    it("Deployer should not have any un managed value as role", async function () {
      // Random unknown role
      let role = keccak256(toUtf8Bytes("random"));

      // Check role
      expect(await accessController.hasRole(role, await deployer.getAddress()), "Deployer has a random role").is.false;
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
      await accessController.grantRole(Role.ADMIN, await admin.getAddress());
      expect(await accessController.hasRole(Role.ADMIN, await admin.getAddress())).is.true;
    });

    it("ADMIN role should be able to grant ADMIN role", async function () {
      // Grant Role, expecting the event
      await expect(accessController.connect(admin).grantRole(Role.ADMIN, await associate.getAddress()))
        .to.emit(accessController, "RoleGranted")
        .withArgs(Role.ADMIN, await associate.getAddress(), await admin.getAddress());

      // Test
      expect(
        await accessController.hasRole(Role.ADMIN, await associate.getAddress()),
        "ADMIN role can't grant ADMIN role"
      ).is.true;
    });

    it("ADMIN role should be able to grant PROTOCOL role", async function () {
      // Grant Role, expecting the event
      await expect(accessController.connect(admin).grantRole(Role.PROTOCOL, await protocol.getAddress()))
        .to.emit(accessController, "RoleGranted")
        .withArgs(Role.PROTOCOL, await protocol.getAddress(), await admin.getAddress());

      // Test
      expect(
        await accessController.hasRole(Role.PROTOCOL, await protocol.getAddress()),
        "ADMIN role can't grant PROTOCOL role"
      ).is.true;
    });

    it("ADMIN role should be able to grant UPGRADER role", async function () {
      // Grant Role, expecting the event
      await expect(accessController.connect(admin).grantRole(Role.UPGRADER, await upgrader.getAddress()))
        .to.emit(accessController, "RoleGranted")
        .withArgs(Role.UPGRADER, await upgrader.getAddress(), await admin.getAddress());

      // Test
      expect(
        await accessController.hasRole(Role.UPGRADER, await upgrader.getAddress()),
        "ADMIN role can't grant UPGRADER role"
      ).is.true;
    });

    it("ADMIN role should be able to grant PAUSER role", async function () {
      // Grant Role, expecting the event
      await expect(accessController.connect(admin).grantRole(Role.PAUSER, await pauser.getAddress()))
        .to.emit(accessController, "RoleGranted")
        .withArgs(Role.PAUSER, await pauser.getAddress(), await admin.getAddress());

      // Test
      expect(
        await accessController.hasRole(Role.PAUSER, await pauser.getAddress()),
        "ADMIN role can't grant PAUSER role"
      ).is.true;
    });

    it("ADMIN role should be able to grant CLIENT role", async function () {
      // Grant Role, expecting the event
      await expect(accessController.connect(admin).grantRole(Role.CLIENT, await client.getAddress()))
        .to.emit(accessController, "RoleGranted")
        .withArgs(Role.CLIENT, await client.getAddress(), await admin.getAddress());

      // Test
      expect(
        await accessController.hasRole(Role.CLIENT, await client.getAddress()),
        "ADMIN role can't grant CLIENT role"
      ).is.true;
    });

    it("ADMIN role should be able to grant FEE_COLLECTOR role", async function () {
      // Grant Role, expecting the event
      await expect(accessController.connect(admin).grantRole(Role.FEE_COLLECTOR, await feeCollector.getAddress()))
        .to.emit(accessController, "RoleGranted")
        .withArgs(Role.FEE_COLLECTOR, await feeCollector.getAddress(), await admin.getAddress());

      // Test
      expect(
        await accessController.hasRole(Role.FEE_COLLECTOR, await feeCollector.getAddress()),
        "ADMIN role can't grant FEE_COLLECTOR role"
      ).is.true;
    });
  });

  context("📋 Any ADMIN can revoke all other roles", async function () {
    beforeEach(async function () {
      // Deployer grants roles to other addresses
      await accessController.connect(deployer).grantRole(Role.ADMIN, await admin.getAddress());
      await accessController.connect(deployer).grantRole(Role.PROTOCOL, await protocol.getAddress());
      await accessController.connect(deployer).grantRole(Role.UPGRADER, await upgrader.getAddress());
      await accessController.connect(deployer).grantRole(Role.PAUSER, await pauser.getAddress());
      await accessController.connect(deployer).grantRole(Role.CLIENT, await client.getAddress());
      await accessController.connect(deployer).grantRole(Role.FEE_COLLECTOR, await feeCollector.getAddress());
    });

    it("ADMIN role should be able to revoke ADMIN role", async function () {
      // Revoke Role, expecting the event
      await expect(accessController.connect(admin).revokeRole(Role.ADMIN, await deployer.getAddress()))
        .to.emit(accessController, "RoleRevoked")
        .withArgs(Role.ADMIN, await deployer.getAddress(), await admin.getAddress());

      // Test
      expect(
        await accessController.hasRole(Role.ADMIN, await deployer.getAddress()),
        "ADMIN role can't revoke ADMIN role"
      ).is.false;
    });

    it("ADMIN role should be able to revoke PROTOCOL role", async function () {
      // Revoke Role, expecting the event
      await expect(accessController.connect(admin).revokeRole(Role.PROTOCOL, await protocol.getAddress()))
        .to.emit(accessController, "RoleRevoked")
        .withArgs(Role.PROTOCOL, await protocol.getAddress(), await admin.getAddress());

      // Test
      expect(
        await accessController.hasRole(Role.PROTOCOL, await protocol.getAddress()),
        "ADMIN role can't revoke PROTOCOL role"
      ).is.false;
    });

    it("ADMIN role should be able to revoke UPGRADER role", async function () {
      // Revoke Role, expecting the event
      await expect(accessController.connect(admin).revokeRole(Role.UPGRADER, await upgrader.getAddress()))
        .to.emit(accessController, "RoleRevoked")
        .withArgs(Role.UPGRADER, await upgrader.getAddress(), await admin.getAddress());

      // Test
      expect(
        await accessController.hasRole(Role.UPGRADER, await upgrader.getAddress()),
        "ADMIN role can't revoke UPGRADER role"
      ).is.false;
    });

    it("ADMIN role should be able to revoke PAUSER role", async function () {
      // Revoke Role, expecting the event
      await expect(accessController.connect(admin).revokeRole(Role.PAUSER, await pauser.getAddress()))
        .to.emit(accessController, "RoleRevoked")
        .withArgs(Role.PAUSER, await pauser.getAddress(), await admin.getAddress());

      // Test
      expect(
        await accessController.hasRole(Role.PAUSER, await pauser.getAddress()),
        "ADMIN role can't revoke PAUSER role"
      ).is.false;
    });

    it("ADMIN role should be able to revoke CLIENT role", async function () {
      // Revoke Role, expecting the event
      await expect(accessController.connect(admin).revokeRole(Role.CLIENT, await client.getAddress()))
        .to.emit(accessController, "RoleRevoked")
        .withArgs(Role.CLIENT, await client.getAddress(), await admin.getAddress());

      // Test
      expect(
        await accessController.hasRole(Role.CLIENT, await client.getAddress()),
        "ADMIN role can't revoke CLIENT role"
      ).is.false;
    });

    it("ADMIN role should be able to revoke FEE_COLLECTOR role", async function () {
      // Revoke Role, expecting the event
      await expect(accessController.connect(admin).revokeRole(Role.FEE_COLLECTOR, await feeCollector.getAddress()))
        .to.emit(accessController, "RoleRevoked")
        .withArgs(Role.FEE_COLLECTOR, await feeCollector.getAddress(), await admin.getAddress());

      // Test
      expect(
        await accessController.hasRole(Role.FEE_COLLECTOR, await feeCollector.getAddress()),
        "ADMIN role can't revoke FEE_COLLECTOR role"
      ).is.false;
    });

    it("Should not emit 'RoleRevoked' event if revoking a role that was not granted", async function () {
      // Revoke Role, should not emit the event
      await expect(accessController.connect(admin).revokeRole(Role.ADMIN, await rando.getAddress())).to.not.emit(
        accessController,
        "RoleRevoked"
      );

      // Test
      expect(await accessController.hasRole(Role.ADMIN, await rando.getAddress())).is.false;
    });
  });

  context("📋 Any roled address can renounce its roles", async function () {
    beforeEach(async function () {
      // Deployer grants roles to other addresses
      await accessController.connect(deployer).grantRole(Role.ADMIN, await admin.getAddress());
      await accessController.connect(deployer).grantRole(Role.PROTOCOL, await protocol.getAddress());
      await accessController.connect(deployer).grantRole(Role.UPGRADER, await upgrader.getAddress());
      await accessController.connect(deployer).grantRole(Role.PAUSER, await pauser.getAddress());
      await accessController.connect(deployer).grantRole(Role.CLIENT, await client.getAddress());
      await accessController.connect(deployer).grantRole(Role.FEE_COLLECTOR, await feeCollector.getAddress());
    });

    it("ADMIN role should be able to renounce ADMIN role", async function () {
      // Renounce Role, expecting the event
      await expect(accessController.connect(admin).renounceRole(Role.ADMIN, await admin.getAddress()))
        .to.emit(accessController, "RoleRevoked")
        .withArgs(Role.ADMIN, await admin.getAddress(), await admin.getAddress());

      // Test
      expect(
        await accessController.hasRole(Role.ADMIN, await admin.getAddress()),
        "ADMIN role can't renounce ADMIN role"
      ).is.false;
    });

    it("PROTOCOL role should be able to renounce PROTOCOL role", async function () {
      // Renounce Role, expecting the event
      await expect(accessController.connect(protocol).renounceRole(Role.PROTOCOL, await protocol.getAddress()))
        .to.emit(accessController, "RoleRevoked")
        .withArgs(Role.PROTOCOL, await protocol.getAddress(), await protocol.getAddress());

      // Test
      expect(
        await accessController.hasRole(Role.PROTOCOL, await protocol.getAddress()),
        "PROTOCOL role can't renounce PROTOCOL role"
      ).is.false;
    });

    it("UPGRADER role should be able to renounce UPGRADER role", async function () {
      // Renounce Role, expecting the event
      await expect(accessController.connect(upgrader).renounceRole(Role.UPGRADER, await upgrader.getAddress()))
        .to.emit(accessController, "RoleRevoked")
        .withArgs(Role.UPGRADER, await upgrader.getAddress(), await upgrader.getAddress());

      // Test
      expect(
        await accessController.hasRole(Role.UPGRADER, await upgrader.getAddress()),
        "UPGRADER role can't renounce UPGRADER role"
      ).is.false;
    });

    it("PAUSER role should be able to renounce PAUSER role", async function () {
      // Renounce Role, expecting the event
      await expect(accessController.connect(pauser).renounceRole(Role.PAUSER, await pauser.getAddress()))
        .to.emit(accessController, "RoleRevoked")
        .withArgs(Role.PAUSER, await pauser.getAddress(), await pauser.getAddress());

      // Test
      expect(
        await accessController.hasRole(Role.PAUSER, await pauser.getAddress()),
        "PAUSER role can't renounce PAUSER role"
      ).is.false;
    });

    it("CLIENT role should be able to renounce CLIENT role", async function () {
      // Renounce Role, expecting the event
      await expect(accessController.connect(client).renounceRole(Role.CLIENT, await client.getAddress()))
        .to.emit(accessController, "RoleRevoked")
        .withArgs(Role.CLIENT, await client.getAddress(), await client.getAddress());

      // Test
      expect(
        await accessController.hasRole(Role.CLIENT, await client.getAddress()),
        "CLIENT role can't renounce CLIENT role"
      ).is.false;
    });

    it("FEE_COLLECTOR role should be able to renounce FEE_COLLECTOR role", async function () {
      // Renounce Role, expecting the event
      await expect(
        accessController.connect(feeCollector).renounceRole(Role.FEE_COLLECTOR, await feeCollector.getAddress())
      )
        .to.emit(accessController, "RoleRevoked")
        .withArgs(Role.FEE_COLLECTOR, await feeCollector.getAddress(), await feeCollector.getAddress());

      // Test
      expect(
        await accessController.hasRole(Role.FEE_COLLECTOR, await feeCollector.getAddress()),
        "FEE_COLLECTOR role can't renounce FEE_COLLECTOR role"
      ).is.false;
    });

    it("Should not emit 'RoleRevoked' event if renouncing a role that was not granted", async function () {
      // Renounce Role, should not emit the event
      await expect(accessController.connect(rando).renounceRole(Role.ADMIN, await rando.getAddress())).to.not.emit(
        accessController,
        "RoleRevoked"
      );

      // Test
      expect(await accessController.hasRole(Role.ADMIN, await rando.getAddress())).is.false;
    });
  });

  context("📋 Any address can have multiple roles", async function () {
    beforeEach(async function () {
      // Deployer grants ADMIN to another address
      await accessController.connect(deployer).grantRole(Role.ADMIN, await admin.getAddress());
    });

    it("ADMIN role should be able to grant multiple roles to same address", async function () {
      // Grant all roles to associate
      try {
        await accessController.connect(admin).grantRole(Role.ADMIN, await associate.getAddress());
        await accessController.connect(admin).grantRole(Role.PROTOCOL, await associate.getAddress());
        await accessController.connect(admin).grantRole(Role.UPGRADER, await associate.getAddress());
        await accessController.connect(admin).grantRole(Role.PAUSER, await associate.getAddress());
        await accessController.connect(admin).grantRole(Role.CLIENT, await associate.getAddress());
        await accessController.connect(admin).grantRole(Role.FEE_COLLECTOR, await associate.getAddress());
      } catch (e) {}

      // Check roles all apply for associate
      expect(await accessController.hasRole(Role.ADMIN, await associate.getAddress())).is.true;
      expect(await accessController.hasRole(Role.PROTOCOL, await associate.getAddress())).is.true;
      expect(await accessController.hasRole(Role.UPGRADER, await associate.getAddress())).is.true;
      expect(await accessController.hasRole(Role.PAUSER, await associate.getAddress())).is.true;
      expect(await accessController.hasRole(Role.CLIENT, await associate.getAddress())).is.true;
      expect(await accessController.hasRole(Role.FEE_COLLECTOR, await associate.getAddress())).is.true;
    });
  });

  context("💔 Revert Reasons", async function () {
    it("Caller is different from account to be renounced", async function () {
      // Renounce Role, expecting revert
      await expect(
        accessController.connect(admin).renounceRole(Role.ADMIN, await deployer.getAddress())
      ).to.be.revertedWith(RevertReasons.CAN_ONLY_REVOKE_SELF);
    });

    it("Should revert if caller tries to grantRole but doesn't have ADMIN role", async function () {
      // Grant Role, expecting revert
      await expect(accessController.connect(rando).grantRole(Role.ADMIN, await rando.getAddress())).to.be.revertedWith(
        `AccessControl: account ${(await rando.getAddress()).toLowerCase()} is missing role ${Role.ADMIN}`
      );
    });

    it("Should revert if caller tries to revokeRole but doesn't have ADMIN role", async function () {
      // Grant role
      await accessController.connect(deployer).grantRole(Role.PAUSER, await pauser.getAddress());

      // Revoke Role, expecting revert
      await expect(
        accessController.connect(rando).revokeRole(Role.PAUSER, await pauser.getAddress())
      ).to.be.revertedWith(
        `AccessControl: account ${(await rando.getAddress()).toLowerCase()} is missing role ${Role.ADMIN}`
      );
    });

    it("Should revert if default admin is a zero address", async function () {
      // Grant role
      await accessController.connect(deployer).grantRole(Role.PAUSER, await pauser.getAddress());

      // Revoke Role, expecting revert
      await expect(AccessController.deploy(ZeroAddress)).to.be.revertedWith(`Invalid address`);
    });
  });
});
