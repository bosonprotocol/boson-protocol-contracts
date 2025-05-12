[![banner](images/banner.png)](https://bosonprotocol.io)

<h1 align="center">Boson Protocol V2</h1>

### [Intro](../README.md) | [Audits](audits.md) | [Setup](setup.md) | [Tasks](tasks.md) | [Architecture](architecture.md) | [Domain Model](domain.md) | [State Machines](state-machines.md) | [Sequences](sequences.md)

## Upgrade configurations
This page provides correct configuration upgrades for all releases.  
If you want to upgrade to any intermediate version (for example to a release candidate), you can use the same config as for the actual release, however it might result in interface clashes, which might prevent subsequent upgrades. Workaround for this problem is to temporary disable `onlyUninitialized` modifier on all contracts that clash. Since this is generally an unsafe operation, you should never do that in production environment. Production should always be upgraded only to actual releases.

For each version upgrade, create a JavaScript configuration file in `scripts/config/upgrade/` directory with the name matching the target version (e.g. `2.4.2.js`). The file should export a `getFacets` function that returns the upgrade configuration.

A default configuration template is available at `scripts/config/upgrade/facet-upgrade.js`. This file contains a detailed explanation of all configuration options and can be used as a starting point for creating new upgrade configurations.

### Configuration Format

Each upgrade configuration file should export a `getFacets` function that returns an object with the following structure:

```javascript
async function getFacets() {
  return {
    addOrUpgrade: [],    // Array of facet names to be added or upgraded
    remove: [],          // Array of facet names to be removed
    skipSelectors: {},   // Object mapping facet names to arrays of selectors to skip
    facetsToInit: {},    // Object mapping facet names to their initialization parameters
    initializationData: "0x"  // Hex string containing initialization data
  };
}

exports.getFacets = getFacets;
```

For detailed examples and explanations of each configuration field, refer to the default configuration file at `scripts/config/upgrade/facet-upgrade.js`.

### Example Configurations

#### 2.0.0 -> 2.1.0

```javascript
async function getFacets() {
  return {
    addOrUpgrade: ["ERC165Facet", "AccountHandlerFacet", "SellerHandlerFacet", "DisputeResolverHandlerFacet"],
    remove: [],
    skipSelectors: {},
    facetsToInit: {},
    initializationData: "0x",
  };
}
```
Note: format to upgrade from `2.0.0` to `2.1.0` does not match the latest upgrade script format. When you are upgrading to this version, checkout the tag `v2.1.0-scripts` which is the latest version of old upgrade script that works with upgrades up to `2.1.0`.

### 2.1.0 -> 2.2.0

```javascript
{
  addOrUpgrade: [
    "AccountHandlerFacet",
    "BundleHandlerFacet",
    "ConfigHandlerFacet",
    "DisputeHandlerFacet",
    "DisputeResolverHandlerFacet",
    "ExchangeHandlerFacet",
    "MetaTransactionsHandlerFacet",
    "OfferHandlerFacet",
    "SellerHandlerFacet",
    "TwinHandlerFacet",
    "ProtocolInitializationHandlerFacet",
    "OrchestrationHandlerFacet1",
    "OrchestrationHandlerFacet2",
  ],
  remove: ["OrchestrationHandlerFacet"],
  skipSelectors: {},
  facetsToInit: {
    OrchestrationHandlerFacet1: [], // init only OrchestrationHandlerFacet1, OrchestrationHandlerFacet2 is no-op
    MetaTransactionsHandlerFacet: [
      [
        "0xaaea2fdc2fe9e42a5c77e98666352fc2dbf7b32b9cbf91944089d3602b1a941d",
        "0xf7e469fd36ada03a455f9ae348527498cb8d8a6b6137aa769c2bc8f4cc0ad7e6",
        "0x90b9d701120ba03749f7021324e5fc97438c847380b773bb897ffa9fabab647c",
        "0x6adb0d9c3c70c5c3ec9332cf7e4c4d2c33eb29cb3e55037c79434ef3fada4044",
        "0x0ae2126d006c21c5824ec10ee0dc64d5ef05f858080dd1a92e3dbe198b5f8499",
        "0xa880fd89e679d8c813150b269255a8a9ae46984310cddeb8f344a77bbb4cb0c8",
        "0x1227dbbba1af7882df0c2f368ac78fb2c624a77dcfa783b3512a331d08541945",
        "0x1843b3a936e72dc3423a7820b79df54578eb2321480ad2f0c6191b7a2c500174",
        "0x2230dd12e924aa859ef57ec4dade101275616eb92217d01ec74d9efe2f6e6aa6",
        "0x4e534c9650f9ac7d5c03f8c48b0522522a613d6214bf7ba579412924ab0f9295",
        "0xfa92792a82bab95011388f166520331cc3b3a016362e01f3df45575f206a088c",
        "0x125e35ecb0e80f32093bffe0ee126e07e3081113653234a73157ad1a9428e7b5",
        "0xda14451cc7bdf6d3eb088cbf8cf16395d91652dfeb49155fea8e548623cf58fb",
        "0x0eb1de1c910b5f6b3e081ea9d70ea55b1f63e8687221289e0fd95bb63b7f0267",
        "0x7c016ad538b2b5ce85140e48fb6abe43e7ab43b31b114aae967303c96a22f901",
        "0x04f63e12403cb2deb13216a684596fc0a94e03dd09a917ea334ad614d4265c56",
        "0x20a68d25bd6cc258f86e9470a6f721a0c0d78f136b2cf060800568be00bae41b",
        "0x42443efdfc55a8186beaa746c4c9cb35eb3548b30d041a7e394ad7056aaeb83a",
        "0xae707f1e32af7522193cb7fc73109343421ddc883a6a0a4dfbc867ddfc7224ba",
        "0xf7d95f3bb0dbce2f73cdc7ba81489e84901014795d94cdaa35d28446803e96e4",
        "0xfb50e2350c3bb4f09d6e5db77ea5f63dcedbad1f5d95b8ec5b3baec8bfc13e94",
        "0xa5c1674e620c21e2f21f5c1faae4ce84afbd8427e2ff31514412c9ce0737725a",
        "0xdfdcd6135be7ca49767c5f46cf5299f807d20465cfa6bbfd2c53e78c1f5d5d43",
        "0xb4dcefaf4091c503ee1183c6892061bd8b0d7bbfd691734068c3408c6080c512",
        "0x65f65c948d22c455a7cdc716108ceb3e47b011fff5dcd04af5d01259045312cb",
        "0xbed3ac5024241532a75d94ae773c337b68153785c80a53cc5d1fca9cc67edd1c",
        "0x1f317d1c833d4ab29c44bcc446c31b0c3b34e8e9bd89a352476c6aa134ce819d",
        "0x5f119c40938c3ae05dcadcac680748ccc14f460b341454412abc3329b6751bc9",
        "0x58477db8afd1115f4a8e27ae4284ae8c1b4b9487b287273dca9d2adee8cfbf3d",
        "0x492edd2840bfa58042eb1b8390dfb5353ea588da111ce69dcd63abdbc07de001",
        "0x18170b73b12e66f1bfce19ffd5cd452a578d79a836db53be0d8ac67e8eaceb69",
        "0x229f69432b8d68fefb34adffa3fb8b5c570c343c26221a6f6f12a8d430f7b3c3",
        "0x7b02365d7cb10a5594ae9167f695d5f2b000c870c3e1234bce9b92ff11e81f1c",
        "0x1c6d6b5ed1e326c8b9c8e98d9fbb0a5eb39512bcf9fb33d81c6f3db58599d526",
        "0x79a5fea918bca323054271090b522a46b6d6cb3ccc95209defbcf4c45d492429",
        "0xa07fcc70c56b1cb2044c9a67496d53c6f7917ba096b643debdf405e55e5e49cd",
        "0x685ef733ac3593f8717a833b61899824a7dbdd369abcc9654f645969504f9c5b",
        "0x11ec86930fbd8bd9e4eefe71220f517bf8452e8fa6bfa392f855308c0676c991",
        "0x4ff2e05649742b3d27ffcc7d11ff8dbcc4d0505fb4e5fb809e3ad610a624a6d7",
        "0xc1c96af89a34084bccc5d426d6b90b7261d20475e2cf693fa4b4b23274d43730",
        "0x20dead55d3c8b1b471af73c8ce8e057cd9347260c6ee844343951965ce4bb5e5",
        "0xcb5fcf36e049de1f1a0a7b504e72ef51aa215f0fff1ce6df3c50b5d7374d3ef1",
        "0x44c64d38103a262e536c7d44b00850ee7d39568e0a5e23a07cc0db96d8ca588b",
        "0xdf3ce320c0a4e7295bf81a5ad49769fcb25784d66f5d4a39b978501163fda0dd",
        "0xcc00c0613629c16c77d0f383611bdc1dd0be75cce1266e5bb757a2c1b5fbf349",
        "0xdb7af92f84da228054781ac9bf5783f28ebcc1d9ac26648188455e8b32e0f98e",
        "0x032d340086ce77dc295769f1ad6aeac806c72c402c2c761e83547aeafc1eff38",
        "0x4915907bc4b6b677a3fb6bb7862f7f63f7ef6bed8cfb0ccebd43a02556656376",
        "0x12b52cf58b53505833cfe90f93fce86e29e512b64543a64e345eb11dde029659",
        "0x34fa96a697bb35f3a16a0ecd1fbbca12f084d2fe335fc54eb4a7032092c74c33",
        "0x3635882429ecf7427e1d090edff7038f6d8b32e69247f4dfcc8bb1aea18e7617",
        "0x1b002277f50ea47601c7446146c19b0603fc425d8b3db37aa07e12271713db19",
        "0x3e03b0f6491639aad746484d776881edb4b355319b1a7fbf77e1a05d5c0139a2",
        "0xa9112e4fed4fa781999648359503a41c94960f39778f7b5c93d4145f77383a37",
        "0xa29ec520951c13764482343b57316dfa475353ed15c39f96687d0b197d57798f",
        "0xf11a3f76eef7527c0690e7680ed3685028bfce2c2a94de2daf0e4ddc1ebd8d99",
        "0xc559f8c0fd3e54e987938ad25d75dcb8171e1ad327ae0fa8dfc896df0defad97",
        "0x088177c89f07128f658d1605a229e33d6cea2f974744e08c17a7a400db6cb91d",
        "0x0568624426a2ae4a64888e7e5938460834a3ed753a7f3726360d325908d47399",
        "0x0b1bb60854d611e75ddd006cf363e547eec8e9b3f43d0bcc4979ab78d09eb6b8",
        "0x97a6f155d7dafa8b1117ef2d0236f849f55cddfec075df22bbe28961298faae7",
        "0x4d0b4b57e5bc08e4b53bf9c63e5bf33ab519052fb083fb51d10e7be52fc2284e",
        "0xe82544ed1c543f9e425b2cec7421b24475dc2b482e7d84590821b2057f6a3147",
        "0xc17de2b6bdd5f69e4bf051a92080e8844085dd3cb2d00833c3281b16574438c4",
        "0x7abd4dabe991628e239c90bb55cd44fd805f97b6e306e55184f467072e5d08b1",
        "0xf81f7640f0a8157fc42f4923d30a5a098624e1d0bfc6c4ee092486e9818042e6",
        "0xb44d17ebf635b4c05bbf970f2099e25db03cec15fcbf5e2585b95c3bb2512362",
        "0x6574e3baf5c3a80b6ede618c3c5c4db8242490b3f9432dd9cb566a5099f0e2ed",
        "0xa290249cf9da6ed767f95dfdebfd34bfc08232a805970f973e56369975f04d6f",
        "0x3f4ba83af89dc9793996d9e56b8abe6dc88cd97c9c2bb23027806e9c1ffd54dc",
        "0x604d5225191b2563b0794fad331fdc1d5b71f1b55399cc9f8048726d984ecc1b",
        "0x37ea92f536655c37b0e15405734272c79fd1ad9d766408b07645615c6783bd54",
        "0xbaafa0e3cf07c4147b323108cb3139a059f27cf5650513fcd988ab2f8a5810aa",
      ],
    ],
  },
  initializationData: "0x0000000000000000000000000000000000000000000000000000000000002710", // input for initV2_2_0, representing maxPremintedVoucher (0x2710=10000)
}

```