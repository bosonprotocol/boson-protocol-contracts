[![banner](images/banner.png)](https://bosonprotocol.io)

<h1 align="center">Boson Protocol V2</h1>

## [Intro](../README.md) | [Setup](setup.md) | Tasks |  [Architecture](architecture.md) | [Domain Model](domain.md) | [State Machines](state-machines.md)
## Development Tasks
Everything required to build, test, analyse, and deploy is available as an NPM script.
* Scripts are defined in [`package.json`](../package.json).
* Most late-model IDEs such as Webstorm have an NPM tab to let you view and launch these
tasks with a double-click.
* If you don't have an NPM launch window, you can run them from the command line.

### Build the contracts
This creates the build artifacts for deployment or testing

```npm run build```

### Test the contracts
This builds the contracts and runs the unit tests.

```npm run test```

### Deploy to Hardhat network
This deploys the built contracts to local network (mainly to test deployment script)

```npm run deploy-suite:local```

### Deploy to internal test node
This deploys the built contracts to an internal geth node used as a test environment

```npm run deploy-suite:test```

### Deploy to Mumbai
This deploys the built contracts to Mumbai

```npm run deploy-suite:mumbai```

### Deploy to Mainnet
This deploys the built contracts to Mainnet

```npm run deploy-suite:mainnet```

### Manage Roles on Mumbai
This runs the `scripts/manage-roles.js` script against mumbai.

```npm run manage-roles:mumbai```

### Manage Roles on Mainnet
This runs the `scripts/manage-roles.js` script against mainnet.

```npm run manage-roles:mainnet```