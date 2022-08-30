[![banner](images/banner.png)](https://bosonprotocol.io)

<h1 align="center">Boson Protocol V2</h1>

## [Intro](../README.md) | [Setup](setup.md) | [Tasks](tasks.md) | Local development | [Architecture](architecture.md) | [Domain Model](domain.md) | [State Machines](state-machines.md)

If you want to develop against the Boson protocol smart contract, you need to set up the local development enviromnent.
Follow the steps on this page to get the complete set of instructions that will help you set up the environment in no time.

## Prerequisites

To follow the manual and to get your local environment running you'll need to have the following tools installed:

- Git
- Node v16.14.x
- NPM v8.4.x

## Clone the repo

Start by cloning this repository.

`git clone git@github.com:bosonprotocol/boson-protocol-contracts.git`

### Install required Node modules
All NPM resources are project local. No global installs required.

```
cd boson-protocol-contracts
npm install
```

### Configure Environment
- Copy [.env.example](../.env.example) to `.env` and edit to suit.
- For local development, only the values in section `# Local node env specific ` are important
  - `DEPLOYER_LOCAL_TXNODE` is the URL of locally run node. In this example we will be using hardhat node, which has the default URL endpoint `http://127.0.0.1:8545`. If you are using default conifugration, you can leave `DEPLOYER_LOCAL_TXNODE` empty. If you are using hardhat (or any other) node with custom configuration, you need to specify its endpoint here.
  - `DEPLOYER_LOCAL_KEY`: If you are using hardhat node as in this example, it will use the mnemonic defined in `DEPLOYER_HARDHAT_MNEMONIC` and ignore the value of `DEPLOYER_LOCAL_KEY` However, if you are using custom node with different key management, you need to provide the private key of the account that will be deploying the contracts. It is necessary that the corresponding address has high enough balance to execute the transactions on your custom node.
  - `ADMIN_ADDRESS_LOCAL`: Boson protocol implements role based access management. Admin is the most important role since it can manage other roles and perform virtually all protocol management, including approving dispute resolvers. Admin is set during the deployment process, so you need to provide the address that will be granted this role.
  - `AUTH_TOKEN_OWNERS_LOCAL`: Boson protocol allows sellers to authenticate with ENS or LENS if they have one. To simulate this, we prepared a script that deploys mock ENS and LENS on the local node and issue the ENS and LENS authentication tokens to addresses, specified in `AUTH_TOKEN_OWNERS_LOCAL`. You can specify multiple addresses, separated with `", "` (comma and space).
- All other values can be kept as they are, since they are needed only for deploying to other networks.

### Configure Protocol Parameters
Boson protocol has variety of different parameters, for protocol fees to various limits. They are initially set during the deployment, but they can be later changed by the admin. For testing purposes, default values are generally okay to work with. However, if you'd like to adjust them before the deployment, edit configuration file `scripts/config/protocol-parameters.js` with desired values.


### Start the local node

To run the local node, execute the command

```npx hardhat node```

This will start the node and output all the actions that are happening on it (e.g. incoming trasactions or other calls). At the begining it outputs 20 addresses with initial balance of `10000 ETH`. You can use any of this addreses as the admin account of the protocol (refer to the explanation of `ADMIN_ADDRESS_LOCAL` in section [Configure Environment](#configure-Environment)).

### Deploy the protocol contracts

To deploy the whole suite of the Boson protocol contract, execute

```npm run deploy-suite:local```

This deploys all contract on the local node and prints out all the information about the deployment. Besides that, ABIs of the contracts are generated and all contract addresses are stored so you can later use them if needed. You will find them in folders:

- `artifacts/contracts/interfaces`
- `addresses/31337-localhost.json`

### [Optional] Manage roles
If you want to perform any of the following:
- change any of protocol configuration parameters
- use dispute resolver, which needs to be activated by the admin
- set up other roles, needed for some functionalities of the protocol (e.g. PAUSE, FEE_COLLECTOR)

you need to set up the admin account. To do it
- specify admin's address in the `.env` file (refer to the explanation of `ADMIN_ADDRESS_LOCAL` in section [Configure Environment](#configure-Environment)))
- run `npm run manage-roles:local`
