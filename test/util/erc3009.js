const { ethers } = require("hardhat");

/**
 * Build an ERC-3009 ReceiveWithAuthorization signature and return the abi-encoded `bytes authorization`
 * blob that the Boson Protocol's `*WithAuthorization` entry points expect. Only the unverifiable parts
 * of the EIP-712 payload are encoded — `from` and `value` are derived by the protocol itself, so a
 * signed authorization can never be redirected to a different payer or amount.
 *
 * @param {object} args
 * @param {object} args.token - ethers.Contract for the ERC-3009 token (must expose DOMAIN_SEPARATOR())
 * @param {object} args.signer - ethers.Signer who is the authorizer (= `from`)
 * @param {string} args.from - the authorizer's address (must match signer)
 * @param {string} args.to - the recipient's address (= protocol diamond address)
 * @param {bigint|string|number} args.value - the exact amount the protocol will pull
 * @param {bigint|string|number} [args.validAfter=0]
 * @param {bigint|string|number} [args.validBefore] - defaults to now + 1 day
 * @param {string} [args.nonce] - 32-byte hex nonce; defaults to random
 * @returns {Promise<{ authorization: string, validAfter: bigint, validBefore: bigint, nonce: string, v: number, r: string, s: string }>}
 */
async function signReceiveWithAuthorization({ token, signer, from, to, value, validAfter, validBefore, nonce }) {
  const network = await ethers.provider.getNetwork();
  const tokenName = await token.TOKEN_NAME();
  const tokenVersion = await token.ERC712_VERSION();

  const now = BigInt(Math.floor(Date.now() / 1000));
  validAfter = validAfter !== undefined ? BigInt(validAfter) : 0n;
  validBefore = validBefore !== undefined ? BigInt(validBefore) : now + 86400n;
  nonce = nonce || ethers.hexlify(ethers.randomBytes(32));
  value = BigInt(value);

  const domain = {
    name: tokenName,
    version: tokenVersion,
    chainId: network.chainId,
    verifyingContract: await token.getAddress(),
  };

  const types = {
    ReceiveWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  };

  const message = {
    from,
    to,
    value,
    validAfter,
    validBefore,
    nonce,
  };

  const sig = await signer.signTypedData(domain, types, message);
  const { v, r, s } = ethers.Signature.from(sig);

  const authorization = ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint256", "uint256", "bytes32", "uint8", "bytes32", "bytes32"],
    [validAfter, validBefore, nonce, v, r, s],
  );

  return { authorization, validAfter, validBefore, nonce, v, r, s };
}

module.exports = { signReceiveWithAuthorization };
