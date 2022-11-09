[![banner](images/banner.png)](https://bosonprotocol.io)

<h1 align="center">Boson Protocol V2</h1>

### [Intro](../README.md) | [Audits](audits.md) | [Setup](setup.md) | [Tasks](tasks.md) | [Architecture](architecture.md) | [Domain Model](domain.md) | [State Machines](state-machines.md) | [Sequences](sequences.md)

## Examples
To help sellers and integrators leverage the Boson Protocol in ways that push boundaries and enhance its in-built capabilities, we have made affordances in this repository for unit-tested examples.

**NOTE:** _Examples are NOT part of the protocol or necessarily covered by an audit._

Examples are prototypes that anyone could use to solve a particular problem that could otherwise be difficult or even impossible with the protocol alone. The benefit of these simple examples being placed in this repo is that they can leverage our testing and deployment infrastructure and also be discussed in our developer documentation.

Components of any example can be found in one or more of these places:

* `contracts/example/<example name>/`
* `scripts/example/<example name>/`
* `test/example/`
* `docs/example/`

### Snapshot Gate Example
This example answers the question: _How can I token-gate a Boson Protocol Offer on one chain with a token that exists on another chain?_

#### Example components
* [Details and diagrams](example/SnapshotGate.md)
* [Contract](../contracts/example/SnapshotGate)
* [Deployment script](../scripts/example/SnapshotGate/deploy-snapshot-gate.js)
* [Unit tests](../test/example/SnapshotGateTest.js)
