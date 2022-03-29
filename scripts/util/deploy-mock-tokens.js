const hre = require("hardhat");
const ethers = hre.ethers;

/**
 * Deploy mock tokens for unit tests
 *
 * @param gasLimit - gasLimit for transactions
 *
 * @returns {Promise<(*|*|*)[]>}
 */
 async function deployMockTokens(gasLimit) {

    const deployedTokens = [], tokens = [
        "BosonToken",
        "Foreign721",
        "Foreign1155",
        "FallbackError"
    ];

    // Deploy all the mock tokens
    while (tokens.length) {
        let token = tokens.shift();
        let TokenContractFactory = await ethers.getContractFactory(token);
        const tokenContract = await TokenContractFactory.deploy({gasLimit});
        await tokenContract.deployed();
        deployedTokens.push(tokenContract);
    }

    // Return the deployed token contracts
    return deployedTokens;

}

exports.deployMockTokens = deployMockTokens;
