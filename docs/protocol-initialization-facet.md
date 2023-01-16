[![banner](images/banner.png)](https://bosonprotocol.io)

<h1 align="center">Boson Protocol V2</h1>

### [Intro](../README.md) | [Audits](audits.md) | [Setup](setup.md) | [Tasks](tasks.md) | [Architecture](architecture.md) | [Domain Model](domain.md) | [State Machines](state-machines.md) | [Sequences](sequences.md)

## Protocol initialization handler facet

Protocol initialization handler facet has a special role in the whole [architecture](architecture.md). On one side we have Diamond specific facets - Loupe and Cut - which enable lookups and facet management. On the other hand we have Protocol specific facets which implements all features needed for protocol to work. Most of these facets needs to be initialized at the time when cuts are done, which among other includes registering its interface in the diamond. However in some cases initialization of a facet if different depending on whether whole protocol is deployed for the first time or it is just upgraded. Moreover, some upgrades might introduce a logic that relies on data that was not produced in old versions of the protocol. For that purpose we introduce Protocol initialization handler facet, which conceptually belongs between Diamond specific and Protocol specific facets. Its role is to enable smooth atomic upgrades and if necessary populate some of contract storage.

Protocol initialization handler facets responsibilities are:
- store version of the protocol,
- forward initialization calls to individual facets,
- if called during an upgrade, properly handle initialization data,
- remove supported interfaces,
- add supported interfaces.

Two biggest benefits of the Protocol initialization handler are:
- It allows atomic cuts of multiple facets, so there is generally no need to pause the protocol during the upgrade.
- It allows custom storage manipulation, so if any back filling is needed, we have a way to do it.

### Versioning

Initialize accepts version encoded in bytes32. Every time upgrade takes place, an unique version must be supplied, otherwise initialization reverts. Depending on version, some additional checks can be done, for example upgrade to certain versions can only be done if current protocol version is exactly one version lower. This kind of restriction is planned to be used on every upgrade. This means that skipping versions during the upgrade will not be possible. If the latest version of protocol code is more than one version higher that current deployed protocol, all intermediate upgrades need to be done to upgrade to the lates version.

Facets allows to query the current version by calling `getVersion`.

### Facet initialization

Each Protocol facet should have initialization function (even if no-op) to ensure consistency across codebase and different version. Initialization function should be written as if protocol is deployed for the first time (i.e. not taking into account potential effects on the upgrade).

When protocol is deployed for the first time, `initialize` on Protocol initialization handler should get list of all facet implementation addresses together with corresponding initialization data. This data is passed directly on individual facets where whole initialization takes place.  

However, before upgrade is done, effects of facet initializers should carefully be considered before passing data to initialization handler. If facet's initialization function does not affect the protocol state in a harmful way, it should be passed to initialization handler in the same way as for the initial deployment. However, when initialize affects the storage (for example Config handler sets all counters to 1), facet should be omitted from initialization call and approach from next section should be followed.

### Data initialization

When facet initializers are clashing with existing data or simply a specific storage must be populated, initializer facet must be updated to cater for these kind of change. Suppose new version is X.Y.Z and there is a need to modify the storage during the update, a new internal function should be prepared, called `initVX_Y_Z`. This function can make additional version checks and can accept arbitrary data which can be handled in any desired way. This allows to populate custom storage slot during the upgrade or mimic actions of the facet initializers that would otherwise be harmful. For example if another limit is added to the Config handler, `initVX_Y_Z` could simply store new value to desired location, without the need to overwrite other config values and at the same time leaves counters intact.  
Initialization data is passed in as bytes, so `initVX_Y_Z` must be decoded into correct types if needed.

### Managing supported interfaces

Although most facets initializers automatically register their EIP165 interfaces, old interfaces are not automatically removed during upgrade/removal. Protocol initialization handler therefore allows upgrader to supply list of interfaces to remove or add, which happens atomically during the upgrade.


### Initialization diagram
Diagram below represents a simple upgrade with two upgraded facets:
- Facet 1 has an initializer that writes to two slots, one of which is already populated.
- Facet 2 has an initializer that writes to an empty slot.

During the upgrade, the following happens:
- diamondCut is invoked externally. After it performs cut actions, it calls initialize on Protocol Initialization Facet.
- Since Facet 2 has upgrade-safe initializer, it is invoked directly on Facet itself.
- On the other hand, calling `initialize` on Facet 1 would affect already populated storage slot #102 and another empty slot #104. To avoid undesired effects, `initialize` cannot be called directly. Instead, `initVX_Y_Z` updates slot #104 and leaves #102 untouched.
- Additionally `initVX_Y_Z` also touches slot #106, not because some initializer would otherwise do it, but for example because some updated method from Facet 1 needs to read from that slot.

![Protocol Initialization Handler](images/Boson_Protocol_V2_-_Protocol_Initialization_Hander.png)