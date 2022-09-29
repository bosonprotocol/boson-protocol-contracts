[![banner](images/banner.png)](https://bosonprotocol.io)

<h1 align="center">Boson Protocol V2</h1>

### [Intro](../README.md) | [Audits](audits.md) | Setup | [Tasks](tasks.md) | [Architecture](architecture.md) | [Domain Model](domain.md) | [State Machines](state-machines.md) | [Happy Path Exchange](happy-path-exchange.md)

## Developer Setup
The stack is a simple one:
* Solidity
* JavaScript
* Node/NPM
* HardHat
* Waffle
* Ethers

### Install Node (also installs NPM)
* Use the latest [LTS (long term support) version](https://nodejs.org/en/download/).

### Install required Node modules
All NPM resources are project local. No global installs required.

```
cd path/to/contracts-v2 
npm install
```

### Configure Environment
- Copy [.env.example](../.env.example) to `.env` and edit to suit.
- API keys are only needed for deploying to public networks.
- `.env` is included in `.gitignore` and will not be committed to the repo.


### Local Development
If you are only perusing the repo, generating documentation, or running tests, the above setup is fine. 

However if you are building a dapp or scripting against the protocol, you'll want to get set up for local development, running a node process, etc. 

* [Local Development Setup](local-development.md)