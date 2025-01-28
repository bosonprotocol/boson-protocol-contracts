[![banner](images/banner.png)](https://bosonprotocol.io)

<h1 align="center">Boson Protocol V2</h1>

### [Intro](../README.md) | [Audits](audits.md) | [Setup](setup.md) | [Tasks](tasks.md) | [Architecture](architecture.md) | [Domain Model](domain.md) | [State Machines](state-machines.md) | [Sequences](sequences.md)

## Running against a Local Node

If you want to develop against the Boson protocol smart contracts, you will need to deploy contracts to a local node that you can execute transactions against with scripts or a locally served instance of your dapp.

## Prerequisites

To follow the manual and to get your local environment running you'll need to have the following tools installed:

- Git
- Node v16.14.x
- NPM v8.4.x

## Fork our repo

- Navigate to [bosonprotocol/boson-protocol-contracts](https://github.com/bosonprotocol/boson-protocol-contracts) on GitHub.
- If this is your first time forking a repository on GitHub, follow [the instructions](https://docs.github.com/en/get-started/quickstart/fork-a-repo#forking-a-repository) there.
- Fork our repo to your GitHub account, e.g. `myaccount/boson-protocol-contracts`

## Clone your forked repo locally

Assuming your fork is `myaccount/boson-protocol-contracts`, you can clone the repo locally with:

`git clone --recursive git@github.com:myaccount/boson-protocol-contracts.git`

You may now make branches locally, commit to them, and push them to your fork.

Should you wish to make a contribution to the protocol, you can create a pull request that seeks to merge a branch of your fork into the Boson Protocol `main` branch. Read more about [making contributions from a fork](https://docs.github.com/en/get-started/quickstart/contributing-to-projects) in the GitHub docs.

### Install required Node modules

All NPM resources are project local. No global installs required.

```
cd boson-protocol-contracts
npm install
```

### Prepare git pre-hooks

Pre-hooks are scripts that runs automatically before each [git hook](https://git-scm.com/docs/githooks) execution.
We use the pre-commit hook to ensure that all new code follows the style guidelines defined in [eslint](../.eslintrc.json) and [prettier](../.prettierrc) configuration files before it is committed to the repository.
The pre-commit hook is also used to verify and fix [natspec interface ids](./tasks.md#verify-natspec-interface-ids)

The [Husky](https://typicode.github.io/husky) library is used to manage pre-hooks scripts.
To make husky work, you must run:

```
npx husky install
```

### Configure Environment

- Copy [.env.example](../.env.example) to `.env` and edit to suit.
- For local development, only the values in section `# Local node env specific ` are important
  - `DEPLOYER_LOCAL_TXNODE` is the URL of locally run node. In this example we will be using hardhat node, which has the default URL endpoint `http://127.0.0.1:8545`. If you are using default configuration, you can leave `DEPLOYER_LOCAL_TXNODE` empty. If you are using hardhat (or any other) node with custom configuration, you need to specify its endpoint here.
  - `DEPLOYER_LOCAL_KEY`: If you are using hardhat node as in this example, it will use the mnemonic defined in `DEPLOYER_HARDHAT_MNEMONIC` and ignore the value of `DEPLOYER_LOCAL_KEY` However, if you are using custom node with different key management, you need to provide the private key of the account that will be deploying the contracts. It is necessary that the corresponding address has high enough balance to execute the transactions on your custom node.
  - `ADMIN_ADDRESS_LOCAL`: Boson protocol implements role based access management. Admin is the most important role since it can manage other roles and perform virtually all protocol management, including approving dispute resolvers. Admin is set during the deployment process, so you need to provide the address that will be granted this role.
  - `AUTH_TOKEN_OWNERS_LOCAL`: Boson protocol allows sellers to authenticate with an ENS name or LENS profile if they have one. Both are represented by NFTs. To simulate this, we prepared a script that deploys mock ENS and LENS NFT contracts on the local node and issues the ENS and LENS NFT authentication tokens to the addresses specified in `AUTH_TOKEN_OWNERS_LOCAL`. You can specify multiple addresses, separated with `", "` (comma and space).
- All other values can be kept as they are, since they are needed only for deploying to other networks.

### Configure Protocol Parameters

Boson protocol has variety of different parameters, for protocol fees to various limits. They are initially set during the deployment, but they can be later changed by the admin. For testing purposes, default values are generally okay to work with. However, if you'd like to adjust them before the deployment, edit configuration file `scripts/config/protocol-parameters.js` with desired values.

### Start the local node

To run the local node, execute the command in a separate terminal.

`npx hardhat node`

This will start the node and output all the actions that are happening on it (e.g. incoming trasactions or other calls). At the begining it outputs 20 addresses with initial balance of `10000 ETH`. You can use any of this addreses as the admin account of the protocol (refer to the explanation of `ADMIN_ADDRESS_LOCAL` in section [Configure Environment](#configure-Environment)).

### Deploy authentication token contract mocks

Boson protocol currently uses two NFT contracts (ENS and LENS), that can be optionally used as the authentication mechanism for seller. On public networks, these contracts are already deployed and you would just use their actual addresses. However, on the test network you need to deploy it yourself to enable full protocol functionality.

The script that deploys the authentication token mock contract also mints the authentication tokens to the addresses specified in `.env`. (refer to the explanation of `AUTH_TOKEN_OWNERS_LOCAL` in section [Configure Environment](#configure-Environment). These cannot be zero addresses, so you need to populate it with your values or supply an empty value if you don't want authentication tokens to be minted to any addresses.

To deploy the authentication token mocks, then run

`NETWORK=localhost npm run deploy-mocks`

This script outputs the addresses of the deployed mock NFT contracts. Save them, as you will need them for the deployment of the protocol contracts.

**NOTE**: if you do not plan to use this authentication at all you can skip the deployment of the mocks. However, since the deployment of the protocol contract needs the addresses of ENS and LENS to be non-zero value, you'd still need to provide some address in configuration file `scripts/config/auth-token-addresses.js`.

### Deploy the protocol contracts

Before the deployment, you need to configure the addresses of authentication token contracts that you deployed in previous step.
Edit the file `scripts/config/auth-token-addresses.js` and replace the values for `LENS.localhost` and `ENS.localhost`. If you don't do it, the deployment will still succeed, however you won't be able to use the tokens as authentication mechanism out of the box.

To deploy the whole suite of the Boson protocol contract, execute

`NETWORK=localhost npm run deploy-suite`

This deploys all contract on the local node and prints out all the information about the deployment. Besides that, ABIs of the contracts are generated and all contract addresses are stored so you can later use them if needed. You will find them in folders:

- `artifacts/contracts/interfaces`
- `addresses/<chain-id>-<environment>.json` (for example `addresses/31337-localhost.json` if you are using a default local hardhat node)

### [Optional] Manage roles

If you want to perform any of the following:

- change any of protocol configuration parameters
- use dispute resolver
- set up other roles, needed for some functionalities of the protocol (e.g. PAUSE, FEE_COLLECTOR)

you need to set up the admin account. To do it

- specify admin's address in the `.env` file (refer to the explanation of `ADMIN_ADDRESS_LOCAL` in section [Configure Environment](#configure-Environment)))
- optionally, edit scripts/config/role-assignments.js. The defaults will suffice for enabling the above-mentioned functionality.
- run `NETWORK=localhost npm run manage-roles`. This grants the `ADMIN` and `UPGRADER` roles to the admin address specified in `.env` and the `PROTOCOL` role to the `ProtocolDiamond` contract The output of this command is saved to `logs/localhost.manage.roles.txt`

To get the examples how to use the admin to perform actions, refer to unit test in files:

- `test/protocol/ConfigHandlerTest.js`
- `test/protocol/DisputeResolverHandlerTest.js`
- PAUSER role: `test/protocol/PauseHandlerTest.js`
- FEE_COLLECTOR role: `test/protocol/FundsHandlerTest.js`

### Upgrade facets

To test the upgrade functionality, you first need to setup an upgrader account as described in previous section.

#### Using the upgrade facets method

- Update some of the existing facets or create new one.
- Update config file `scripts/config/facet-upgrade.js`:
  - "addOrUpgrade" is the list of facets that will be upgraded or added,
  - "remove": list of facets that will be completely removed
  - "skipSelectors" allows you to specify methods that will be ignored during the process.
  - "facetsToInit": list of facets that will be initialized on ProtocolInitializationFacet.
    if facet initializer expects arguments, provide them here. For no-arg initializers pass an empty array.
    You don't have to provide ProtocolInitializationFacet args here because they are generated on cut function.
- Run `npx hardhat upgrade-facets --network localhost --env '' --new-version <version>`. This will deploy new facets and make all necessary diamond cuts. It also updates the existing addresses file `addresses/<chain-id>-<environment>.json` (for example `addresses/31337-localhost.json` if you are using a default local hardhat node) and outputs the upgrade log to the console.

Protocol initialization facet is explained in more detail on a separate page: [Protocol initialization handler facet](protocol-initialization-facet.md).

#### Using the migrations

If you are testing an upgrade of official release, you can simply run

```
NETWORK=localhost VERSION=version npx hardhat migrate
```

If you are testing an unreleased version (potentially including your changes), first prepare a migration script in [migrations](../scripts/migrations/) named `migrate_<version>.js` with all the logic needed for the migration. Then run the migration the same way as for the official releases.

### Upgrade clients

To test the upgrade functionality, you first need to setup an upgrader account as described in section [Manage roles](local-development.md#optional-manage-roles)

To perform the upgrade you then

- Update some of the existing clients
- Run `npx hardhat upgrade-clients --network localhost --env '' --new-version <version>`. This will deploy new clients and set implementation address on beacon. It also updates the existing addresses file `addresses/<chain-id>-<environment>.json` (for example `addresses/31337-localhost.json` if you are using a default local hardhat node) and outputs the upgrade log to the console.

### Using the protocol

You can find the examples how to use all functions of the protocol in our test files in folder `test/protocol`.

### Using other npm scripts

We provide some scripts to perform other tasks in this repo (e.g. just building the contracts, testing, sizing etc.). You can find more info about it on separate page [Tasks](tasks.md).
