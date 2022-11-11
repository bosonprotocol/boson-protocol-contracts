const hre = require("hardhat");
const ethers = hre.ethers;
const environments = require("../../../environments");
const confirmations = hre.network.name == "hardhat" ? 1 : environments.confirmations;
const { getFees } = require("../../util/utils");

/**
 * Deploy the SnapshotGate example contract
 *
 * Examples are not part of the protocol, but rather show how to
 * enhance the protocol with contracts that mediate interaction
 * with it.
 *
 * This particular example demonstrates a way to leverage the
 * protocol's built-in conditional commit capability in order to
 * token-gate offers using a snapshot of holders of an ERC-1155
 * token which could be deployed on a different chain.
 *
 * @param snapshotGateArgs - the constructor arguments for the SnapshotGate contract
 * @param maxPriorityFeePerGas - maxPriorityFeePerGas for transactions
 * @returns {Promise<(*|*|*)[]>}
 */
async function deploySnapshotGateExample(snapshotGateArgs, maxPriorityFeePerGas) {
  // Deploy the SnapshotGate
  const SnapshotGate = await ethers.getContractFactory("SnapshotGate");
  const snapshotGate = await SnapshotGate.deploy(...snapshotGateArgs, await getFees(maxPriorityFeePerGas));
  await snapshotGate.deployTransaction.wait(confirmations);

  return [snapshotGate];
}

exports.deploySnapshotGateExample = deploySnapshotGateExample;
