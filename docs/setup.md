# Boson Protocol V2 
## [Intro](../README.md) | Setup | [Tasks](tasks.md) | [Architecture](architecture.md) | [Domain Model](domain.md)

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

