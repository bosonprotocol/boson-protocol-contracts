[![banner](images/banner.png)](https://bosonprotocol.io)

<h1 align="center">Boson Protocol V2</h1>

### [Intro](../README.md) | [Audits](audits.md) | [Setup](setup.md) | Tasks | [Architecture](architecture.md) | [Domain Model](domain.md) | [State Machines](state-machines.md) | [Sequences](sequences.md)

## Development Tasks
Everything required to build, test, analyse, and deploy is available as an NPM script.
* Scripts are defined in [`package.json`](../package.json).
* Most late-model IDEs such as Webstorm have an NPM tab to let you view and launch these tasks with a double-click.
* If you don't have an NPM launch window, you can run them from the command line.

### Build the contracts
This creates the build artifacts for deployment or testing

```npm run build```

### Test the contracts
This builds the contracts and runs the unit tests. It also runs the gas reporter and it outputs the report at the end of the tests.

```npm run test```

### Run the code coverage
This builds the contracts and runs the code coverage. This is slower than testing since it makes sure that every line of our contracts is tested. It outputs the report in folder `coverage`.

```npm run coverage```

### Deploy suite
Deploy suite deploys protocol diamond, all facets, client and beacon, and initializes protcol diamond. We provide different npm scripts for different use cases.

- **Hardhat network**. This deploys the built contracts to local network (mainly to test deployment script). Deployed contracts are discarded afterwards.  
```npm run deploy-suite:hardhat```
- **local network**. This deploys the built contracts to independent instance of local network (e.g. `npx hardhat node`), so the deployed contracts can be used with other contracts/dapps in development. Step-by-step manual to use it is available [here](local-development.md).  
```npm run deploy-suite:local```
- **internal test node**. This deploys the built contracts to custom test network. You need to modifiy `.env` with appropriate values for this to work.  
```npm run deploy-suite:test```
- **Polygon Mumbai**. This deploys the built contracts to Polygon Mumbai.  
```npm run deploy-suite:polygon:mumbai```
- **Polygon Mainnet**. This deploys the built contracts to Polygon Mainnet.
```npm run deploy-suite:polygon:mainnet```
- **Ethereum Mainnet**. This deploys the built contracts to Ethereum Mainnet.
```npm run deploy-suite:ethereum:mainnet```

### Upgrade facet
Upgrade existing facets, add new facets or remove existing facets. We provide different npm scripts for different use cases. A script for Hardhat network does not exist. Since contracts are discarded after the deployment, they cannot be upgraded.

For upgrade to succeed you need an account with UPGRADER role. Refer to "Manage Roles" to see how to grant it.

- **local network**. This upgrades the existing diamond on a independent instance of local network (e.g. `npx hardhat node`). Upgrade process is described [here](local-development.md#upgrade-facets).
```npm run upgrade-facets:local```
- **internal test node**. This upgrades the existing diamond on a custom test network. You need to modifiy `.env` with appropriate values for this to work.  
```npm run upgrade-facets:test```
- **Polygon Mumbai**. This upgrades the existing diamond on Polygon Mumbai.  
```npm run upgrade-facets:polygon:mumbai```
- **Polygon Mainnet**. This upgrades the existing diamond on Polygon Mainnet.
```npm run upgrade-facets:polygon:mainnet```
- **Ethereum Mainnet**. This upgrades the existing diamond on Ethereum Mainnet.
```npm run upgrade-facets:ethereum:mainnet```

### Deploy mock authentication token
Boson protocol support LENS and ENS as authentication method for seller's admin account. Public networks have LENS and ENS already deployed, but to use that funcionality on custom local or test nodes, you need to deploy the mock contract first. We provide the scripts for the following networks:

- **Hardhat network**. This deploys the built contracts to local network (mainly to test deployment script). Deployed contracts are discarded afterwards.  
```npm run deploy-mocks:hardhat```
- **local network**. This deploys the built contracts to independent instance of local network (e.g. `npx hardhat node`), so the deployed contracts can be used with other contracts/dapps in development. Step-by-step manual to use it is available [here](local-development.md).  
```npm run deploy-mocks:local```
- **internal test node**. This deploys the built contracts to custom test network. You need to modifiy `.env` with appropriate values for this to work.  
```npm run deploy-mocks:test```

### Manage Roles 
This runs the `scripts/manage-roles.js` script against the chosen network. It works in collaboration with `scripts/config/role-assignments.js` where you can specify which address should be granted or revoked the specified role. Currently supported roles are `ADMIN`,`UPGRADER`,`PAUSER`,`PROTOCOL`,`CLIENT` and `FEE_COLLECTOR`.
You cannot run this script agains `hardhat` network, all other networks are supported.

- **local network**. This deploys the built contracts to independent instance of local network (e.g. `npx hardhat node`), so the deployed contracts can be used with other contracts/dapps in development. Step-by-step manual to use it is available [here](local-development.md).  
```npm run manage-roles:local```
- **internal test node**. This runs the management script against the custom test network. You need to modifiy `.env` with appropriate values for this to work. 
```npm run manage-roles:test```
- **Polygon Mumbai**. This runs the management script against the Polygon Mumbai. You need to modifiy `.env` with appropriate values for this to work.  
```npm run manage-roles:polygon:mumbai```
- **Polygon Mainnet**. This runs the management script against the Polygon Mainnet. You need to modifiy `.env` with appropriate values for this to work.  
```npm run manage-roles:polygon:mainnet```
- **Ethereum Mainnet**. This runs the management script against the Ethereum Mainnet. You need to modifiy `.env` with appropriate values for this to work.  
```npm run manage-roles:ethereum:mainnet```

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

**NOTE**: If you want to contribute to this repository by opening a PR, make sure that this scripts are run first, otherwise PR checks will fail.

### Size the contracts
This builds the contracts calculates their byte size. Useful to make sure the contracts are not over the limit of 24kb.

```npm run size```

### Estimate protocol config limits
Estimate the maximum value for protocol config values. Read more in this detailed description of the [limit estimation](limit-estimation.md) process.

```npm run estimate-limits```

### Verify natspec interface ids
Builds the contract and checks that interface ids, written in the natespec in interface files, match the actual interface ids.
It outputs the list of files with errors of two types:
- MISSING INTERFACE IDS: interface is missing a line ` * The ERC-165 identifier for this interface is: 0xXXXXXXXX`
- WRONG INTERFACE IDS: interface has wrong interface specified

```npm run natspec-interface-id```

Script will try to automatically fix the wrong interfaces if you run it with
```npm run natspec-interface-id:fix```, however this cannot fix the missing interface ids.

### Create and/or activate dispute resolver

Script will create and/or activate a dispute resolver

**Arguments**:
- `path`: Required argument with path for a JSON file containing the following
  ```typescript
    {
     "disputeResolver": {
      "id": string, // ignored
      "escalationResponsePeriod": string,
      "operator": string,
      "admin": string,
      "clerk": string,
      "treasury": string,
      "metadataUri": string,
      "active": boolean // ignored
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
- `activate-only (optional)`: Optional flag to only activate the Dispute Resolver
- `create-only (optional)`: Optional flag to only create the Dispute Resolver


Note about the field `privateKey` in JSON file:
- `privateKey` represents the hex encoded private key that will create a dispute resolver. If it is not specified, the protocol admin account will be used (same account that later activate the dispute resolver and is specified in `.env`).
- If all `operator`, `admin` and `clerk` match the address, corresponding to `privateKey`, dispute resolver is simply created and activated.
- If any of `operator`, `admin` or `clerk` differs from the address, corresponding to `privateKey`, dispute resolver is created in two steps. Firstly, a dispute resolver with `operator`, `admin` and `clerk` set to address, corresponding to `privateKey` is created and then in the second step dispute resolver is updated with addresses from JSON file.

Example: 

```
npx hardhat create-dispute-resolver --path "path/to/dispute_resolver.json" --network localhost --create-only
```




