/**
 * Config file used to deploy the facets
 *
 * - noArgFacets: list of facet names that don't expect any argument passed into initializer
 * - argFacets: object that specify facet names and arguments that needs to be passed into initializer in format object {facetName: initializerArguments}
 * 
 * Example: 
    {
      noArgFacets: ["Facet1", "Facet2", "Facet3"],
      argFacets: { 
        Facet4: ["0xb0b1d2659e8d5846432c66de8615841cc7bcaf49", 3, true],  // Facet4 expects address, uint256 and bool
        Facet5: [[2, 3, 5, 7, 11]] },                                     // Facet5 uint256 array
    }
 * 
 */

const noArgFacetNames = [
  "AccountHandlerFacet",
  "SellerHandlerFacet",
  "BuyerHandlerFacet",
  "DisputeResolverHandlerFacet",
  "AgentHandlerFacet",
  "BundleHandlerFacet",
  "DisputeHandlerFacet",
  "ExchangeHandlerFacet",
  "FundsHandlerFacet",
  "GroupHandlerFacet",
  "OfferHandlerFacet",
  "OrchestrationHandlerFacet",
  "TwinHandlerFacet",
  "PauseHandlerFacet",
];

// metaTransactionsHandlerFacet initializer arguments. Temporary hardcoded. Will be changed to use `getStateModifyingFunctionsHashes` from `diamond-utils`
const MetaTransactionsHandlerFacetInitArgs = [
  "0xaaea2fdc2fe9e42a5c77e98666352fc2dbf7b32b9cbf91944089d3602b1a941d",
  "0xf7e469fd36ada03a455f9ae348527498cb8d8a6b6137aa769c2bc8f4cc0ad7e6",
  "0x90b9d701120ba03749f7021324e5fc97438c847380b773bb897ffa9fabab647c",
  "0xa7ef6a7cecd210eaf489268d95bf65e4565805cc51de6ea0cf0c4b7bf801fec0",
  "0xa880fd89e679d8c813150b269255a8a9ae46984310cddeb8f344a77bbb4cb0c8",
  "0x1227dbbba1af7882df0c2f368ac78fb2c624a77dcfa783b3512a331d08541945",
  "0x1843b3a936e72dc3423a7820b79df54578eb2321480ad2f0c6191b7a2c500174",
  "0x4e534c9650f9ac7d5c03f8c48b0522522a613d6214bf7ba579412924ab0f9295",
  "0xfa92792a82bab95011388f166520331cc3b3a016362e01f3df45575f206a088c",
  "0x125e35ecb0e80f32093bffe0ee126e07e3081113653234a73157ad1a9428e7b5",
  "0xa07fcc70c56b1cb2044c9a67496d53c6f7917ba096b643debdf405e55e5e49cd",
  "0x685ef733ac3593f8717a833b61899824a7dbdd369abcc9654f645969504f9c5b",
  "0x11ec86930fbd8bd9e4eefe71220f517bf8452e8fa6bfa392f855308c0676c991",
  "0xbed3ac5024241532a75d94ae773c337b68153785c80a53cc5d1fca9cc67edd1c",
  "0x1f317d1c833d4ab29c44bcc446c31b0c3b34e8e9bd89a352476c6aa134ce819d",
  "0x58477db8afd1115f4a8e27ae4284ae8c1b4b9487b287273dca9d2adee8cfbf3d",
  "0x492edd2840bfa58042eb1b8390dfb5353ea588da111ce69dcd63abdbc07de001",
  "0x18170b73b12e66f1bfce19ffd5cd452a578d79a836db53be0d8ac67e8eaceb69",
  "0x229f69432b8d68fefb34adffa3fb8b5c570c343c26221a6f6f12a8d430f7b3c3",
  "0x7b02365d7cb10a5594ae9167f695d5f2b000c870c3e1234bce9b92ff11e81f1c",
  "0x1c6d6b5ed1e326c8b9c8e98d9fbb0a5eb39512bcf9fb33d81c6f3db58599d526",
  "0x79a5fea918bca323054271090b522a46b6d6cb3ccc95209defbcf4c45d492429",
  "0x44c64d38103a262e536c7d44b00850ee7d39568e0a5e23a07cc0db96d8ca588b",
  "0xdf3ce320c0a4e7295bf81a5ad49769fcb25784d66f5d4a39b978501163fda0dd",
  "0xcc00c0613629c16c77d0f383611bdc1dd0be75cce1266e5bb757a2c1b5fbf349",
  "0xdb7af92f84da228054781ac9bf5783f28ebcc1d9ac26648188455e8b32e0f98e",
  "0x4915907bc4b6b677a3fb6bb7862f7f63f7ef6bed8cfb0ccebd43a02556656376",
  "0x12b52cf58b53505833cfe90f93fce86e29e512b64543a64e345eb11dde029659",
  "0xb44d17ebf635b4c05bbf970f2099e25db03cec15fcbf5e2585b95c3bb2512362",
  "0x6574e3baf5c3a80b6ede618c3c5c4db8242490b3f9432dd9cb566a5099f0e2ed",
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
  "0xa290249cf9da6ed767f95dfdebfd34bfc08232a805970f973e56369975f04d6f",
  "0x3f4ba83af89dc9793996d9e56b8abe6dc88cd97c9c2bb23027806e9c1ffd54dc",
  "0x6adb0d9c3c70c5c3ec9332cf7e4c4d2c33eb29cb3e55037c79434ef3fada4044",
  "0x0ae2126d006c21c5824ec10ee0dc64d5ef05f858080dd1a92e3dbe198b5f8499",
  "0x37ea92f536655c37b0e15405734272c79fd1ad9d766408b07645615c6783bd54",
  "0x64a30d6f8a6a5e406f9f0086aac1e7b5d6f4ab8337a31e79273473d401362092",
];

module.exports = {
  noArgFacets: noArgFacetNames,
  argFacets: { MetaTransactionsHandlerFacet: [MetaTransactionsHandlerFacetInitArgs] },
};
