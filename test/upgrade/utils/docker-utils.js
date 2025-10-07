const { exec } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const path = require("path");
const execAsync = promisify(exec);

class DockerUtils {
  constructor() {
    this.isRunning = false;
    this.composeFile = "docker-compose.upgrade.yml";
  }

  async startContainer() {
    console.log("🐳 Starting Docker container...");

    // Stop existing and start new
    await execAsync(`docker-compose -f ${this.composeFile} down`).catch(() => {});
    await execAsync(`docker-compose -f ${this.composeFile} up -d`);

    // Wait for services to start
    console.log("Waiting for services...");
    await new Promise((resolve) => setTimeout(resolve, 15000));

    // Wait for contracts to be deployed
    console.log("Waiting for contracts to be deployed...");
    await this.waitForContracts();

    // Copy addresses file from Docker container
    await this.copyAddressesFile();

    this.isRunning = true;
    console.log("✅ Docker container ready!");
  }

  async waitForContracts() {
    while (true) {
      try {
        await execAsync(`docker-compose -f ${this.composeFile} exec -T boson-protocol-node ls /app/deploy.done`);
        console.log("✅ Successfully deployed contracts!");
        break;
      } catch (error) {
        console.log("⏳ Waiting for contracts to be deployed...");
        await new Promise((resolve) => setTimeout(resolve, 15000));
      }
    }
  }

  async copyAddressesFile() {
    console.log("📋 Copying addresses file from Docker container...");

    try {
      // Copy the addresses file from Docker container
      const { stdout } = await execAsync(
        `docker-compose -f ${this.composeFile} exec -T boson-protocol-node cat /app/node_modules/@bosonprotocol/boson-protocol-contracts/addresses/31337-localhost-localhost.json`
      );

      if (!stdout || stdout.trim() === "") {
        throw new Error("Addresses file is empty or not found");
      }

      // Ensure addresses directory exists
      const addressesDir = path.join(__dirname, "../../../addresses");
      if (!fs.existsSync(addressesDir)) {
        fs.mkdirSync(addressesDir, { recursive: true });
      }

      // Write the file locally
      const localPath = path.join(addressesDir, "31337-localhost-localhost.json");
      fs.writeFileSync(localPath, stdout.trim());

      console.log("✅ Addresses file copied successfully!");
    } catch (error) {
      console.error("❌ Failed to copy addresses file:", error.message);
      throw error;
    }
  }

  async stopContainer() {
    console.log("🛑 Stopping Docker container...");
    await execAsync(`docker-compose -f ${this.composeFile} down`).catch(() => {});
    console.log("✅ Docker container stopped");
    this.isRunning = false;
  }

  async fullCleanup() {
    await this.stopContainer();
  }

  getStatus() {
    return { isRunning: this.isRunning };
  }
}

module.exports = DockerUtils;
