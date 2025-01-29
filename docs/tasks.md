[![banner](images/banner.png)](https://bosonprotocol.io)

<h1 align="center">Boson Protocol V2</h1>

### [Intro](../README.md) | [Audits](audits.md) | [Setup](setup.md) | Tasks | [Architecture](architecture.md) | [Domain Model](domain.md) | [State Machines](state-machines.md) | [Sequences](sequences.md)

## Development Tasks

Everything required to build, test, analyses, and deploy is available as an NPM script.

- Scripts are defined in [`package.json`](../package.json).
- Most late-model IDEs such as Webstorm have an NPM tab to let you view and launch these tasks with a double-click.
- If you don't have an NPM launch window, you can run them from the command line.

### Build the contracts

This creates the build artifacts for deployment or testing

`npm run build`

### Test the contracts

This builds the contracts and runs the unit tests. It also runs the gas reporter and it outputs the report at the end of the tests.

`npm run test`

### Run the code coverage

This builds the contracts and runs the code coverage. This is slower than testing since it makes sure that every line of our contracts is tested. It outputs the report in folder `coverage`.

`npm run coverage`

### Deploy suite

Deploy suite deploys protocol diamond, all facets, client and beacon, and initializes protocol diamond. The script cleans the cache, compiles contracts, deploys them and store the logs into a text file.

`NETWORK=network ENV=env npm run deploy-suite -- [--dry-run] [--create3]`

- `NETWORK` is the network to deploy the suite to. The parameter is required and can be one of the networks defined in `hardhat.config.js`.
- `ENV` represents the deployment environment, needed especially if multiple instances are deployed to the same network. The parameter is optional.
- `dry-run` simulates the deployment on any of the public networks. It forks the network and simulates the deployment locally and gives the current cost estimate. It is suggested to run before an actual deployment to detect any possible issues.
- `create3` deploys the contracts through CREATE3 FACTORY smart contract, to eliminate the dependency on the deployer's nonce. To use it `CREATE3_FACTORY_ADDRESS` and `CREATE3_SALT` must be set in `.env` file.

The logs are saved to `logs/NETWORK-ENV.deploy.contracts.txt`

### Verify suite

After the protocol contracts are deployed, they should be verified on a block explorer. Verification provides a checkmark in the block explorer and makes the contract source code viewable in the block explorer. We have provided different npm scripts to verify the deployed protocol contracts on different environments. The scripts read a .json file containing contract addresses, which is produced by the deployment scripts. The default mode is to verify all contracts from that file, however if only a subset of contracts needs to be verified (e.g. after the upgrade), list them in `scripts/config/contract-verification.js`.

`NETWORK=network ENV=env npm run verify-suite`

- `NETWORK` is the network to verify suite on. The parameter is required and can be one of the public networks defined in `hardhat.config.js`.
- `ENV` represents the deployment environment, needed especially if multiple instances are deployed to the same network. The parameter is optional.

The logs are saved to `logs/NETWORK-ENV.deploy.contracts.txt`

### Upgrade facets

Upgrade existing facets, add new facets or remove existing facets. We provide different npm scripts for different use cases. A script for Hardhat network does not exist. Since contracts are discarded after the deployment, they cannot be upgraded.

> With v2.2.1, we introduced the migration scripts, which handle the upgrade. For versions above v2.2.1, use of migration script is preferred over the use of upgrade script, since those scripts also take care of any actions that needs to be done right before or after the upgrade. Refer to [migration section](#migrate) for details.

For an upgrade to succeed you need an account with UPGRADER role. Refer to [Manage roles](#manage-roles) to see how to grant it.

`npx hardhat upgrade-facets --network <network> --env <env> --new-version <version>`

Each upgrade requires correct config parameters.

- **<= v2.2.0**: Correct configurations for releases up to v2.2.0 are available [here](../test/upgrade/00_config.js).
- **>= v2.2.1**: Configurations for releases above v2.2.0 are part of their respective [migration scripts](../scripts/migrations/).

If you want to upgrade to any intermediate version (for example to a release candidate), you can use the same config as for the actual release, however, it might result in interface clashes, which prevent subsequent upgrades. A workaround for this problem is to temporarily disable `onlyUninitialized` modifier on all contracts that clash. Since this is generally an unsafe operation, you should never do that in the production environment. Production should always be upgraded only to actual releases.

### Migrate

Migration scripts are available from release v2.2.1. They are used to migrate to a higher version of the protocol. They include the configuration needed for the upgrade, and they execute all required pre and post-upgrade actions. The upgrade is done with the same script as in [Upgrade facets](#upgrade-facets) task. The main difference between migration and just plain upgrade scripts is that migration scripts are easier to use and leave less room for errors. Additionally, they allow the simulation of migration before actually performing it so any problems can be detected in advance.

To use them, execute the following command

```
npx hardhat migrate <version> --network <network> --env <environment> [--dry-run] [--create3]
```

- **version**: tag to which you want to migrate (e.g. v2.3.0). If the remote tag exists, it will overwrite the local one.
- **network**: network where migration takes place. Must be defined in hardhat config.
- **environment**: custom name for the environment, used to distinguish if multiple instances are deployed on the same network. Typically one of `test`, `staging` and `prod`.
- `--dry-run` is an optional flag. If added, the script locally simulates the migration process as it would happen on the actual network and environment, but none of the contracts is really deployed and upgraded. It's recommended to run it before the upgrade. This script forks the latest possible block, which can result in performance issues. If you experience them, modify `scripts/util/dry-run.js` to use hardhat's default value (~30 less than the actual block).
- `--create3` is an optional flag. If added, AccessController and Diamond contracts will be deployed using a CREATE3 factory which enables easier address matching across different EVM chains. If this is used, environmental variables `CREATE3_FACTORY_ADDRESS` and `CREATE3_SALT` must be set as well and CREATE3 factory must already be deployed on `CREATE3_FACTORY_ADDRESS`. CREATE3 factory must accept the deployment parameters in format `salt.byteCode`, otherwise the deployment will fail. We suggest using the contract `0xa41b0e32c8f1e0f20fe57bffe64c32fdf5a03ad1`, which is [SKYBITLite](https://github.com/SKYBITDev3/SKYBIT-Keyless-Deployment/blob/588ac72827c871eddce60bb2f06c59c176518818/contracts/SKYBITCREATE3FactoryLite.yul) deployed via [the deterministic deployment proxy](https://github.com/Arachnid/deterministic-deployment-proxy) deployed at `0x4e59b44847b379578588920cA78FbF26c0B4956C`. If it's not present on the chain of your choice, you can deploy it yourself.

### Upgrade clients

Upgrade existing clients (currently only BosonVoucher). Script deploys new implementation and updates the address on the beacon.  
We provide different npm scripts for different use cases. A script for Hardhat network does not exist. Since contracts are discarded after the deployment, they cannot be upgraded.  
For the upgrade to succeed you need an account with UPGRADER role. Refer to [Manage roles](#manage-roles) to see how to grant it.  
If you are not sure which contracts were changed since the last deployment/upgrade, refer to [Detect changed contract](#detect-changed-contract) to see how to get the list of changed contracts.

`npx hardhat upgrade-clients --network <network> --env <env> --new-version <version>`

### Deploy mock authentication token

Boson protocol supports LENS and ENS as authentication methods for the seller's admin account. Public networks have LENS and ENS already deployed, but to use that functionality on custom local or test nodes, you need to deploy the mock contract first. We provide the scripts for the following networks:

`NETWORK=network npm run deploy-mocks:hardhat`

- `NETWORK` is the network to deploy the mocks to. It should be one of test environments (`hardhat`,`localhost`,`test`).

### Manage Roles

This runs the `scripts/manage-roles.js` script against the chosen network. It works in collaboration with `scripts/config/role-assignments.js` where you can specify which address should be granted or revoked for the specified role. Currently supported roles are `ADMIN`,`UPGRADER`,`PAUSER`,`PROTOCOL`,`CLIENT` and `FEE_COLLECTOR`.
You cannot run this script against `hardhat` network, all other networks are supported.

`NETWORK=network ENV=env npm run manage-roles:local`

- `NETWORK` is the network to manage the roles on. The parameter is required and can be one of the public networks defined in `hardhat.config.js`.
- `ENV` represents the deployment environment, needed especially if multiple instances are deployed to the same network. The parameter is optional.

### Linting and tidying

Contracts and scripts are linted using `solhint` and `eslint` respectively and prettified using `prettier`. There are two types of npm scripts:

- only check if there are any problems in contracts/scripts
  ```
  npm run check:contracts
  npm run check:scripts
  ```
- check and try to fix problems in contracts/scripts. This overwrites existing files.
  ```
  npm run tidy:contracts
  npm run tidy:scripts
  ```

**NOTE**: These scripts are run whenever you try to commit something.

### Size the contracts

This builds the contracts and calculates their byte size. Useful to make sure the contracts are not over the limit of 24kb.

`npm run size`

### Estimate protocol config limits

Estimate the maximum value for protocol config values. Read more in this detailed description of the [limit estimation](limit-estimation.md) process.

`npm run estimate-limits`

### Verify natspec interface ids

Builds the contract and checks that interface ids, written in the natespec in interface files, match the actual interface ids.
It outputs the list of files with errors of two types:

- MISSING INTERFACE IDS: the interface is missing a line ` * The ERC-165 identifier for this interface is: 0xXXXXXXXX`
- WRONG INTERFACE IDS: the interface has a wrong interface id specified

`npm run natspec-interface-id`

The script will try to automatically fix the wrong interfaces if you run it with
`npm run natspec-interface-id:fix`, however this cannot fix the missing interface ids.

**NOTE**: This script is run whenever you try to commit something.

### Create dispute resolver

The script will create a dispute resolver.

**Arguments**:

- `path`: Required argument with path for a JSON file containing the following
  ```typescript
    {
     "disputeResolver": {
      "id": string, // ignored
      "escalationResponsePeriod": string,
      "assistant": string,
      "admin": string,
      "clerk": string, // ignored, zero address is used instead
      "treasury": string,
      "metadataUri": string,
      "active": boolean
      },
      "disputeResolverFees": [
        {
        "tokenAddress": string,
        "tokenName": string,
        "feeAmount": string
        }
      ],
      "sellerAllowList": [string]
      "privateKey": string // optional
    }
  ```
- `network`: Network to run the script

Note about the field `privateKey` in JSON file:

- `privateKey` represents the hex-encoded private key that will create a dispute resolver. If it is not specified, the protocol admin account will be used (specified in `.env`).
- If both `assistant` and `admin` match the address, corresponding to `privateKey`, a dispute resolver is simply created.
- If any of `assistant` or `admin` differs from the address, corresponding to `privateKey`, a dispute resolver is created in two steps. Firstly, a dispute resolver with `assistant` and `admin` set to address, corresponding to `privateKey` is created and then in the second step dispute resolver is updated with addresses from JSON file.

Example:

```
npx hardhat create-dispute-resolver --path "path/to/dispute_resolver.json" --network localhost
```

### Detect changed contract

Script that helps you find out, which contracts were changed between two commits. This is extremely useful before doing the upgrade to make sure all facets that were changed actually get upgraded.

Run script with  
`npx hardhat detect-changed-contracts referenceCommit [targetCommit]`

Parameters:

- referenceCommit [required] - commit/tag/branch to compare to
- targetCommit [optional] - commit/tag/branch to compare. If not provided, it will compare to the current branch.

The script prints out the list of contracts that were created, deleted or changed between specified commits.

Examples:

```
npx hardhat detect-changed-contracts v2.1.0 v2.2.0    // get changes between two tags
npx hardhat detect-changed-contracts b4d4277          // get changes between a commit and current branch (HEAD)
npx hardhat detect-changed-contracts v2.1.0 branch-1  // get changes a tag and another branch
```

### Split unit tests into chunks

Run unit tests and generate chunks of tests with approximately the same execution time in order to run them in parallel on Github Actions.
This script must be run wherever we add new unit test files.

Run the script with  
`npx hardhat split-unit-tests-into-chunks <chunks>`

Parameters:

- chunks [required] - Number of chunks to divide the tests into

Example: `npx hardhat split-unit-tests-into-chunks 4`

### Estimate twin transfer limits

Estimates the values `SINGLE_TWIN_RESERVED_GAS` and `MINIMAL_RESIDUAL_GAS` used during twins transfers.  
More information about the procedure is available on a dedicated page: [Estimating the twin transfer limits](twin-transfer-limits.md).

Run the script with  

`node ./scripts/util/estimate-twin-transfer-limits.js`
