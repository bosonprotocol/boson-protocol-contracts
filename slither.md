Summary
 - [arbitrary-send-erc20](#arbitrary-send-erc20) (1 results) (High)
 - [controlled-delegatecall](#controlled-delegatecall) (1 results) (High)
 - [name-reused](#name-reused) (4 results) (High)
 - [suicidal](#suicidal) (1 results) (High)
 - [divide-before-multiply](#divide-before-multiply) (16 results) (Medium)
 - [incorrect-equality](#incorrect-equality) (2 results) (Medium)
 - [locked-ether](#locked-ether) (5 results) (Medium)
 - [reentrancy-no-eth](#reentrancy-no-eth) (1 results) (Medium)
 - [uninitialized-local](#uninitialized-local) (35 results) (Medium)
 - [unused-return](#unused-return) (9 results) (Medium)
 - [shadowing-local](#shadowing-local) (5 results) (Low)
 - [missing-zero-check](#missing-zero-check) (4 results) (Low)
 - [calls-loop](#calls-loop) (6 results) (Low)
 - [variable-scope](#variable-scope) (14 results) (Low)
 - [reentrancy-benign](#reentrancy-benign) (1 results) (Low)
 - [reentrancy-events](#reentrancy-events) (15 results) (Low)
 - [timestamp](#timestamp) (20 results) (Low)
 - [assembly](#assembly) (32 results) (Informational)
 - [pragma](#pragma) (1 results) (Informational)
 - [dead-code](#dead-code) (26 results) (Informational)
 - [solc-version](#solc-version) (148 results) (Informational)
 - [low-level-calls](#low-level-calls) (11 results) (Informational)
 - [naming-convention](#naming-convention) (613 results) (Informational)
 - [similar-names](#similar-names) (72 results) (Informational)
 - [too-many-digits](#too-many-digits) (3 results) (Informational)
 - [unused-state](#unused-state) (1 results) (Informational)
 - [immutable-states](#immutable-states) (5 results) (Optimization)
## arbitrary-send-erc20
Impact: High
Confidence: High
 - [ ] ID-0
[FundsLib.transferFundsToProtocol(address,uint256)](contracts/protocol/libs/FundsLib.sol#L243-L257) uses arbitrary from in transferFrom: [IERC20(_tokenAddress).safeTransferFrom(EIP712Lib.msgSender(),address(this),_amount)](contracts/protocol/libs/FundsLib.sol#L249)

contracts/protocol/libs/FundsLib.sol#L243-L257


## controlled-delegatecall
Impact: High
Confidence: Medium
 - [ ] ID-1
[ProtocolInitializationHandlerFacet.initialize(bytes32,address[],bytes[],bool,bytes,bytes4[],bytes4[])](contracts/protocol/facets/ProtocolInitializationHandlerFacet.sol#L40-L80) uses delegatecall to a input-controlled function id
	- [(success,error) = _addresses[i].delegatecall(_calldata[i])](contracts/protocol/facets/ProtocolInitializationHandlerFacet.sol#L54)

contracts/protocol/facets/ProtocolInitializationHandlerFacet.sol#L40-L80


## name-reused
Impact: High
Confidence: High
 - [ ] ID-2
Strings is re-used:
	- [Strings](node_modules/@openzeppelin/contracts/utils/Strings.sol#L11-L70)
	- [Strings](contracts/ext_libs/Strings.sol#L11-L70)

node_modules/@openzeppelin/contracts/utils/Strings.sol#L11-L70


 - [ ] ID-3
IERC20Metadata is re-used:
	- [IERC20Metadata](node_modules/@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol#L13-L28)
	- [IERC20Metadata](contracts/interfaces/IERC20Metadata.sol#L11-L26)

node_modules/@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol#L13-L28


 - [ ] ID-4
Math is re-used:
	- [Math](node_modules/@openzeppelin/contracts/utils/math/Math.sol#L9-L345)
	- [Math](contracts/ext_libs/Math.sol#L9-L345)

node_modules/@openzeppelin/contracts/utils/math/Math.sol#L9-L345


 - [ ] ID-5
IERC20 is re-used:
	- [IERC20](node_modules/@openzeppelin/contracts/token/ERC20/IERC20.sol#L9-L82)
	- [IERC20](contracts/interfaces/IERC20.sol#L7-L80)

node_modules/@openzeppelin/contracts/token/ERC20/IERC20.sol#L9-L82


## suicidal
Impact: High
Confidence: High
 - [ ] ID-6
[Foreign20.destruct()](contracts/mock/Foreign20.sol#L59-L61) allows anyone to destruct the contract

contracts/mock/Foreign20.sol#L59-L61


## divide-before-multiply
Impact: Medium
Confidence: Medium
 - [ ] ID-7
[Math.mulDiv(uint256,uint256,uint256)](contracts/ext_libs/Math.sol#L55-L135) performs a multiplication on the result of a division:
	- [denominator = denominator / twos](contracts/ext_libs/Math.sol#L102)
	- [inverse *= 2 - denominator * inverse](contracts/ext_libs/Math.sol#L123)

contracts/ext_libs/Math.sol#L55-L135


 - [ ] ID-8
[Math.mulDiv(uint256,uint256,uint256)](contracts/ext_libs/Math.sol#L55-L135) performs a multiplication on the result of a division:
	- [denominator = denominator / twos](contracts/ext_libs/Math.sol#L102)
	- [inverse *= 2 - denominator * inverse](contracts/ext_libs/Math.sol#L121)

contracts/ext_libs/Math.sol#L55-L135


 - [ ] ID-9
[Math.mulDiv(uint256,uint256,uint256)](node_modules/@openzeppelin/contracts/utils/math/Math.sol#L55-L135) performs a multiplication on the result of a division:
	- [denominator = denominator / twos](node_modules/@openzeppelin/contracts/utils/math/Math.sol#L102)
	- [inverse *= 2 - denominator * inverse](node_modules/@openzeppelin/contracts/utils/math/Math.sol#L126)

node_modules/@openzeppelin/contracts/utils/math/Math.sol#L55-L135


 - [ ] ID-10
[Math.mulDiv(uint256,uint256,uint256)](node_modules/@openzeppelin/contracts/utils/math/Math.sol#L55-L135) performs a multiplication on the result of a division:
	- [denominator = denominator / twos](node_modules/@openzeppelin/contracts/utils/math/Math.sol#L102)
	- [inverse *= 2 - denominator * inverse](node_modules/@openzeppelin/contracts/utils/math/Math.sol#L124)

node_modules/@openzeppelin/contracts/utils/math/Math.sol#L55-L135


 - [ ] ID-11
[Math.mulDiv(uint256,uint256,uint256)](contracts/ext_libs/Math.sol#L55-L135) performs a multiplication on the result of a division:
	- [denominator = denominator / twos](contracts/ext_libs/Math.sol#L102)
	- [inverse *= 2 - denominator * inverse](contracts/ext_libs/Math.sol#L124)

contracts/ext_libs/Math.sol#L55-L135


 - [ ] ID-12
[Math.mulDiv(uint256,uint256,uint256)](contracts/ext_libs/Math.sol#L55-L135) performs a multiplication on the result of a division:
	- [prod0 = prod0 / twos](contracts/ext_libs/Math.sol#L105)
	- [result = prod0 * inverse](contracts/ext_libs/Math.sol#L132)

contracts/ext_libs/Math.sol#L55-L135


 - [ ] ID-13
[Math.mulDiv(uint256,uint256,uint256)](node_modules/@openzeppelin/contracts/utils/math/Math.sol#L55-L135) performs a multiplication on the result of a division:
	- [denominator = denominator / twos](node_modules/@openzeppelin/contracts/utils/math/Math.sol#L102)
	- [inverse *= 2 - denominator * inverse](node_modules/@openzeppelin/contracts/utils/math/Math.sol#L123)

node_modules/@openzeppelin/contracts/utils/math/Math.sol#L55-L135


 - [ ] ID-14
[Math.mulDiv(uint256,uint256,uint256)](node_modules/@openzeppelin/contracts/utils/math/Math.sol#L55-L135) performs a multiplication on the result of a division:
	- [denominator = denominator / twos](node_modules/@openzeppelin/contracts/utils/math/Math.sol#L102)
	- [inverse *= 2 - denominator * inverse](node_modules/@openzeppelin/contracts/utils/math/Math.sol#L121)

node_modules/@openzeppelin/contracts/utils/math/Math.sol#L55-L135


 - [ ] ID-15
[Math.mulDiv(uint256,uint256,uint256)](node_modules/@openzeppelin/contracts/utils/math/Math.sol#L55-L135) performs a multiplication on the result of a division:
	- [denominator = denominator / twos](node_modules/@openzeppelin/contracts/utils/math/Math.sol#L102)
	- [inverse = (3 * denominator) ^ 2](node_modules/@openzeppelin/contracts/utils/math/Math.sol#L117)

node_modules/@openzeppelin/contracts/utils/math/Math.sol#L55-L135


 - [ ] ID-16
[Math.mulDiv(uint256,uint256,uint256)](contracts/ext_libs/Math.sol#L55-L135) performs a multiplication on the result of a division:
	- [denominator = denominator / twos](contracts/ext_libs/Math.sol#L102)
	- [inverse *= 2 - denominator * inverse](contracts/ext_libs/Math.sol#L125)

contracts/ext_libs/Math.sol#L55-L135


 - [ ] ID-17
[Math.mulDiv(uint256,uint256,uint256)](contracts/ext_libs/Math.sol#L55-L135) performs a multiplication on the result of a division:
	- [denominator = denominator / twos](contracts/ext_libs/Math.sol#L102)
	- [inverse *= 2 - denominator * inverse](contracts/ext_libs/Math.sol#L122)

contracts/ext_libs/Math.sol#L55-L135


 - [ ] ID-18
[Math.mulDiv(uint256,uint256,uint256)](node_modules/@openzeppelin/contracts/utils/math/Math.sol#L55-L135) performs a multiplication on the result of a division:
	- [denominator = denominator / twos](node_modules/@openzeppelin/contracts/utils/math/Math.sol#L102)
	- [inverse *= 2 - denominator * inverse](node_modules/@openzeppelin/contracts/utils/math/Math.sol#L122)

node_modules/@openzeppelin/contracts/utils/math/Math.sol#L55-L135


 - [ ] ID-19
[Math.mulDiv(uint256,uint256,uint256)](node_modules/@openzeppelin/contracts/utils/math/Math.sol#L55-L135) performs a multiplication on the result of a division:
	- [prod0 = prod0 / twos](node_modules/@openzeppelin/contracts/utils/math/Math.sol#L105)
	- [result = prod0 * inverse](node_modules/@openzeppelin/contracts/utils/math/Math.sol#L132)

node_modules/@openzeppelin/contracts/utils/math/Math.sol#L55-L135


 - [ ] ID-20
[Math.mulDiv(uint256,uint256,uint256)](contracts/ext_libs/Math.sol#L55-L135) performs a multiplication on the result of a division:
	- [denominator = denominator / twos](contracts/ext_libs/Math.sol#L102)
	- [inverse = (3 * denominator) ^ 2](contracts/ext_libs/Math.sol#L117)

contracts/ext_libs/Math.sol#L55-L135


 - [ ] ID-21
[Math.mulDiv(uint256,uint256,uint256)](node_modules/@openzeppelin/contracts/utils/math/Math.sol#L55-L135) performs a multiplication on the result of a division:
	- [denominator = denominator / twos](node_modules/@openzeppelin/contracts/utils/math/Math.sol#L102)
	- [inverse *= 2 - denominator * inverse](node_modules/@openzeppelin/contracts/utils/math/Math.sol#L125)

node_modules/@openzeppelin/contracts/utils/math/Math.sol#L55-L135


 - [ ] ID-22
[Math.mulDiv(uint256,uint256,uint256)](contracts/ext_libs/Math.sol#L55-L135) performs a multiplication on the result of a division:
	- [denominator = denominator / twos](contracts/ext_libs/Math.sol#L102)
	- [inverse *= 2 - denominator * inverse](contracts/ext_libs/Math.sol#L126)

contracts/ext_libs/Math.sol#L55-L135


## incorrect-equality
Impact: Medium
Confidence: High
 - [ ] ID-23
[FundsLib.transferFundsToProtocol(address,uint256)](contracts/protocol/libs/FundsLib.sol#L243-L257) uses a dangerous strict equality:
	- [require(bool,string)(protocolTokenBalanceAfter - protocolTokenBalanceBefore == _amount,INSUFFICIENT_VALUE_RECEIVED)](contracts/protocol/libs/FundsLib.sol#L255)

contracts/protocol/libs/FundsLib.sol#L243-L257


 - [ ] ID-24
[SnapshotGate.transferFundsToGateAndApproveProtocol(address,uint256)](contracts/example/SnapshotGate/SnapshotGate.sol#L278-L300) uses a dangerous strict equality:
	- [require(bool,string)(tokenBalanceAfter - tokenBalanceBefore == _amount,Incorrect value received on transfer to gate)](contracts/example/SnapshotGate/SnapshotGate.sol#L294)

contracts/example/SnapshotGate/SnapshotGate.sol#L278-L300


## locked-ether
Impact: Medium
Confidence: High
 - [ ] ID-25
Contract locking ether found:
	Contract [BosonToken](contracts/mock/BosonToken.sol#L9-L67) has payable functions:
	 - [BosonToken.receive()](contracts/mock/BosonToken.sol#L66)
	But does not have a function to withdraw the ether

contracts/mock/BosonToken.sol#L9-L67


 - [ ] ID-26
Contract locking ether found:
	Contract [ClientProxy](contracts/protocol/clients/proxy/ClientProxy.sol#L25-L41) has payable functions:
	 - [Proxy.fallback()](contracts/protocol/clients/proxy/Proxy.sol#L70-L72)
	 - [Proxy.receive()](contracts/protocol/clients/proxy/Proxy.sol#L78-L80)
	But does not have a function to withdraw the ether

contracts/protocol/clients/proxy/ClientProxy.sol#L25-L41


 - [ ] ID-27
Contract locking ether found:
	Contract [FallbackError](contracts/mock/FallbackError.sol#L35-L42) has payable functions:
	 - [FallbackError.receive()](contracts/mock/FallbackError.sol#L39-L41)
	But does not have a function to withdraw the ether

contracts/mock/FallbackError.sol#L35-L42


 - [ ] ID-28
Contract locking ether found:
	Contract [MockNativeMetaTransaction](contracts/mock/MockNativeMetaTransaction.sol#L8-L78) has payable functions:
	 - [MockNativeMetaTransaction.executeMetaTransaction(MockNativeMetaTransaction.MetaTransaction,bytes32,bytes32,uint8)](contracts/mock/MockNativeMetaTransaction.sol#L30-L50)
	But does not have a function to withdraw the ether

contracts/mock/MockNativeMetaTransaction.sol#L8-L78


 - [ ] ID-29
Contract locking ether found:
	Contract [BeaconClientProxy](contracts/protocol/clients/proxy/BeaconClientProxy.sol#L22-L54) has payable functions:
	 - [Proxy.fallback()](contracts/protocol/clients/proxy/Proxy.sol#L70-L72)
	 - [Proxy.receive()](contracts/protocol/clients/proxy/Proxy.sol#L78-L80)
	But does not have a function to withdraw the ether

contracts/protocol/clients/proxy/BeaconClientProxy.sol#L22-L54


## reentrancy-no-eth
Impact: Medium
Confidence: Medium
 - [ ] ID-30
Reentrancy in [BosonVoucherBase._beforeTokenTransfer(address,address,uint256)](contracts/protocol/clients/voucher/BosonVoucher.sol#L639-L666):
	External calls:
	- [IBosonExchangeHandler(protocolDiamond).commitToPreMintedOffer(address(_to),_premintStatus.offerId,_tokenId)](contracts/protocol/clients/voucher/BosonVoucher.sol#L653-L657)
	State variables written after the call(s):
	- [delete _premintStatus](contracts/protocol/clients/voucher/BosonVoucher.sol#L658)
	[BosonVoucherBase._premintStatus](contracts/protocol/clients/voucher/BosonVoucher.sol#L68) can be used in cross function reentrancies:
	- [BosonVoucherBase._beforeTokenTransfer(address,address,uint256)](contracts/protocol/clients/voucher/BosonVoucher.sol#L639-L666)
	- [BosonVoucherBase.safeTransferFrom(address,address,uint256,bytes)](contracts/protocol/clients/voucher/BosonVoucher.sol#L412-L428)
	- [BosonVoucherBase.transferFrom(address,address,uint256)](contracts/protocol/clients/voucher/BosonVoucher.sol#L392-L407)

contracts/protocol/clients/voucher/BosonVoucher.sol#L639-L666


## uninitialized-local
Impact: Medium
Confidence: Medium
 - [ ] ID-31
[FundsHandlerFacet.getAvailableFunds(uint256).name](contracts/protocol/facets/FundsHandlerFacet.sol#L183) is a local variable never initialized

contracts/protocol/facets/FundsHandlerFacet.sol#L183


 - [ ] ID-32
[ERC1155Upgradeable._doSafeTransferAcceptanceCheck(address,address,address,uint256,uint256,bytes).response](node_modules/@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol#L481) is a local variable never initialized

node_modules/@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol#L481


 - [ ] ID-33
[FundsLib.releaseFunds(uint256).buyerPayoff](contracts/protocol/libs/FundsLib.sol#L147) is a local variable never initialized

contracts/protocol/libs/FundsLib.sol#L147


 - [ ] ID-34
[ExchangeHandlerFacet.transferTwins(BosonTypes.Exchange,BosonTypes.Voucher).transferFailed](contracts/protocol/facets/ExchangeHandlerFacet.sol#L718) is a local variable never initialized

contracts/protocol/facets/ExchangeHandlerFacet.sol#L718


 - [ ] ID-35
[MockExchangeHandlerFacet.transferTwins(BosonTypes.Exchange,BosonTypes.Voucher).success](contracts/mock/MockExchangeHandlerFacet.sol#L416) is a local variable never initialized

contracts/mock/MockExchangeHandlerFacet.sol#L416


 - [ ] ID-36
[FundsLib.releaseFunds(uint256).agentFee](contracts/protocol/libs/FundsLib.sol#L149) is a local variable never initialized

contracts/protocol/libs/FundsLib.sol#L149


 - [ ] ID-37
[OrchestrationHandlerFacet1.createTwinAndBundleAfterOffer(BosonTypes.Twin,uint256,uint256)._bundle](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1278) is a local variable never initialized

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1278


 - [ ] ID-38
[TwinBase.isProtocolApproved(address,address,address)._allowance](contracts/protocol/bases/TwinBase.sol#L175) is a local variable never initialized

contracts/protocol/bases/TwinBase.sol#L175


 - [ ] ID-39
[JewelerLib.diamondCut(IDiamondCut.FacetCut[],address,bytes).facetIndex](contracts/diamond/JewelerLib.sol#L65) is a local variable never initialized

contracts/diamond/JewelerLib.sol#L65


 - [ ] ID-40
[DisputeResolverHandlerFacet.optInToDisputeResolverUpdate(uint256,BosonTypes.DisputeResolverUpdateFields[]).updateApplied](contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L325) is a local variable never initialized

contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L325


 - [ ] ID-41
[SellerHandlerFacet.optInToSellerUpdate(uint256,BosonTypes.SellerUpdateFields[]).updateApplied](contracts/protocol/facets/SellerHandlerFacet.sol#L210) is a local variable never initialized

contracts/protocol/facets/SellerHandlerFacet.sol#L210


 - [ ] ID-42
[BosonVoucherBase.burnPremintedVouchers(uint256).burned](contracts/protocol/clients/voucher/BosonVoucher.sol#L308) is a local variable never initialized

contracts/protocol/clients/voucher/BosonVoucher.sol#L308


 - [ ] ID-43
[JewelerLib.addReplaceRemoveFacetSelectors(uint256,bytes32,address,IDiamondCut.FacetCutAction,bytes4[]).selectorIndex_scope_3](contracts/diamond/JewelerLib.sol#L189) is a local variable never initialized

contracts/diamond/JewelerLib.sol#L189


 - [ ] ID-44
[TwinBase.contractSupportsInterface(address,bytes4).supported](contracts/protocol/bases/TwinBase.sol#L153) is a local variable never initialized

contracts/protocol/bases/TwinBase.sol#L153


 - [ ] ID-45
[FundsLib.releaseFunds(uint256).sellerPayoff](contracts/protocol/libs/FundsLib.sol#L146) is a local variable never initialized

contracts/protocol/libs/FundsLib.sol#L146


 - [ ] ID-46
[FundsLib.releaseFunds(uint256).protocolFee](contracts/protocol/libs/FundsLib.sol#L148) is a local variable never initialized

contracts/protocol/libs/FundsLib.sol#L148


 - [ ] ID-47
[ExchangeHandlerFacet.transferTwins(BosonTypes.Exchange,BosonTypes.Voucher).result](contracts/protocol/facets/ExchangeHandlerFacet.sol#L733) is a local variable never initialized

contracts/protocol/facets/ExchangeHandlerFacet.sol#L733


 - [ ] ID-48
[FundsHandlerFacet.getAvailableFunds(uint256).tokenName](contracts/protocol/facets/FundsHandlerFacet.sol#L176) is a local variable never initialized

contracts/protocol/facets/FundsHandlerFacet.sol#L176


 - [ ] ID-49
[OfferBase.storeOffer(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256).disputeResolutionTerms](contracts/protocol/bases/OfferBase.sol#L156) is a local variable never initialized

contracts/protocol/bases/OfferBase.sol#L156


 - [ ] ID-50
[ExchangeHandlerFacet.getValidBuyer(address).newBuyer](contracts/protocol/facets/ExchangeHandlerFacet.sol#L834) is a local variable never initialized

contracts/protocol/facets/ExchangeHandlerFacet.sol#L834


 - [ ] ID-51
[JewelerLib.addReplaceRemoveFacetSelectors(uint256,bytes32,address,IDiamondCut.FacetCutAction,bytes4[]).selectorIndex_scope_0](contracts/diamond/JewelerLib.sol#L161) is a local variable never initialized

contracts/diamond/JewelerLib.sol#L161


 - [ ] ID-52
[MockExchangeHandlerFacet.transferTwins(BosonTypes.Exchange,BosonTypes.Voucher).transferFailed](contracts/mock/MockExchangeHandlerFacet.sol#L404) is a local variable never initialized

contracts/mock/MockExchangeHandlerFacet.sol#L404


 - [ ] ID-53
[OrchestrationHandlerFacet1.createOfferWithCondition(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.Condition,uint256)._group](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L234) is a local variable never initialized

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L234


 - [ ] ID-54
[DisputeResolverHandlerFacet.updateDisputeResolver(BosonTypes.DisputeResolver).needsApproval](contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L221) is a local variable never initialized

contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L221


 - [ ] ID-55
[JewelerLib.addReplaceRemoveFacetSelectors(uint256,bytes32,address,IDiamondCut.FacetCutAction,bytes4[]).selectorIndex](contracts/diamond/JewelerLib.sol#L127) is a local variable never initialized

contracts/diamond/JewelerLib.sol#L127


 - [ ] ID-56
[DisputeResolverHandlerFacet.updateDisputeResolver(BosonTypes.DisputeResolver).updateApplied](contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L250) is a local variable never initialized

contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L250


 - [ ] ID-57
[ERC1155Upgradeable._doSafeBatchTransferAcceptanceCheck(address,address,address,uint256[],uint256[],bytes).reason](node_modules/@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol#L508) is a local variable never initialized

node_modules/@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol#L508


 - [ ] ID-58
[ERC1155Upgradeable._doSafeTransferAcceptanceCheck(address,address,address,uint256,uint256,bytes).reason](node_modules/@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol#L485) is a local variable never initialized

node_modules/@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol#L485


 - [ ] ID-59
[TwinBase.isProtocolApproved(address,address,address)._isApproved](contracts/protocol/bases/TwinBase.sol#L180) is a local variable never initialized

contracts/protocol/bases/TwinBase.sol#L180


 - [ ] ID-60
[FundsHandlerFacet.withdrawFunds(uint256,address[],uint256[]).destinationAddress](contracts/protocol/facets/FundsHandlerFacet.sol#L98) is a local variable never initialized

contracts/protocol/facets/FundsHandlerFacet.sol#L98


 - [ ] ID-61
[ERC1155Upgradeable._doSafeBatchTransferAcceptanceCheck(address,address,address,uint256[],uint256[],bytes).response](node_modules/@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol#L503) is a local variable never initialized

node_modules/@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol#L503


 - [ ] ID-62
[MockExchangeHandlerFacet.transferTwins(BosonTypes.Exchange,BosonTypes.Voucher).result](contracts/mock/MockExchangeHandlerFacet.sol#L415) is a local variable never initialized

contracts/mock/MockExchangeHandlerFacet.sol#L415


 - [ ] ID-63
[MetaTransactionsHandlerFacet.executeMetaTransaction(address,string,bytes,uint256,bytes32,bytes32,uint8).metaTx](contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L303) is a local variable never initialized

contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L303


 - [ ] ID-64
[SellerHandlerFacet.updateSeller(BosonTypes.Seller,BosonTypes.AuthToken).needsApproval](contracts/protocol/facets/SellerHandlerFacet.sol#L115) is a local variable never initialized

contracts/protocol/facets/SellerHandlerFacet.sol#L115


 - [ ] ID-65
[ExchangeHandlerFacet.transferTwins(BosonTypes.Exchange,BosonTypes.Voucher).success](contracts/protocol/facets/ExchangeHandlerFacet.sol#L734) is a local variable never initialized

contracts/protocol/facets/ExchangeHandlerFacet.sol#L734


## unused-return
Impact: Medium
Confidence: Medium
 - [ ] ID-66
[TwinBase.contractSupportsInterface(address,bytes4)](contracts/protocol/bases/TwinBase.sol#L152-L158) ignores return value by [ITwinToken(_tokenAddress).supportsInterface(_interfaceId)](contracts/protocol/bases/TwinBase.sol#L153-L157)

contracts/protocol/bases/TwinBase.sol#L152-L158


 - [ ] ID-67
[ERC1155Upgradeable._doSafeTransferAcceptanceCheck(address,address,address,uint256,uint256,bytes)](node_modules/@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol#L472-L491) ignores return value by [IERC1155ReceiverUpgradeable(to).onERC1155Received(operator,from,id,amount,data)](node_modules/@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol#L481-L489)

node_modules/@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol#L472-L491


 - [ ] ID-68
[ERC721Upgradeable._checkOnERC721Received(address,address,uint256,bytes)](node_modules/@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol#L399-L421) ignores return value by [IERC721ReceiverUpgradeable(to).onERC721Received(_msgSender(),from,tokenId,data)](node_modules/@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol#L406-L417)

node_modules/@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol#L399-L421


 - [ ] ID-69
[Foreign20Malicious2._afterTokenTransfer(address,address,uint256)](contracts/mock/Foreign20.sol#L148-L168) ignores return value by [IBosonMetaTransactionsHandler(msg.sender).executeMetaTransaction(attacker,getNextExchangeId(),metaTxBytes,0,sigR,sigS,sigV)](contracts/mock/Foreign20.sol#L158-L166)

contracts/mock/Foreign20.sol#L148-L168


 - [ ] ID-70
[TwinBase.isProtocolApproved(address,address,address)](contracts/protocol/bases/TwinBase.sol#L168-L186) ignores return value by [ITwinToken(_tokenAddress).isApprovedForAll(_operator,_protocol)](contracts/protocol/bases/TwinBase.sol#L180-L184)

contracts/protocol/bases/TwinBase.sol#L168-L186


 - [ ] ID-71
[ERC721._checkOnERC721Received(address,address,uint256,bytes)](contracts/example/SnapshotGate/support/ERC721.sol#L387-L409) ignores return value by [IERC721Receiver(to).onERC721Received(msg.sender,from,tokenId,data)](contracts/example/SnapshotGate/support/ERC721.sol#L394-L405)

contracts/example/SnapshotGate/support/ERC721.sol#L387-L409


 - [ ] ID-72
[FundsHandlerFacet.getAvailableFunds(uint256)](contracts/protocol/facets/FundsHandlerFacet.sol#L163-L195) ignores return value by [IERC20Metadata(tokenAddress).name()](contracts/protocol/facets/FundsHandlerFacet.sol#L183-L187)

contracts/protocol/facets/FundsHandlerFacet.sol#L163-L195


 - [ ] ID-73
[ERC1155Upgradeable._doSafeBatchTransferAcceptanceCheck(address,address,address,uint256[],uint256[],bytes)](node_modules/@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol#L493-L514) ignores return value by [IERC1155ReceiverUpgradeable(to).onERC1155BatchReceived(operator,from,ids,amounts,data)](node_modules/@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol#L502-L512)

node_modules/@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol#L493-L514


 - [ ] ID-74
[TwinBase.isProtocolApproved(address,address,address)](contracts/protocol/bases/TwinBase.sol#L168-L186) ignores return value by [ITwinToken(_tokenAddress).allowance(_operator,_protocol)](contracts/protocol/bases/TwinBase.sol#L175-L185)

contracts/protocol/bases/TwinBase.sol#L168-L186


## shadowing-local
Impact: Low
Confidence: High
 - [ ] ID-75
[SnapshotGate.appendToSnapshot(SnapshotGate.Holder[]).owner](contracts/example/SnapshotGate/SnapshotGate.sol#L145) shadows:
	- [Ownable.owner()](node_modules/@openzeppelin/contracts/access/Ownable.sol#L43-L45) (function)

contracts/example/SnapshotGate/SnapshotGate.sol#L145


 - [ ] ID-76
[SnapshotGate.constructor(string,string,address,uint256)._name](contracts/example/SnapshotGate/SnapshotGate.sol#L116) shadows:
	- [ERC721._name](contracts/example/SnapshotGate/support/ERC721.sol#L20) (state variable)

contracts/example/SnapshotGate/SnapshotGate.sol#L116


 - [ ] ID-77
[SnapshotGate.ownerOf(uint256).owner](contracts/example/SnapshotGate/SnapshotGate.sol#L336) shadows:
	- [Ownable.owner()](node_modules/@openzeppelin/contracts/access/Ownable.sol#L43-L45) (function)

contracts/example/SnapshotGate/SnapshotGate.sol#L336


 - [ ] ID-78
[SnapshotGate.constructor(string,string,address,uint256)._symbol](contracts/example/SnapshotGate/SnapshotGate.sol#L117) shadows:
	- [ERC721._symbol](contracts/example/SnapshotGate/support/ERC721.sol#L23) (state variable)

contracts/example/SnapshotGate/SnapshotGate.sol#L117


 - [ ] ID-79
[BosonVoucherBase.ownerOf(uint256).owner](contracts/protocol/clients/voucher/BosonVoucher.sol#L374) shadows:
	- [OwnableUpgradeable.owner()](node_modules/@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol#L48-L50) (function)

contracts/protocol/clients/voucher/BosonVoucher.sol#L374


## missing-zero-check
Impact: Low
Confidence: Medium
 - [ ] ID-80
[Foreign20Malicious2.setProtocolAddress(address)._newProtocolAddress](contracts/mock/Foreign20.sol#L130) lacks a zero-check on :
		- [protocolAddress = _newProtocolAddress](contracts/mock/Foreign20.sol#L131)

contracts/mock/Foreign20.sol#L130


 - [ ] ID-81
[Foreign20Malicious.setProtocolAddress(address)._newProtocolAddress](contracts/mock/Foreign20.sol#L92) lacks a zero-check on :
		- [protocolAddress = _newProtocolAddress](contracts/mock/Foreign20.sol#L93)

contracts/mock/Foreign20.sol#L92


 - [ ] ID-82
[SnapshotGate.constructor(string,string,address,uint256)._protocol](contracts/example/SnapshotGate/SnapshotGate.sol#L118) lacks a zero-check on :
		- [protocol = _protocol](contracts/example/SnapshotGate/SnapshotGate.sol#L121)

contracts/example/SnapshotGate/SnapshotGate.sol#L118


 - [ ] ID-83
[Foreign20Malicious2.setMetaTxBytes(address,bytes,bytes32,bytes32,uint8)._attacker](contracts/mock/Foreign20.sol#L135) lacks a zero-check on :
		- [attacker = _attacker](contracts/mock/Foreign20.sol#L145)

contracts/mock/Foreign20.sol#L135


## calls-loop
Impact: Low
Confidence: Medium
 - [ ] ID-84
[SellerHandlerFacet.optInToSellerUpdate(uint256,BosonTypes.SellerUpdateFields[])](contracts/protocol/facets/SellerHandlerFacet.sol#L193-L332) has external calls inside a loop: [IBosonVoucher(lookups.cloneAddress[_sellerId]).transferOwnership(sender)](contracts/protocol/facets/SellerHandlerFacet.sol#L257)

contracts/protocol/facets/SellerHandlerFacet.sol#L193-L332


 - [ ] ID-85
[SellerHandlerFacet.optInToSellerUpdate(uint256,BosonTypes.SellerUpdateFields[])](contracts/protocol/facets/SellerHandlerFacet.sol#L193-L332) has external calls inside a loop: [tokenIdOwner = IERC721(authTokenContract).ownerOf(authTokenPendingUpdate.tokenId)](contracts/protocol/facets/SellerHandlerFacet.sol#L288)

contracts/protocol/facets/SellerHandlerFacet.sol#L193-L332


 - [ ] ID-86
[MockExchangeHandlerFacet.burnVoucher(BosonTypes.Exchange)](contracts/mock/MockExchangeHandlerFacet.sol#L360-L368) has external calls inside a loop: [bosonVoucher.burnVoucher(_exchange.id)](contracts/mock/MockExchangeHandlerFacet.sol#L367)

contracts/mock/MockExchangeHandlerFacet.sol#L360-L368


 - [ ] ID-87
[FundsHandlerFacet.getAvailableFunds(uint256)](contracts/protocol/facets/FundsHandlerFacet.sol#L163-L195) has external calls inside a loop: [IERC20Metadata(tokenAddress).name()](contracts/protocol/facets/FundsHandlerFacet.sol#L183-L187)

contracts/protocol/facets/FundsHandlerFacet.sol#L163-L195


 - [ ] ID-88
[ExchangeHandlerFacet.burnVoucher(BosonTypes.Exchange)](contracts/protocol/facets/ExchangeHandlerFacet.sol#L672-L683) has external calls inside a loop: [bosonVoucher.burnVoucher(_exchange.id)](contracts/protocol/facets/ExchangeHandlerFacet.sol#L682)

contracts/protocol/facets/ExchangeHandlerFacet.sol#L672-L683


 - [ ] ID-89
[ProtocolInitializationHandlerFacet.initialize(bytes32,address[],bytes[],bool,bytes,bytes4[],bytes4[])](contracts/protocol/facets/ProtocolInitializationHandlerFacet.sol#L40-L80) has external calls inside a loop: [(success,error) = _addresses[i].delegatecall(_calldata[i])](contracts/protocol/facets/ProtocolInitializationHandlerFacet.sol#L54)

contracts/protocol/facets/ProtocolInitializationHandlerFacet.sol#L40-L80


## variable-scope
Impact: Low
Confidence: High
 - [ ] ID-90
Variable '[ERC721._checkOnERC721Received(address,address,uint256,bytes).reason](contracts/example/SnapshotGate/support/ERC721.sol#L396)' in [ERC721._checkOnERC721Received(address,address,uint256,bytes)](contracts/example/SnapshotGate/support/ERC721.sol#L387-L409) potentially used before declaration: [reason.length == 0](contracts/example/SnapshotGate/support/ERC721.sol#L397)

contracts/example/SnapshotGate/support/ERC721.sol#L396


 - [ ] ID-91
Variable '[ERC721Upgradeable._checkOnERC721Received(address,address,uint256,bytes).reason](node_modules/@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol#L408)' in [ERC721Upgradeable._checkOnERC721Received(address,address,uint256,bytes)](node_modules/@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol#L399-L421) potentially used before declaration: [reason.length == 0](node_modules/@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol#L409)

node_modules/@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol#L408


 - [ ] ID-92
Variable '[ERC721._checkOnERC721Received(address,address,uint256,bytes).retval](contracts/example/SnapshotGate/support/ERC721.sol#L394)' in [ERC721._checkOnERC721Received(address,address,uint256,bytes)](contracts/example/SnapshotGate/support/ERC721.sol#L387-L409) potentially used before declaration: [retval == IERC721Receiver.onERC721Received.selector](contracts/example/SnapshotGate/support/ERC721.sol#L395)

contracts/example/SnapshotGate/support/ERC721.sol#L394


 - [ ] ID-93
Variable '[TwinBase.isProtocolApproved(address,address,address)._allowance](contracts/protocol/bases/TwinBase.sol#L175)' in [TwinBase.isProtocolApproved(address,address,address)](contracts/protocol/bases/TwinBase.sol#L168-L186) potentially used before declaration: [_allowance > 0](contracts/protocol/bases/TwinBase.sol#L176)

contracts/protocol/bases/TwinBase.sol#L175


 - [ ] ID-94
Variable '[ERC1155Upgradeable._doSafeTransferAcceptanceCheck(address,address,address,uint256,uint256,bytes).reason](node_modules/@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol#L485)' in [ERC1155Upgradeable._doSafeTransferAcceptanceCheck(address,address,address,uint256,uint256,bytes)](node_modules/@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol#L472-L491) potentially used before declaration: [revert(string)(reason)](node_modules/@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol#L486)

node_modules/@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol#L485


 - [ ] ID-95
Variable '[ERC721._checkOnERC721Received(address,address,uint256,bytes).reason](contracts/example/SnapshotGate/support/ERC721.sol#L396)' in [ERC721._checkOnERC721Received(address,address,uint256,bytes)](contracts/example/SnapshotGate/support/ERC721.sol#L387-L409) potentially used before declaration: [revert(uint256,uint256)(32 + reason,mload(uint256)(reason))](contracts/example/SnapshotGate/support/ERC721.sol#L402)

contracts/example/SnapshotGate/support/ERC721.sol#L396


 - [ ] ID-96
Variable '[ERC1155Upgradeable._doSafeBatchTransferAcceptanceCheck(address,address,address,uint256[],uint256[],bytes).response](node_modules/@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol#L503)' in [ERC1155Upgradeable._doSafeBatchTransferAcceptanceCheck(address,address,address,uint256[],uint256[],bytes)](node_modules/@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol#L493-L514) potentially used before declaration: [response != IERC1155ReceiverUpgradeable.onERC1155BatchReceived.selector](node_modules/@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol#L505)

node_modules/@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol#L503


 - [ ] ID-97
Variable '[ERC1155Upgradeable._doSafeTransferAcceptanceCheck(address,address,address,uint256,uint256,bytes).response](node_modules/@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol#L481)' in [ERC1155Upgradeable._doSafeTransferAcceptanceCheck(address,address,address,uint256,uint256,bytes)](node_modules/@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol#L472-L491) potentially used before declaration: [response != IERC1155ReceiverUpgradeable.onERC1155Received.selector](node_modules/@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol#L482)

node_modules/@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol#L481


 - [ ] ID-98
Variable '[TwinBase.isProtocolApproved(address,address,address)._isApproved](contracts/protocol/bases/TwinBase.sol#L180)' in [TwinBase.isProtocolApproved(address,address,address)](contracts/protocol/bases/TwinBase.sol#L168-L186) potentially used before declaration: [_approved = _isApproved](contracts/protocol/bases/TwinBase.sol#L181)

contracts/protocol/bases/TwinBase.sol#L180


 - [ ] ID-99
Variable '[ERC1155Upgradeable._doSafeBatchTransferAcceptanceCheck(address,address,address,uint256[],uint256[],bytes).reason](node_modules/@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol#L508)' in [ERC1155Upgradeable._doSafeBatchTransferAcceptanceCheck(address,address,address,uint256[],uint256[],bytes)](node_modules/@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol#L493-L514) potentially used before declaration: [revert(string)(reason)](node_modules/@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol#L509)

node_modules/@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol#L508


 - [ ] ID-100
Variable '[TwinBase.contractSupportsInterface(address,bytes4).supported](contracts/protocol/bases/TwinBase.sol#L153)' in [TwinBase.contractSupportsInterface(address,bytes4)](contracts/protocol/bases/TwinBase.sol#L152-L158) potentially used before declaration: [supported](contracts/protocol/bases/TwinBase.sol#L154)

contracts/protocol/bases/TwinBase.sol#L153


 - [ ] ID-101
Variable '[ERC721Upgradeable._checkOnERC721Received(address,address,uint256,bytes).reason](node_modules/@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol#L408)' in [ERC721Upgradeable._checkOnERC721Received(address,address,uint256,bytes)](node_modules/@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol#L399-L421) potentially used before declaration: [revert(uint256,uint256)(32 + reason,mload(uint256)(reason))](node_modules/@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol#L414)

node_modules/@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol#L408


 - [ ] ID-102
Variable '[ERC721Upgradeable._checkOnERC721Received(address,address,uint256,bytes).retval](node_modules/@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol#L406)' in [ERC721Upgradeable._checkOnERC721Received(address,address,uint256,bytes)](node_modules/@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol#L399-L421) potentially used before declaration: [retval == IERC721ReceiverUpgradeable.onERC721Received.selector](node_modules/@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol#L407)

node_modules/@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol#L406


 - [ ] ID-103
Variable '[FundsHandlerFacet.getAvailableFunds(uint256).name](contracts/protocol/facets/FundsHandlerFacet.sol#L183)' in [FundsHandlerFacet.getAvailableFunds(uint256)](contracts/protocol/facets/FundsHandlerFacet.sol#L163-L195) potentially used before declaration: [tokenName = name](contracts/protocol/facets/FundsHandlerFacet.sol#L184)

contracts/protocol/facets/FundsHandlerFacet.sol#L183


## reentrancy-benign
Impact: Low
Confidence: Medium
 - [ ] ID-104
Reentrancy in [SnapshotGate.commitToGatedOffer(address,uint256,uint256)](contracts/example/SnapshotGate/SnapshotGate.sol#L211-L264):
	External calls:
	- [IBosonExchangeHandler(protocol).commitToOffer{value: msg.value}(_buyer,_offerId)](contracts/example/SnapshotGate/SnapshotGate.sol#L250)
	- [transferFundsToGateAndApproveProtocol(offer.exchangeToken,offer.price)](contracts/example/SnapshotGate/SnapshotGate.sol#L253)
		- [returndata = address(token).functionCall(data,SafeERC20: low-level call failed)](contracts/ext_libs/SafeERC20.sol#L47)
		- [(success,returndata) = target.call{value: value}(data)](contracts/ext_libs/Address.sol#L112)
		- [IERC20(_tokenAddress).safeTransferFrom(msg.sender,address(this),_amount)](contracts/example/SnapshotGate/SnapshotGate.sol#L288)
		- [success = IERC20(_tokenAddress).approve(protocol,_amount)](contracts/example/SnapshotGate/SnapshotGate.sol#L297)
	- [IBosonExchangeHandler(protocol).commitToOffer(_buyer,_offerId)](contracts/example/SnapshotGate/SnapshotGate.sol#L256)
	External calls sending eth:
	- [IBosonExchangeHandler(protocol).commitToOffer{value: msg.value}(_buyer,_offerId)](contracts/example/SnapshotGate/SnapshotGate.sol#L250)
	- [transferFundsToGateAndApproveProtocol(offer.exchangeToken,offer.price)](contracts/example/SnapshotGate/SnapshotGate.sol#L253)
		- [(success,returndata) = target.call{value: value}(data)](contracts/ext_libs/Address.sol#L112)
	State variables written after the call(s):
	- [delete txDetails](contracts/example/SnapshotGate/SnapshotGate.sol#L260)

contracts/example/SnapshotGate/SnapshotGate.sol#L211-L264


## reentrancy-events
Impact: Low
Confidence: Medium
 - [ ] ID-105
Reentrancy in [OrchestrationHandlerFacet1.createSellerAndPremintedOffer(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L158-L180):
	External calls:
	- [createSellerAndOffer(_seller,_offer,_offerDates,_offerDurations,_disputeResolverId,_authToken,_voucherInitValues,_agentId)](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L169-L178)
		- [IInitializableVoucherClone(cloneAddress).initialize(pa.voucherBeacon)](contracts/protocol/bases/SellerBase.sol#L180)
		- [IInitializableVoucherClone(cloneAddress).initializeVoucher(_sellerId,_operator,_voucherInitValues)](contracts/protocol/bases/SellerBase.sol#L181)
	- [reserveRangeInternal(_offer.id,_reservedRangeLength)](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L179)
		- [bosonVoucher.reserveRange(_offerId,_startId,_length)](contracts/protocol/bases/OfferBase.sol#L314)
	Event emitted after the call(s):
	- [RangeReserved(_offerId,offer.sellerId,_startId,_startId + _length - 1,msgSender())](contracts/protocol/bases/OfferBase.sol#L325)
		- [reserveRangeInternal(_offer.id,_reservedRangeLength)](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L179)

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L158-L180


 - [ ] ID-106
Reentrancy in [MetaTransactionsHandlerFacet.executeTx(address,string,bytes,uint256)](contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L236-L265):
	External calls:
	- [(success,returnData) = address(this).call{value: msg.value}(_functionSignature)](contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L253)
	Event emitted after the call(s):
	- [MetaTransactionExecuted(_userAddress,msg.sender,_functionName,_nonce)](contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L263)

contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L236-L265


 - [ ] ID-107
Reentrancy in [FundsLib.encumberFunds(uint256,uint256,bool)](contracts/protocol/libs/FundsLib.sol#L65-L95):
	External calls:
	- [validateIncomingPayment(exchangeToken,price)](contracts/protocol/libs/FundsLib.sol#L84)
		- [returndata = address(token).functionCall(data,SafeERC20: low-level call failed)](contracts/ext_libs/SafeERC20.sol#L47)
		- [IERC20(_tokenAddress).safeTransferFrom(EIP712Lib.msgSender(),address(this),_amount)](contracts/protocol/libs/FundsLib.sol#L249)
		- [(success,returndata) = target.call{value: value}(data)](contracts/ext_libs/Address.sol#L112)
	External calls sending eth:
	- [validateIncomingPayment(exchangeToken,price)](contracts/protocol/libs/FundsLib.sol#L84)
		- [(success,returndata) = target.call{value: value}(data)](contracts/ext_libs/Address.sol#L112)
	Event emitted after the call(s):
	- [FundsEncumbered(_buyerId,exchangeToken,price,sender)](contracts/protocol/libs/FundsLib.sol#L85)
	- [FundsEncumbered(sellerId,exchangeToken,sellerFundsEncumbered,sender)](contracts/protocol/libs/FundsLib.sol#L94)

contracts/protocol/libs/FundsLib.sol#L65-L95


 - [ ] ID-108
Reentrancy in [ProtocolInitializationHandlerFacet.initialize(bytes32,address[],bytes[],bool,bytes,bytes4[],bytes4[])](contracts/protocol/facets/ProtocolInitializationHandlerFacet.sol#L40-L80):
	External calls:
	- [(success,error) = _addresses[i].delegatecall(_calldata[i])](contracts/protocol/facets/ProtocolInitializationHandlerFacet.sol#L54)
	Event emitted after the call(s):
	- [MaxPremintedVouchersChanged(_maxPremintedVouchers,msgSender())](contracts/protocol/facets/ProtocolInitializationHandlerFacet.sol#L97)
		- [initV2_2_0(_initializationData)](contracts/protocol/facets/ProtocolInitializationHandlerFacet.sol#L71)
	- [ProtocolInitialized(string(abi.encodePacked(_version)))](contracts/protocol/facets/ProtocolInitializationHandlerFacet.sol#L79)

contracts/protocol/facets/ProtocolInitializationHandlerFacet.sol#L40-L80


 - [ ] ID-109
Reentrancy in [OrchestrationHandlerFacet1.createSellerAndPremintedOfferAndTwinWithBundle(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Twin,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1019-L1043):
	External calls:
	- [createSellerAndOfferAndTwinWithBundle(_seller,_offer,_offerDates,_offerDurations,_disputeResolverId,_twin,_authToken,_voucherInitValues,_agentId)](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1031-L1041)
		- [IInitializableVoucherClone(cloneAddress).initialize(pa.voucherBeacon)](contracts/protocol/bases/SellerBase.sol#L180)
		- [IInitializableVoucherClone(cloneAddress).initializeVoucher(_sellerId,_operator,_voucherInitValues)](contracts/protocol/bases/SellerBase.sol#L181)
	- [reserveRangeInternal(_offer.id,_reservedRangeLength)](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1042)
		- [bosonVoucher.reserveRange(_offerId,_startId,_length)](contracts/protocol/bases/OfferBase.sol#L314)
	Event emitted after the call(s):
	- [RangeReserved(_offerId,offer.sellerId,_startId,_startId + _length - 1,msgSender())](contracts/protocol/bases/OfferBase.sol#L325)
		- [reserveRangeInternal(_offer.id,_reservedRangeLength)](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1042)

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1019-L1043


 - [ ] ID-110
Reentrancy in [OfferBase.reserveRangeInternal(uint256,uint256)](contracts/protocol/bases/OfferBase.sol#L295-L326):
	External calls:
	- [bosonVoucher.reserveRange(_offerId,_startId,_length)](contracts/protocol/bases/OfferBase.sol#L314)
	Event emitted after the call(s):
	- [RangeReserved(_offerId,offer.sellerId,_startId,_startId + _length - 1,msgSender())](contracts/protocol/bases/OfferBase.sol#L325)

contracts/protocol/bases/OfferBase.sol#L295-L326


 - [ ] ID-111
Reentrancy in [FundsLib.transferFundsFromProtocol(uint256,address,address,uint256)](contracts/protocol/libs/FundsLib.sol#L274-L295):
	External calls:
	- [(success) = _to.call{value: _amount}()](contracts/protocol/libs/FundsLib.sol#L286)
	- [IERC20(_tokenAddress).safeTransfer(_to,_amount)](contracts/protocol/libs/FundsLib.sol#L290)
	External calls sending eth:
	- [(success) = _to.call{value: _amount}()](contracts/protocol/libs/FundsLib.sol#L286)
	Event emitted after the call(s):
	- [FundsWithdrawn(_entityId,_to,_tokenAddress,_amount,EIP712Lib.msgSender())](contracts/protocol/libs/FundsLib.sol#L294)

contracts/protocol/libs/FundsLib.sol#L274-L295


 - [ ] ID-112
Reentrancy in [OrchestrationHandlerFacet1.createSellerAndPremintedOfferWithCondition(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Condition,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L835-L859):
	External calls:
	- [createSellerAndOfferWithCondition(_seller,_offer,_offerDates,_offerDurations,_disputeResolverId,_condition,_authToken,_voucherInitValues,_agentId)](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L847-L857)
		- [IInitializableVoucherClone(cloneAddress).initialize(pa.voucherBeacon)](contracts/protocol/bases/SellerBase.sol#L180)
		- [IInitializableVoucherClone(cloneAddress).initializeVoucher(_sellerId,_operator,_voucherInitValues)](contracts/protocol/bases/SellerBase.sol#L181)
	- [reserveRangeInternal(_offer.id,_reservedRangeLength)](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L858)
		- [bosonVoucher.reserveRange(_offerId,_startId,_length)](contracts/protocol/bases/OfferBase.sol#L314)
	Event emitted after the call(s):
	- [RangeReserved(_offerId,offer.sellerId,_startId,_startId + _length - 1,msgSender())](contracts/protocol/bases/OfferBase.sol#L325)
		- [reserveRangeInternal(_offer.id,_reservedRangeLength)](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L858)

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L835-L859


 - [ ] ID-113
Reentrancy in [OrchestrationHandlerFacet1.createSellerAndOfferWithConditionAndTwinAndBundle(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.Condition,BosonTypes.Twin,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1117-L1139):
	External calls:
	- [createSellerInternal(_seller,_authToken,_voucherInitValues)](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1129)
		- [IInitializableVoucherClone(cloneAddress).initialize(pa.voucherBeacon)](contracts/protocol/bases/SellerBase.sol#L180)
		- [IInitializableVoucherClone(cloneAddress).initializeVoucher(_sellerId,_operator,_voucherInitValues)](contracts/protocol/bases/SellerBase.sol#L181)
	Event emitted after the call(s):
	- [BundleCreated(bundleId,sellerId,_bundle,sender)](contracts/protocol/bases/BundleBase.sol#L107)
		- [createOfferWithConditionAndTwinAndBundle(_offer,_offerDates,_offerDurations,_disputeResolverId,_condition,_twin,_agentId)](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1130-L1138)
	- [GroupCreated(groupId,sellerId,_group,_condition,sender)](contracts/protocol/bases/GroupBase.sol#L77)
		- [createOfferWithConditionAndTwinAndBundle(_offer,_offerDates,_offerDurations,_disputeResolverId,_condition,_twin,_agentId)](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1130-L1138)
	- [OfferCreated(_offer.id,_offer.sellerId,_offer,_offerDates,_offerDurations,disputeResolutionTerms,offerFees,_agentId,msgSender())](contracts/protocol/bases/OfferBase.sol#L265-L275)
		- [createOfferWithConditionAndTwinAndBundle(_offer,_offerDates,_offerDurations,_disputeResolverId,_condition,_twin,_agentId)](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1130-L1138)
	- [TwinCreated(twinId,sellerId,_twin,sender)](contracts/protocol/bases/TwinBase.sol#L142)
		- [createOfferWithConditionAndTwinAndBundle(_offer,_offerDates,_offerDurations,_disputeResolverId,_condition,_twin,_agentId)](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1130-L1138)

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1117-L1139


 - [ ] ID-114
Reentrancy in [SellerBase.createSellerInternal(BosonTypes.Seller,BosonTypes.AuthToken,BosonTypes.VoucherInitValues)](contracts/protocol/bases/SellerBase.sol#L39-L107):
	External calls:
	- [voucherCloneAddress = cloneBosonVoucher(sellerId,_seller.operator,_voucherInitValues)](contracts/protocol/bases/SellerBase.sol#L102)
		- [IInitializableVoucherClone(cloneAddress).initialize(pa.voucherBeacon)](contracts/protocol/bases/SellerBase.sol#L180)
		- [IInitializableVoucherClone(cloneAddress).initializeVoucher(_sellerId,_operator,_voucherInitValues)](contracts/protocol/bases/SellerBase.sol#L181)
	Event emitted after the call(s):
	- [SellerCreated(sellerId,_seller,voucherCloneAddress,_authToken,sender)](contracts/protocol/bases/SellerBase.sol#L106)

contracts/protocol/bases/SellerBase.sol#L39-L107


 - [ ] ID-115
Reentrancy in [DisputeBase.escalateDisputeInternal(uint256)](contracts/protocol/bases/DisputeBase.sol#L87-L127):
	External calls:
	- [FundsLib.validateIncomingPayment(offer.exchangeToken,disputeResolutionTerms.buyerEscalationDeposit)](contracts/protocol/bases/DisputeBase.sol#L113)
	Event emitted after the call(s):
	- [DisputeEscalated(_exchangeId,disputeResolutionTerms.disputeResolverId,msgSender())](contracts/protocol/bases/DisputeBase.sol#L126)

contracts/protocol/bases/DisputeBase.sol#L87-L127


 - [ ] ID-116
Reentrancy in [SnapshotGate.commitToGatedOffer(address,uint256,uint256)](contracts/example/SnapshotGate/SnapshotGate.sol#L211-L264):
	External calls:
	- [IBosonExchangeHandler(protocol).commitToOffer{value: msg.value}(_buyer,_offerId)](contracts/example/SnapshotGate/SnapshotGate.sol#L250)
	- [transferFundsToGateAndApproveProtocol(offer.exchangeToken,offer.price)](contracts/example/SnapshotGate/SnapshotGate.sol#L253)
		- [returndata = address(token).functionCall(data,SafeERC20: low-level call failed)](contracts/ext_libs/SafeERC20.sol#L47)
		- [(success,returndata) = target.call{value: value}(data)](contracts/ext_libs/Address.sol#L112)
		- [IERC20(_tokenAddress).safeTransferFrom(msg.sender,address(this),_amount)](contracts/example/SnapshotGate/SnapshotGate.sol#L288)
		- [success = IERC20(_tokenAddress).approve(protocol,_amount)](contracts/example/SnapshotGate/SnapshotGate.sol#L297)
	- [IBosonExchangeHandler(protocol).commitToOffer(_buyer,_offerId)](contracts/example/SnapshotGate/SnapshotGate.sol#L256)
	External calls sending eth:
	- [IBosonExchangeHandler(protocol).commitToOffer{value: msg.value}(_buyer,_offerId)](contracts/example/SnapshotGate/SnapshotGate.sol#L250)
	- [transferFundsToGateAndApproveProtocol(offer.exchangeToken,offer.price)](contracts/example/SnapshotGate/SnapshotGate.sol#L253)
		- [(success,returndata) = target.call{value: value}(data)](contracts/ext_libs/Address.sol#L112)
	Event emitted after the call(s):
	- [SnapshotTokenCommitted(_buyer,_offerId,_tokenId,msg.sender)](contracts/example/SnapshotGate/SnapshotGate.sol#L263)

contracts/example/SnapshotGate/SnapshotGate.sol#L211-L264


 - [ ] ID-117
Reentrancy in [OrchestrationHandlerFacet1.createSellerAndOfferAndTwinWithBundle(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.Twin,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L930-L943):
	External calls:
	- [createSellerInternal(_seller,_authToken,_voucherInitValues)](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L941)
		- [IInitializableVoucherClone(cloneAddress).initialize(pa.voucherBeacon)](contracts/protocol/bases/SellerBase.sol#L180)
		- [IInitializableVoucherClone(cloneAddress).initializeVoucher(_sellerId,_operator,_voucherInitValues)](contracts/protocol/bases/SellerBase.sol#L181)
	Event emitted after the call(s):
	- [BundleCreated(bundleId,sellerId,_bundle,sender)](contracts/protocol/bases/BundleBase.sol#L107)
		- [createOfferAndTwinWithBundle(_offer,_offerDates,_offerDurations,_disputeResolverId,_twin,_agentId)](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L942)
	- [OfferCreated(_offer.id,_offer.sellerId,_offer,_offerDates,_offerDurations,disputeResolutionTerms,offerFees,_agentId,msgSender())](contracts/protocol/bases/OfferBase.sol#L265-L275)
		- [createOfferAndTwinWithBundle(_offer,_offerDates,_offerDurations,_disputeResolverId,_twin,_agentId)](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L942)
	- [TwinCreated(twinId,sellerId,_twin,sender)](contracts/protocol/bases/TwinBase.sol#L142)
		- [createOfferAndTwinWithBundle(_offer,_offerDates,_offerDurations,_disputeResolverId,_twin,_agentId)](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L942)

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L930-L943


 - [ ] ID-118
Reentrancy in [OrchestrationHandlerFacet1.createSellerAndOfferWithCondition(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.Condition,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L754-L767):
	External calls:
	- [createSellerInternal(_seller,_authToken,_voucherInitValues)](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L765)
		- [IInitializableVoucherClone(cloneAddress).initialize(pa.voucherBeacon)](contracts/protocol/bases/SellerBase.sol#L180)
		- [IInitializableVoucherClone(cloneAddress).initializeVoucher(_sellerId,_operator,_voucherInitValues)](contracts/protocol/bases/SellerBase.sol#L181)
	Event emitted after the call(s):
	- [GroupCreated(groupId,sellerId,_group,_condition,sender)](contracts/protocol/bases/GroupBase.sol#L77)
		- [createOfferWithCondition(_offer,_offerDates,_offerDurations,_disputeResolverId,_condition,_agentId)](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L766)
	- [OfferCreated(_offer.id,_offer.sellerId,_offer,_offerDates,_offerDurations,disputeResolutionTerms,offerFees,_agentId,msgSender())](contracts/protocol/bases/OfferBase.sol#L265-L275)
		- [createOfferWithCondition(_offer,_offerDates,_offerDurations,_disputeResolverId,_condition,_agentId)](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L766)

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L754-L767


 - [ ] ID-119
Reentrancy in [OrchestrationHandlerFacet1.createSellerAndPremintedOfferWithConditionAndTwinAndBundle(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Condition,BosonTypes.Twin,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1219-L1245):
	External calls:
	- [createSellerAndOfferWithConditionAndTwinAndBundle(_seller,_offer,_offerDates,_offerDurations,_disputeResolverId,_condition,_twin,_authToken,_voucherInitValues,_agentId)](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1232-L1243)
		- [IInitializableVoucherClone(cloneAddress).initialize(pa.voucherBeacon)](contracts/protocol/bases/SellerBase.sol#L180)
		- [IInitializableVoucherClone(cloneAddress).initializeVoucher(_sellerId,_operator,_voucherInitValues)](contracts/protocol/bases/SellerBase.sol#L181)
	- [reserveRangeInternal(_offer.id,_reservedRangeLength)](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1244)
		- [bosonVoucher.reserveRange(_offerId,_startId,_length)](contracts/protocol/bases/OfferBase.sol#L314)
	Event emitted after the call(s):
	- [RangeReserved(_offerId,offer.sellerId,_startId,_startId + _length - 1,msgSender())](contracts/protocol/bases/OfferBase.sol#L325)
		- [reserveRangeInternal(_offer.id,_reservedRangeLength)](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1244)

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1219-L1245


## timestamp
Impact: Low
Confidence: Medium
 - [ ] ID-120
[DisputeHandlerFacet.extendDisputeTimeout(uint256,uint256)](contracts/protocol/facets/DisputeHandlerFacet.sol#L111-L150) uses timestamp for comparisons
	Dangerous comparisons:
	- [require(bool,string)(block.timestamp <= disputeDates.timeout,DISPUTE_HAS_EXPIRED)](contracts/protocol/facets/DisputeHandlerFacet.sol#L140)

contracts/protocol/facets/DisputeHandlerFacet.sol#L111-L150


 - [ ] ID-121
[DisputeHandlerFacet.disputeResolverChecks(uint256)](contracts/protocol/facets/DisputeHandlerFacet.sol#L545-L575) uses timestamp for comparisons
	Dangerous comparisons:
	- [require(bool,string)(block.timestamp <= disputeDates.timeout,DISPUTE_HAS_EXPIRED)](contracts/protocol/facets/DisputeHandlerFacet.sol#L564)

contracts/protocol/facets/DisputeHandlerFacet.sol#L545-L575


 - [ ] ID-122
[OfferBase.storeOffer(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256)](contracts/protocol/bases/OfferBase.sol#L108-L276) uses timestamp for comparisons
	Dangerous comparisons:
	- [require(bool,string)(_offerDates.validUntil > block.timestamp,OFFER_PERIOD_INVALID)](contracts/protocol/bases/OfferBase.sol#L119)

contracts/protocol/bases/OfferBase.sol#L108-L276


 - [ ] ID-123
[MockExchangeHandlerFacet.completeExchange(uint256)](contracts/mock/MockExchangeHandlerFacet.sol#L65-L94) uses timestamp for comparisons
	Dangerous comparisons:
	- [require(bool,string)(elapsed >= fetchOfferDurations(offerId).disputePeriod,DISPUTE_PERIOD_NOT_ELAPSED)](contracts/mock/MockExchangeHandlerFacet.sol#L86)

contracts/mock/MockExchangeHandlerFacet.sol#L65-L94


 - [ ] ID-124
[ExchangeHandlerFacet.onVoucherTransferred(uint256,address)](contracts/protocol/facets/ExchangeHandlerFacet.sol#L496-L530) uses timestamp for comparisons
	Dangerous comparisons:
	- [require(bool,string)(block.timestamp <= voucher.validUntilDate,VOUCHER_HAS_EXPIRED)](contracts/protocol/facets/ExchangeHandlerFacet.sol#L509)

contracts/protocol/facets/ExchangeHandlerFacet.sol#L496-L530


 - [ ] ID-125
[ExchangeHandlerFacet.completeExchange(uint256)](contracts/protocol/facets/ExchangeHandlerFacet.sol#L240-L269) uses timestamp for comparisons
	Dangerous comparisons:
	- [require(bool,string)(elapsed >= fetchOfferDurations(offerId).disputePeriod,DISPUTE_PERIOD_NOT_ELAPSED)](contracts/protocol/facets/ExchangeHandlerFacet.sol#L261)

contracts/protocol/facets/ExchangeHandlerFacet.sol#L240-L269


 - [ ] ID-126
[MockExchangeHandlerFacet.redeemVoucher(uint256)](contracts/mock/MockExchangeHandlerFacet.sol#L271-L303) uses timestamp for comparisons
	Dangerous comparisons:
	- [require(bool,string)(block.timestamp >= fetchOfferDates(offerId).voucherRedeemableFrom && block.timestamp <= voucher.validUntilDate,VOUCHER_NOT_REDEEMABLE)](contracts/mock/MockExchangeHandlerFacet.sol#L280-L284)

contracts/mock/MockExchangeHandlerFacet.sol#L271-L303


 - [ ] ID-127
[DisputeHandlerFacet.resolveDispute(uint256,uint256,bytes32,bytes32,uint8)](contracts/protocol/facets/DisputeHandlerFacet.sol#L235-L297) uses timestamp for comparisons
	Dangerous comparisons:
	- [require(bool,string)(block.timestamp <= disputeDates.timeout,DISPUTE_HAS_EXPIRED)](contracts/protocol/facets/DisputeHandlerFacet.sol#L255)

contracts/protocol/facets/DisputeHandlerFacet.sol#L235-L297


 - [ ] ID-128
[DisputeBase.raiseDisputeInternal(BosonTypes.Exchange,BosonTypes.Voucher,uint256)](contracts/protocol/bases/DisputeBase.sol#L29-L60) uses timestamp for comparisons
	Dangerous comparisons:
	- [require(bool,string)(elapsed < offerDurations.disputePeriod,DISPUTE_PERIOD_HAS_ELAPSED)](contracts/protocol/bases/DisputeBase.sol#L39)

contracts/protocol/bases/DisputeBase.sol#L29-L60


 - [ ] ID-129
[DisputeHandlerFacet.retractDispute(uint256)](contracts/protocol/facets/DisputeHandlerFacet.sol#L67-L91) uses timestamp for comparisons
	Dangerous comparisons:
	- [require(bool,string)(block.timestamp <= disputeDates.timeout,DISPUTE_HAS_EXPIRED)](contracts/protocol/facets/DisputeHandlerFacet.sol#L80)

contracts/protocol/facets/DisputeHandlerFacet.sol#L67-L91


 - [ ] ID-130
[DisputeBase.escalateDisputeInternal(uint256)](contracts/protocol/bases/DisputeBase.sol#L87-L127) uses timestamp for comparisons
	Dangerous comparisons:
	- [require(bool,string)(block.timestamp <= disputeDates.timeout,DISPUTE_HAS_EXPIRED)](contracts/protocol/bases/DisputeBase.sol#L98)

contracts/protocol/bases/DisputeBase.sol#L87-L127


 - [ ] ID-131
[DisputeHandlerFacet.expireEscalatedDispute(uint256)](contracts/protocol/facets/DisputeHandlerFacet.sol#L403-L421) uses timestamp for comparisons
	Dangerous comparisons:
	- [require(bool,string)(block.timestamp > disputeDates.timeout,DISPUTE_STILL_VALID)](contracts/protocol/facets/DisputeHandlerFacet.sol#L414)

contracts/protocol/facets/DisputeHandlerFacet.sol#L403-L421


 - [ ] ID-132
[BosonVoucherBase.getAvailablePreMints(uint256)](contracts/protocol/clients/voucher/BosonVoucher.sol#L330-L342) uses timestamp for comparisons
	Dangerous comparisons:
	- [offer.voided || (offerDates.validUntil <= block.timestamp)](contracts/protocol/clients/voucher/BosonVoucher.sol#L333)

contracts/protocol/clients/voucher/BosonVoucher.sol#L330-L342


 - [ ] ID-133
[ExchangeHandlerFacet.commitToOfferInternal(address,BosonTypes.Offer,uint256,bool)](contracts/protocol/facets/ExchangeHandlerFacet.sol#L150-L225) uses timestamp for comparisons
	Dangerous comparisons:
	- [require(bool,string)(block.timestamp >= offerDates.validFrom,OFFER_NOT_AVAILABLE)](contracts/protocol/facets/ExchangeHandlerFacet.sol#L159)
	- [require(bool,string)(block.timestamp < offerDates.validUntil,OFFER_HAS_EXPIRED)](contracts/protocol/facets/ExchangeHandlerFacet.sol#L161)
	- [(block.timestamp >= offerDates.voucherRedeemableFrom)](contracts/protocol/facets/ExchangeHandlerFacet.sol#L197-L199)

contracts/protocol/facets/ExchangeHandlerFacet.sol#L150-L225


 - [ ] ID-134
[ExchangeHandlerFacet.expireVoucher(uint256)](contracts/protocol/facets/ExchangeHandlerFacet.sol#L369-L384) uses timestamp for comparisons
	Dangerous comparisons:
	- [require(bool,string)(block.timestamp >= voucher.validUntilDate,VOUCHER_STILL_VALID)](contracts/protocol/facets/ExchangeHandlerFacet.sol#L374)

contracts/protocol/facets/ExchangeHandlerFacet.sol#L369-L384


 - [ ] ID-135
[MockExchangeHandlerFacet.expireVoucher(uint256)](contracts/mock/MockExchangeHandlerFacet.sol#L194-L209) uses timestamp for comparisons
	Dangerous comparisons:
	- [require(bool,string)(block.timestamp >= voucher.validUntilDate,VOUCHER_STILL_VALID)](contracts/mock/MockExchangeHandlerFacet.sol#L199)

contracts/mock/MockExchangeHandlerFacet.sol#L194-L209


 - [ ] ID-136
[ExchangeHandlerFacet.redeemVoucher(uint256)](contracts/protocol/facets/ExchangeHandlerFacet.sol#L446-L478) uses timestamp for comparisons
	Dangerous comparisons:
	- [require(bool,string)(block.timestamp >= fetchOfferDates(offerId).voucherRedeemableFrom && block.timestamp <= voucher.validUntilDate,VOUCHER_NOT_REDEEMABLE)](contracts/protocol/facets/ExchangeHandlerFacet.sol#L455-L459)

contracts/protocol/facets/ExchangeHandlerFacet.sol#L446-L478


 - [ ] ID-137
[DisputeHandlerFacet.expireDispute(uint256)](contracts/protocol/facets/DisputeHandlerFacet.sol#L166-L184) uses timestamp for comparisons
	Dangerous comparisons:
	- [require(bool,string)(block.timestamp > disputeDates.timeout,DISPUTE_STILL_VALID)](contracts/protocol/facets/DisputeHandlerFacet.sol#L177)

contracts/protocol/facets/DisputeHandlerFacet.sol#L166-L184


 - [ ] ID-138
[BosonVoucherBase.preMint(uint256,uint256)](contracts/protocol/clients/voucher/BosonVoucher.sol#L215-L252) uses timestamp for comparisons
	Dangerous comparisons:
	- [require(bool,string)(! offer.voided && (offerDates.validUntil > block.timestamp),OFFER_EXPIRED_OR_VOIDED)](contracts/protocol/clients/voucher/BosonVoucher.sol#L234)

contracts/protocol/clients/voucher/BosonVoucher.sol#L215-L252


 - [ ] ID-139
[BosonVoucherBase.burnPremintedVouchers(uint256)](contracts/protocol/clients/voucher/BosonVoucher.sol#L277-L322) uses timestamp for comparisons
	Dangerous comparisons:
	- [require(bool,string)(offer.voided || (offerDates.validUntil <= block.timestamp),OFFER_STILL_VALID)](contracts/protocol/clients/voucher/BosonVoucher.sol#L286)

contracts/protocol/clients/voucher/BosonVoucher.sol#L277-L322


## assembly
Impact: Informational
Confidence: High
 - [ ] ID-140
[BosonVoucherBase.getERC721UpgradeableStorage()](contracts/protocol/clients/voucher/BosonVoucher.sol#L735-L739) uses assembly
	- [INLINE ASM](contracts/protocol/clients/voucher/BosonVoucher.sol#L736-L738)

contracts/protocol/clients/voucher/BosonVoucher.sol#L735-L739


 - [ ] ID-141
[ERC2771ContextUpgradeable._msgSender()](node_modules/@openzeppelin/contracts-upgradeable/metatx/ERC2771ContextUpgradeable.sol#L25-L35) uses assembly
	- [INLINE ASM](node_modules/@openzeppelin/contracts-upgradeable/metatx/ERC2771ContextUpgradeable.sol#L29-L31)

node_modules/@openzeppelin/contracts-upgradeable/metatx/ERC2771ContextUpgradeable.sol#L25-L35


 - [ ] ID-142
[ProtocolLib.protocolLimits()](contracts/protocol/libs/ProtocolLib.sol#L254-L259) uses assembly
	- [INLINE ASM](contracts/protocol/libs/ProtocolLib.sol#L256-L258)

contracts/protocol/libs/ProtocolLib.sol#L254-L259


 - [ ] ID-143
[ERC721._checkOnERC721Received(address,address,uint256,bytes)](contracts/example/SnapshotGate/support/ERC721.sol#L387-L409) uses assembly
	- [INLINE ASM](contracts/example/SnapshotGate/support/ERC721.sol#L401-L403)

contracts/example/SnapshotGate/support/ERC721.sol#L387-L409


 - [ ] ID-144
[ProtocolLib.protocolCounters()](contracts/protocol/libs/ProtocolLib.sol#L302-L307) uses assembly
	- [INLINE ASM](contracts/protocol/libs/ProtocolLib.sol#L304-L306)

contracts/protocol/libs/ProtocolLib.sol#L302-L307


 - [ ] ID-145
[BeaconClientLib.getBeaconSlot()](contracts/protocol/libs/BeaconClientLib.sol#L32-L37) uses assembly
	- [INLINE ASM](contracts/protocol/libs/BeaconClientLib.sol#L34-L36)

contracts/protocol/libs/BeaconClientLib.sol#L32-L37


 - [ ] ID-146
[Foreign20._msgSender()](contracts/mock/Foreign20.sol#L26-L38) uses assembly
	- [INLINE ASM](contracts/mock/Foreign20.sol#L30-L33)

contracts/mock/Foreign20.sol#L26-L38


 - [ ] ID-147
[ProtocolLib.protocolFees()](contracts/protocol/libs/ProtocolLib.sol#L290-L295) uses assembly
	- [INLINE ASM](contracts/protocol/libs/ProtocolLib.sol#L292-L294)

contracts/protocol/libs/ProtocolLib.sol#L290-L295


 - [ ] ID-148
[Address.verifyCallResult(bool,bytes,string)](contracts/ext_libs/Address.sol#L122-L142) uses assembly
	- [INLINE ASM](contracts/ext_libs/Address.sol#L134-L137)

contracts/ext_libs/Address.sol#L122-L142


 - [ ] ID-149
[ProtocolLib.protocolLookups()](contracts/protocol/libs/ProtocolLib.sol#L278-L283) uses assembly
	- [INLINE ASM](contracts/protocol/libs/ProtocolLib.sol#L280-L282)

contracts/protocol/libs/ProtocolLib.sol#L278-L283


 - [ ] ID-150
[DiamondLib.diamondStorage()](contracts/diamond/DiamondLib.sol#L51-L56) uses assembly
	- [INLINE ASM](contracts/diamond/DiamondLib.sol#L53-L55)

contracts/diamond/DiamondLib.sol#L51-L56


 - [ ] ID-151
[ProtocolLib.protocolStatus()](contracts/protocol/libs/ProtocolLib.sol#L326-L331) uses assembly
	- [INLINE ASM](contracts/protocol/libs/ProtocolLib.sol#L328-L330)

contracts/protocol/libs/ProtocolLib.sol#L326-L331


 - [ ] ID-152
[ClientLib.proxyStorage()](contracts/protocol/libs/ClientLib.sol#L37-L42) uses assembly
	- [INLINE ASM](contracts/protocol/libs/ClientLib.sol#L39-L41)

contracts/protocol/libs/ClientLib.sol#L37-L42


 - [ ] ID-153
[Math.mulDiv(uint256,uint256,uint256)](node_modules/@openzeppelin/contracts/utils/math/Math.sol#L55-L135) uses assembly
	- [INLINE ASM](node_modules/@openzeppelin/contracts/utils/math/Math.sol#L66-L70)
	- [INLINE ASM](node_modules/@openzeppelin/contracts/utils/math/Math.sol#L86-L93)
	- [INLINE ASM](node_modules/@openzeppelin/contracts/utils/math/Math.sol#L100-L109)

node_modules/@openzeppelin/contracts/utils/math/Math.sol#L55-L135


 - [ ] ID-154
[DiamondLoupeFacet.facetFunctionSelectors(address)](contracts/diamond/facets/DiamondLoupeFacet.sol#L82-L112) uses assembly
	- [INLINE ASM](contracts/diamond/facets/DiamondLoupeFacet.sol#L109-L111)

contracts/diamond/facets/DiamondLoupeFacet.sol#L82-L112


 - [ ] ID-155
[Math.mulDiv(uint256,uint256,uint256)](contracts/ext_libs/Math.sol#L55-L135) uses assembly
	- [INLINE ASM](contracts/ext_libs/Math.sol#L66-L70)
	- [INLINE ASM](contracts/ext_libs/Math.sol#L86-L93)
	- [INLINE ASM](contracts/ext_libs/Math.sol#L100-L109)

contracts/ext_libs/Math.sol#L55-L135


 - [ ] ID-156
[ERC721Upgradeable._checkOnERC721Received(address,address,uint256,bytes)](node_modules/@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol#L399-L421) uses assembly
	- [INLINE ASM](node_modules/@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol#L413-L415)

node_modules/@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol#L399-L421


 - [ ] ID-157
[Strings.toString(uint256)](contracts/ext_libs/Strings.sol#L18-L38) uses assembly
	- [INLINE ASM](contracts/ext_libs/Strings.sol#L24-L26)
	- [INLINE ASM](contracts/ext_libs/Strings.sol#L30-L32)

contracts/ext_libs/Strings.sol#L18-L38


 - [ ] ID-158
[MetaTransactionsHandlerFacet.convertBytesToBytes4(bytes)](contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L63-L67) uses assembly
	- [INLINE ASM](contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L64-L66)

contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L63-L67


 - [ ] ID-159
[ProtocolLib.protocolEntities()](contracts/protocol/libs/ProtocolLib.sol#L266-L271) uses assembly
	- [INLINE ASM](contracts/protocol/libs/ProtocolLib.sol#L268-L270)

contracts/protocol/libs/ProtocolLib.sol#L266-L271


 - [ ] ID-160
[Strings.toString(uint256)](node_modules/@openzeppelin/contracts/utils/Strings.sol#L18-L38) uses assembly
	- [INLINE ASM](node_modules/@openzeppelin/contracts/utils/Strings.sol#L24-L26)
	- [INLINE ASM](node_modules/@openzeppelin/contracts/utils/Strings.sol#L30-L32)

node_modules/@openzeppelin/contracts/utils/Strings.sol#L18-L38


 - [ ] ID-161
[ProtocolLib.protocolAddresses()](contracts/protocol/libs/ProtocolLib.sol#L242-L247) uses assembly
	- [INLINE ASM](contracts/protocol/libs/ProtocolLib.sol#L244-L246)

contracts/protocol/libs/ProtocolLib.sol#L242-L247


 - [ ] ID-162
[ProtocolDiamond.fallback()](contracts/diamond/ProtocolDiamond.sol#L64-L85) uses assembly
	- [INLINE ASM](contracts/diamond/ProtocolDiamond.sol#L73-L84)

contracts/diamond/ProtocolDiamond.sol#L64-L85


 - [ ] ID-163
[DiamondLoupeFacet.facets()](contracts/diamond/facets/DiamondLoupeFacet.sol#L25-L74) uses assembly
	- [INLINE ASM](contracts/diamond/facets/DiamondLoupeFacet.sol#L66-L68)
	- [INLINE ASM](contracts/diamond/facets/DiamondLoupeFacet.sol#L71-L73)

contracts/diamond/facets/DiamondLoupeFacet.sol#L25-L74


 - [ ] ID-164
[ProtocolLib.protocolMetaTxInfo()](contracts/protocol/libs/ProtocolLib.sol#L314-L319) uses assembly
	- [INLINE ASM](contracts/protocol/libs/ProtocolLib.sol#L316-L318)

contracts/protocol/libs/ProtocolLib.sol#L314-L319


 - [ ] ID-165
[SellerBase.cloneBosonVoucher(uint256,address,BosonTypes.VoucherInitValues)](contracts/protocol/bases/SellerBase.sol#L159-L182) uses assembly
	- [INLINE ASM](contracts/protocol/bases/SellerBase.sol#L171-L177)

contracts/protocol/bases/SellerBase.sol#L159-L182


 - [ ] ID-166
[JewelerLib.enforceHasContractCode(address,string)](contracts/diamond/JewelerLib.sol#L307-L313) uses assembly
	- [INLINE ASM](contracts/diamond/JewelerLib.sol#L309-L311)

contracts/diamond/JewelerLib.sol#L307-L313


 - [ ] ID-167
[Proxy._delegate(address)](contracts/protocol/clients/proxy/Proxy.sol#L23-L46) uses assembly
	- [INLINE ASM](contracts/protocol/clients/proxy/Proxy.sol#L24-L45)

contracts/protocol/clients/proxy/Proxy.sol#L23-L46


 - [ ] ID-168
[TestFacetLib.testFacetStorage()](contracts/mock/TestFacetLib.sol#L21-L26) uses assembly
	- [INLINE ASM](contracts/mock/TestFacetLib.sol#L23-L25)

contracts/mock/TestFacetLib.sol#L21-L26


 - [ ] ID-169
[DiamondLoupeFacet.facetAddresses()](contracts/diamond/facets/DiamondLoupeFacet.sol#L119-L152) uses assembly
	- [INLINE ASM](contracts/diamond/facets/DiamondLoupeFacet.sol#L149-L151)

contracts/diamond/facets/DiamondLoupeFacet.sol#L119-L152


 - [ ] ID-170
[AddressUpgradeable.verifyCallResult(bool,bytes,string)](node_modules/@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol#L174-L194) uses assembly
	- [INLINE ASM](node_modules/@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol#L186-L189)

node_modules/@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol#L174-L194


 - [ ] ID-171
[MockEIP712Base.getChainId()](contracts/mock/MockEIP712Base.sol#L43-L49) uses assembly
	- [INLINE ASM](contracts/mock/MockEIP712Base.sol#L45-L47)

contracts/mock/MockEIP712Base.sol#L43-L49


## pragma
Impact: Informational
Confidence: High
 - [ ] ID-172
Different versions of Solidity are used:
	- Version used: ['0.8.9', '^0.8.0', '^0.8.1', '^0.8.2', '^0.8.9']
	- [0.8.9](contracts/access/AccessControl.sol#L4)
	- [0.8.9](contracts/access/AccessController.sol#L2)
	- [0.8.9](contracts/diamond/DiamondLib.sol#L2)
	- [0.8.9](contracts/diamond/JewelerLib.sol#L2)
	- [0.8.9](contracts/diamond/ProtocolDiamond.sol#L2)
	- [0.8.9](contracts/diamond/facets/DiamondCutFacet.sol#L2)
	- [0.8.9](contracts/diamond/facets/DiamondLoupeFacet.sol#L2)
	- [0.8.9](contracts/diamond/facets/ERC165Facet.sol#L2)
	- [0.8.9](contracts/domain/BosonTypes.sol#L2)
	- [0.8.9](contracts/example/SnapshotGate/support/ERC721.sol#L4)
	- [0.8.9](contracts/example/SnapshotGate/support/IERC721Metadata.sol#L4)
	- [0.8.9](contracts/example/SnapshotGate/support/IERC721Receiver.sol#L4)
	- [0.8.9](contracts/ext_libs/Address.sol#L2)
	- [0.8.9](contracts/ext_libs/Math.sol#L4)
	- [0.8.9](contracts/ext_libs/SafeERC20.sol#L2)
	- [0.8.9](contracts/ext_libs/Strings.sol#L4)
	- [0.8.9](contracts/interfaces/IAccessControl.sol#L4)
	- [0.8.9](contracts/interfaces/IERC1155.sol#L4)
	- [0.8.9](contracts/interfaces/IERC165.sol#L4)
	- [0.8.9](contracts/interfaces/IERC20.sol#L2)
	- [0.8.9](contracts/interfaces/IERC20Metadata.sol#L2)
	- [0.8.9](contracts/interfaces/IERC2981.sol#L4)
	- [0.8.9](contracts/interfaces/IERC721.sol#L4)
	- [0.8.9](contracts/interfaces/IInitializableVoucherClone.sol#L2)
	- [0.8.9](contracts/interfaces/ITwinToken.sol#L4)
	- [0.8.9](contracts/interfaces/clients/IBosonVoucher.sol#L2)
	- [0.8.9](contracts/interfaces/clients/IClientExternalAddresses.sol#L2)
	- [0.8.9](contracts/interfaces/diamond/IDiamondCut.sol#L2)
	- [0.8.9](contracts/interfaces/diamond/IDiamondLoupe.sol#L2)
	- [0.8.9](contracts/interfaces/diamond/IERC165Extended.sol#L2)
	- [0.8.9](contracts/interfaces/events/IBosonAccountEvents.sol#L2)
	- [0.8.9](contracts/interfaces/events/IBosonBundleEvents.sol#L2)
	- [0.8.9](contracts/interfaces/events/IBosonConfigEvents.sol#L2)
	- [0.8.9](contracts/interfaces/events/IBosonDisputeEvents.sol#L2)
	- [0.8.9](contracts/interfaces/events/IBosonExchangeEvents.sol#L2)
	- [0.8.9](contracts/interfaces/events/IBosonFundsEvents.sol#L2)
	- [0.8.9](contracts/interfaces/events/IBosonGroupEvents.sol#L2)
	- [0.8.9](contracts/interfaces/events/IBosonMetaTransactionsEvents.sol#L2)
	- [0.8.9](contracts/interfaces/events/IBosonOfferEvents.sol#L2)
	- [0.8.9](contracts/interfaces/events/IBosonPauseEvents.sol#L2)
	- [0.8.9](contracts/interfaces/events/IBosonProtocolInitializationEvents.sol#L2)
	- [0.8.9](contracts/interfaces/events/IBosonTwinEvents.sol#L2)
	- [0.8.9](contracts/interfaces/events/IClientExternalAddressesEvents.sol#L2)
	- [0.8.9](contracts/interfaces/handlers/IBosonAccountHandler.sol#L2)
	- [0.8.9](contracts/interfaces/handlers/IBosonBundleHandler.sol#L2)
	- [0.8.9](contracts/interfaces/handlers/IBosonConfigHandler.sol#L2)
	- [0.8.9](contracts/interfaces/handlers/IBosonDisputeHandler.sol#L2)
	- [0.8.9](contracts/interfaces/handlers/IBosonExchangeHandler.sol#L2)
	- [0.8.9](contracts/interfaces/handlers/IBosonFundsHandler.sol#L2)
	- [0.8.9](contracts/interfaces/handlers/IBosonGroupHandler.sol#L2)
	- [0.8.9](contracts/interfaces/handlers/IBosonMetaTransactionsHandler.sol#L2)
	- [0.8.9](contracts/interfaces/handlers/IBosonOfferHandler.sol#L2)
	- [0.8.9](contracts/interfaces/handlers/IBosonOrchestrationHandler.sol#L2)
	- [0.8.9](contracts/interfaces/handlers/IBosonPauseHandler.sol#L2)
	- [0.8.9](contracts/interfaces/handlers/IBosonProtocolInitializationHandler.sol#L2)
	- [0.8.9](contracts/interfaces/handlers/IBosonTwinHandler.sol#L2)
	- [0.8.9](contracts/mock/FallbackError.sol#L2)
	- [0.8.9](contracts/mock/Foreign1155.sol#L2)
	- [0.8.9](contracts/mock/Foreign20.sol#L2)
	- [0.8.9](contracts/mock/Foreign721.sol#L2)
	- [0.8.9](contracts/mock/MockEIP712Base.sol#L2)
	- [0.8.9](contracts/mock/MockExchangeHandlerFacet.sol#L2)
	- [0.8.9](contracts/mock/MockInitializable.sol#L2)
	- [0.8.9](contracts/mock/MockMetaTransactionsHandlerFacet.sol#L2)
	- [0.8.9](contracts/mock/MockNFTAuth721.sol#L2)
	- [0.8.9](contracts/mock/MockNativeMetaTransaction.sol#L2)
	- [0.8.9](contracts/mock/Test2FacetUpgrade.sol#L2)
	- [0.8.9](contracts/mock/Test3Facet.sol#L2)
	- [0.8.9](contracts/mock/TestFacetLib.sol#L2)
	- [0.8.9](contracts/mock/TestInitializableDiamond.sol#L2)
	- [0.8.9](contracts/mock/TestProtocolFunctions.sol#L2)
	- [0.8.9](contracts/protocol/bases/BeaconClientBase.sol#L2)
	- [0.8.9](contracts/protocol/bases/BundleBase.sol#L2)
	- [0.8.9](contracts/protocol/bases/BuyerBase.sol#L2)
	- [0.8.9](contracts/protocol/bases/ClientBase.sol#L2)
	- [0.8.9](contracts/protocol/bases/ClientExternalAddressesBase.sol#L2)
	- [0.8.9](contracts/protocol/bases/DisputeBase.sol#L2)
	- [0.8.9](contracts/protocol/bases/GroupBase.sol#L2)
	- [0.8.9](contracts/protocol/bases/OfferBase.sol#L2)
	- [0.8.9](contracts/protocol/bases/PausableBase.sol#L2)
	- [0.8.9](contracts/protocol/bases/ProtocolBase.sol#L2)
	- [0.8.9](contracts/protocol/bases/ReentrancyGuardBase.sol#L6)
	- [0.8.9](contracts/protocol/bases/SellerBase.sol#L2)
	- [0.8.9](contracts/protocol/bases/TwinBase.sol#L2)
	- [0.8.9](contracts/protocol/clients/proxy/BeaconClientProxy.sol#L2)
	- [0.8.9](contracts/protocol/clients/proxy/BosonClientBeacon.sol#L2)
	- [0.8.9](contracts/protocol/clients/proxy/ClientProxy.sol#L2)
	- [0.8.9](contracts/protocol/clients/proxy/Proxy.sol#L3)
	- [0.8.9](contracts/protocol/clients/voucher/BosonVoucher.sol#L2)
	- [0.8.9](contracts/protocol/facets/AccountHandlerFacet.sol#L2)
	- [0.8.9](contracts/protocol/facets/AgentHandlerFacet.sol#L2)
	- [0.8.9](contracts/protocol/facets/BundleHandlerFacet.sol#L2)
	- [0.8.9](contracts/protocol/facets/BuyerHandlerFacet.sol#L2)
	- [0.8.9](contracts/protocol/facets/ConfigHandlerFacet.sol#L2)
	- [0.8.9](contracts/protocol/facets/DisputeHandlerFacet.sol#L2)
	- [0.8.9](contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L2)
	- [0.8.9](contracts/protocol/facets/ExchangeHandlerFacet.sol#L2)
	- [0.8.9](contracts/protocol/facets/FundsHandlerFacet.sol#L2)
	- [0.8.9](contracts/protocol/facets/GroupHandlerFacet.sol#L2)
	- [0.8.9](contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L2)
	- [0.8.9](contracts/protocol/facets/OfferHandlerFacet.sol#L2)
	- [0.8.9](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L2)
	- [0.8.9](contracts/protocol/facets/OrchestrationHandlerFacet2.sol#L2)
	- [0.8.9](contracts/protocol/facets/PauseHandlerFacet.sol#L2)
	- [0.8.9](contracts/protocol/facets/ProtocolInitializationHandlerFacet.sol#L2)
	- [0.8.9](contracts/protocol/facets/SellerHandlerFacet.sol#L2)
	- [0.8.9](contracts/protocol/facets/TwinHandlerFacet.sol#L2)
	- [0.8.9](contracts/protocol/libs/BeaconClientLib.sol#L2)
	- [0.8.9](contracts/protocol/libs/ClientLib.sol#L2)
	- [0.8.9](contracts/protocol/libs/EIP712Lib.sol#L2)
	- [0.8.9](contracts/protocol/libs/FundsLib.sol#L2)
	- [0.8.9](contracts/protocol/libs/ProtocolLib.sol#L2)
	- [0.8.9](contracts/domain/BosonConstants.sol#L2)
	- [^0.8.0](node_modules/@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol#L4)
	- [^0.8.0](node_modules/@openzeppelin/contracts-upgradeable/interfaces/IERC2981Upgradeable.sol#L4)
	- [^0.8.0](node_modules/@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol#L4)
	- [^0.8.0](node_modules/@openzeppelin/contracts-upgradeable/token/ERC1155/IERC1155ReceiverUpgradeable.sol#L4)
	- [^0.8.0](node_modules/@openzeppelin/contracts-upgradeable/token/ERC1155/IERC1155Upgradeable.sol#L4)
	- [^0.8.0](node_modules/@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/IERC1155MetadataURIUpgradeable.sol#L4)
	- [^0.8.0](node_modules/@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol#L4)
	- [^0.8.0](node_modules/@openzeppelin/contracts-upgradeable/token/ERC721/IERC721ReceiverUpgradeable.sol#L4)
	- [^0.8.0](node_modules/@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol#L4)
	- [^0.8.0](node_modules/@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol#L4)
	- [^0.8.0](node_modules/@openzeppelin/contracts-upgradeable/token/ERC721/extensions/IERC721EnumerableUpgradeable.sol#L4)
	- [^0.8.0](node_modules/@openzeppelin/contracts-upgradeable/token/ERC721/extensions/IERC721MetadataUpgradeable.sol#L4)
	- [^0.8.0](node_modules/@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol#L4)
	- [^0.8.0](node_modules/@openzeppelin/contracts-upgradeable/utils/StringsUpgradeable.sol#L4)
	- [^0.8.0](node_modules/@openzeppelin/contracts-upgradeable/utils/introspection/ERC165Upgradeable.sol#L4)
	- [^0.8.0](node_modules/@openzeppelin/contracts-upgradeable/utils/introspection/IERC165Upgradeable.sol#L4)
	- [^0.8.0](node_modules/@openzeppelin/contracts/access/Ownable.sol#L4)
	- [^0.8.0](node_modules/@openzeppelin/contracts/security/Pausable.sol#L4)
	- [^0.8.0](node_modules/@openzeppelin/contracts/token/ERC20/ERC20.sol#L4)
	- [^0.8.0](node_modules/@openzeppelin/contracts/token/ERC20/IERC20.sol#L4)
	- [^0.8.0](node_modules/@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol#L4)
	- [^0.8.0](node_modules/@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol#L4)
	- [^0.8.0](node_modules/@openzeppelin/contracts/utils/Context.sol#L4)
	- [^0.8.0](node_modules/@openzeppelin/contracts/utils/Strings.sol#L4)
	- [^0.8.0](node_modules/@openzeppelin/contracts/utils/math/Math.sol#L4)
	- [^0.8.1](node_modules/@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol#L4)
	- [^0.8.2](node_modules/@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol#L4)
	- [^0.8.9](node_modules/@openzeppelin/contracts-upgradeable/metatx/ERC2771ContextUpgradeable.sol#L4)
	- [^0.8.9](contracts/example/SnapshotGate/SnapshotGate.sol#L2)

contracts/access/AccessControl.sol#L4


## dead-code
Impact: Informational
Confidence: Medium
 - [ ] ID-173
[Math.ceilDiv(uint256,uint256)](contracts/ext_libs/Math.sol#L45-L48) is never used and should be removed

contracts/ext_libs/Math.sol#L45-L48


 - [ ] ID-174
[Address.functionCallWithValue(address,bytes,uint256)](contracts/ext_libs/Address.sol#L89-L95) is never used and should be removed

contracts/ext_libs/Address.sol#L89-L95


 - [ ] ID-175
[Math.log10(uint256,Math.Rounding)](contracts/ext_libs/Math.sol#L296-L301) is never used and should be removed

contracts/ext_libs/Math.sol#L296-L301


 - [ ] ID-176
[Math.mulDiv(uint256,uint256,uint256)](contracts/ext_libs/Math.sol#L55-L135) is never used and should be removed

contracts/ext_libs/Math.sol#L55-L135


 - [ ] ID-177
[ClientBase.getBosonOffer(uint256)](contracts/protocol/bases/ClientBase.sol#L42-L46) is never used and should be removed

contracts/protocol/bases/ClientBase.sol#L42-L46


 - [ ] ID-178
[Strings.toHexString(uint256)](contracts/ext_libs/Strings.sol#L43-L47) is never used and should be removed

contracts/ext_libs/Strings.sol#L43-L47


 - [ ] ID-179
[Math.sqrt(uint256,Math.Rounding)](contracts/ext_libs/Math.sol#L194-L199) is never used and should be removed

contracts/ext_libs/Math.sol#L194-L199


 - [ ] ID-180
[Math.max(uint256,uint256)](contracts/ext_libs/Math.sol#L19-L21) is never used and should be removed

contracts/ext_libs/Math.sol#L19-L21


 - [ ] ID-181
[Math.log2(uint256)](contracts/ext_libs/Math.sol#L205-L241) is never used and should be removed

contracts/ext_libs/Math.sol#L205-L241


 - [ ] ID-182
[Math.average(uint256,uint256)](contracts/ext_libs/Math.sol#L34-L37) is never used and should be removed

contracts/ext_libs/Math.sol#L34-L37


 - [ ] ID-183
[Math.log2(uint256,Math.Rounding)](contracts/ext_libs/Math.sol#L247-L252) is never used and should be removed

contracts/ext_libs/Math.sol#L247-L252


 - [ ] ID-184
[BosonVoucher._msgData()](contracts/protocol/clients/voucher/BosonVoucher.sol#L759-L761) is never used and should be removed

contracts/protocol/clients/voucher/BosonVoucher.sol#L759-L761


 - [ ] ID-185
[ERC721._burn(uint256)](contracts/example/SnapshotGate/support/ERC721.sol#L296-L310) is never used and should be removed

contracts/example/SnapshotGate/support/ERC721.sol#L296-L310


 - [ ] ID-186
[Math.log256(uint256)](contracts/ext_libs/Math.sol#L309-L333) is never used and should be removed

contracts/ext_libs/Math.sol#L309-L333


 - [ ] ID-187
[MetaTransactionsHandlerFacet.hashGenericDetails(bytes)](contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L100-L102) is never used and should be removed

contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L100-L102


 - [ ] ID-188
[MetaTransactionsHandlerFacet.hashOfferDetails(bytes)](contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L110-L113) is never used and should be removed

contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L110-L113


 - [ ] ID-189
[MetaTransactionsHandlerFacet.hashExchangeDetails(bytes)](contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L121-L124) is never used and should be removed

contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L121-L124


 - [ ] ID-190
[Math.log256(uint256,Math.Rounding)](contracts/ext_libs/Math.sol#L339-L344) is never used and should be removed

contracts/ext_libs/Math.sol#L339-L344


 - [ ] ID-191
[Math.sqrt(uint256)](contracts/ext_libs/Math.sol#L158-L189) is never used and should be removed

contracts/ext_libs/Math.sol#L158-L189


 - [ ] ID-192
[Math.mulDiv(uint256,uint256,uint256,Math.Rounding)](contracts/ext_libs/Math.sol#L140-L151) is never used and should be removed

contracts/ext_libs/Math.sol#L140-L151


 - [ ] ID-193
[ERC721._safeMint(address,uint256,bytes)](contracts/example/SnapshotGate/support/ERC721.sol#L248-L258) is never used and should be removed

contracts/example/SnapshotGate/support/ERC721.sol#L248-L258


 - [ ] ID-194
[MetaTransactionsHandlerFacet.hashDisputeResolutionDetails(bytes)](contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L154-L160) is never used and should be removed

contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L154-L160


 - [ ] ID-195
[Math.min(uint256,uint256)](contracts/ext_libs/Math.sol#L26-L28) is never used and should be removed

contracts/ext_libs/Math.sol#L26-L28


 - [ ] ID-196
[ERC721._safeMint(address,uint256)](contracts/example/SnapshotGate/support/ERC721.sol#L240-L242) is never used and should be removed

contracts/example/SnapshotGate/support/ERC721.sol#L240-L242


 - [ ] ID-197
[MetaTransactionsHandlerFacet.hashFundDetails(bytes)](contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L132-L146) is never used and should be removed

contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L132-L146


 - [ ] ID-198
[Address.functionCall(address,bytes)](contracts/ext_libs/Address.sol#L60-L62) is never used and should be removed

contracts/ext_libs/Address.sol#L60-L62


## solc-version
Impact: Informational
Confidence: High
 - [ ] ID-199
Pragma version[0.8.9](contracts/mock/Test1Facet.sol#L2) allows old versions

contracts/mock/Test1Facet.sol#L2


 - [ ] ID-200
solc-0.8.9 is not recommended for deployment

 - [ ] ID-201
Pragma version[0.8.9](contracts/mock/BosonToken.sol#L2) allows old versions

contracts/mock/BosonToken.sol#L2


 - [ ] ID-202
Pragma version[0.8.9](contracts/mock/Test2Facet.sol#L2) allows old versions

contracts/mock/Test2Facet.sol#L2


 - [ ] ID-203
Pragma version[0.8.9](contracts/mock/MockProtocolInitializationFacet.sol#L2) allows old versions

contracts/mock/MockProtocolInitializationFacet.sol#L2


 - [ ] ID-204
Pragma version[0.8.9](contracts/mock/TestFacet256.sol#L2) allows old versions

contracts/mock/TestFacet256.sol#L2


 - [ ] ID-205
Pragma version[0.8.9](contracts/protocol/bases/OfferBase.sol#L2) allows old versions

contracts/protocol/bases/OfferBase.sol#L2


 - [ ] ID-206
Pragma version[0.8.9](contracts/protocol/bases/ProtocolBase.sol#L2) allows old versions

contracts/protocol/bases/ProtocolBase.sol#L2


 - [ ] ID-207
Pragma version[^0.8.0](node_modules/@openzeppelin/contracts-upgradeable/utils/introspection/ERC165Upgradeable.sol#L4) allows old versions

node_modules/@openzeppelin/contracts-upgradeable/utils/introspection/ERC165Upgradeable.sol#L4


 - [ ] ID-208
Pragma version[0.8.9](contracts/diamond/facets/ERC165Facet.sol#L2) allows old versions

contracts/diamond/facets/ERC165Facet.sol#L2


 - [ ] ID-209
Pragma version[0.8.9](contracts/interfaces/handlers/IBosonMetaTransactionsHandler.sol#L2) allows old versions

contracts/interfaces/handlers/IBosonMetaTransactionsHandler.sol#L2


 - [ ] ID-210
Pragma version[0.8.9](contracts/interfaces/handlers/IBosonBundleHandler.sol#L2) allows old versions

contracts/interfaces/handlers/IBosonBundleHandler.sol#L2


 - [ ] ID-211
Pragma version[0.8.9](contracts/mock/MockInitializable.sol#L2) allows old versions

contracts/mock/MockInitializable.sol#L2


 - [ ] ID-212
Pragma version[0.8.9](contracts/protocol/facets/SellerHandlerFacet.sol#L2) allows old versions

contracts/protocol/facets/SellerHandlerFacet.sol#L2


 - [ ] ID-213
Pragma version[0.8.9](contracts/diamond/facets/DiamondCutFacet.sol#L2) allows old versions

contracts/diamond/facets/DiamondCutFacet.sol#L2


 - [ ] ID-214
Pragma version[^0.8.0](node_modules/@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol#L4) allows old versions

node_modules/@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol#L4


 - [ ] ID-215
Pragma version[0.8.9](contracts/protocol/bases/BundleBase.sol#L2) allows old versions

contracts/protocol/bases/BundleBase.sol#L2


 - [ ] ID-216
Pragma version[0.8.9](contracts/interfaces/IAccessControl.sol#L4) allows old versions

contracts/interfaces/IAccessControl.sol#L4


 - [ ] ID-217
Pragma version[0.8.9](contracts/ext_libs/Math.sol#L4) allows old versions

contracts/ext_libs/Math.sol#L4


 - [ ] ID-218
Pragma version[0.8.9](contracts/interfaces/events/IBosonExchangeEvents.sol#L2) allows old versions

contracts/interfaces/events/IBosonExchangeEvents.sol#L2


 - [ ] ID-219
Pragma version[^0.8.0](node_modules/@openzeppelin/contracts/utils/math/Math.sol#L4) allows old versions

node_modules/@openzeppelin/contracts/utils/math/Math.sol#L4


 - [ ] ID-220
Pragma version[0.8.9](contracts/access/AccessController.sol#L2) allows old versions

contracts/access/AccessController.sol#L2


 - [ ] ID-221
Pragma version[0.8.9](contracts/ext_libs/Address.sol#L2) allows old versions

contracts/ext_libs/Address.sol#L2


 - [ ] ID-222
Pragma version[0.8.9](contracts/protocol/clients/proxy/ClientProxy.sol#L2) allows old versions

contracts/protocol/clients/proxy/ClientProxy.sol#L2


 - [ ] ID-223
Pragma version[0.8.9](contracts/example/SnapshotGate/support/ERC721.sol#L4) allows old versions

contracts/example/SnapshotGate/support/ERC721.sol#L4


 - [ ] ID-224
Pragma version[0.8.9](contracts/interfaces/diamond/IDiamondCut.sol#L2) allows old versions

contracts/interfaces/diamond/IDiamondCut.sol#L2


 - [ ] ID-225
Pragma version[0.8.9](contracts/protocol/bases/GroupBase.sol#L2) allows old versions

contracts/protocol/bases/GroupBase.sol#L2


 - [ ] ID-226
Pragma version[0.8.9](contracts/mock/Foreign721.sol#L2) allows old versions

contracts/mock/Foreign721.sol#L2


 - [ ] ID-227
Pragma version[0.8.9](contracts/protocol/facets/OfferHandlerFacet.sol#L2) allows old versions

contracts/protocol/facets/OfferHandlerFacet.sol#L2


 - [ ] ID-228
Pragma version[0.8.9](contracts/protocol/bases/BuyerBase.sol#L2) allows old versions

contracts/protocol/bases/BuyerBase.sol#L2


 - [ ] ID-229
Pragma version[^0.8.0](node_modules/@openzeppelin/contracts/utils/Context.sol#L4) allows old versions

node_modules/@openzeppelin/contracts/utils/Context.sol#L4


 - [ ] ID-230
Pragma version[0.8.9](contracts/ext_libs/SafeERC20.sol#L2) allows old versions

contracts/ext_libs/SafeERC20.sol#L2


 - [ ] ID-231
Pragma version[0.8.9](contracts/diamond/ProtocolDiamond.sol#L2) allows old versions

contracts/diamond/ProtocolDiamond.sol#L2


 - [ ] ID-232
Pragma version[0.8.9](contracts/interfaces/handlers/IBosonGroupHandler.sol#L2) allows old versions

contracts/interfaces/handlers/IBosonGroupHandler.sol#L2


 - [ ] ID-233
Pragma version[^0.8.0](node_modules/@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol#L4) allows old versions

node_modules/@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol#L4


 - [ ] ID-234
Pragma version[0.8.9](contracts/interfaces/handlers/IBosonOrchestrationHandler.sol#L2) allows old versions

contracts/interfaces/handlers/IBosonOrchestrationHandler.sol#L2


 - [ ] ID-235
Pragma version[0.8.9](contracts/interfaces/IERC721.sol#L4) allows old versions

contracts/interfaces/IERC721.sol#L4


 - [ ] ID-236
Pragma version[0.8.9](contracts/mock/FallbackError.sol#L2) allows old versions

contracts/mock/FallbackError.sol#L2


 - [ ] ID-237
Pragma version[0.8.9](contracts/protocol/bases/ClientBase.sol#L2) allows old versions

contracts/protocol/bases/ClientBase.sol#L2


 - [ ] ID-238
Pragma version[0.8.9](contracts/protocol/facets/TwinHandlerFacet.sol#L2) allows old versions

contracts/protocol/facets/TwinHandlerFacet.sol#L2


 - [ ] ID-239
Pragma version[0.8.9](contracts/mock/Test3Facet.sol#L2) allows old versions

contracts/mock/Test3Facet.sol#L2


 - [ ] ID-240
Pragma version[0.8.9](contracts/protocol/facets/AccountHandlerFacet.sol#L2) allows old versions

contracts/protocol/facets/AccountHandlerFacet.sol#L2


 - [ ] ID-241
Pragma version[0.8.9](contracts/interfaces/events/IBosonTwinEvents.sol#L2) allows old versions

contracts/interfaces/events/IBosonTwinEvents.sol#L2


 - [ ] ID-242
Pragma version[0.8.9](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L2) allows old versions

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L2


 - [ ] ID-243
Pragma version[0.8.9](contracts/protocol/bases/ReentrancyGuardBase.sol#L6) allows old versions

contracts/protocol/bases/ReentrancyGuardBase.sol#L6


 - [ ] ID-244
Pragma version[0.8.9](contracts/mock/MockExchangeHandlerFacet.sol#L2) allows old versions

contracts/mock/MockExchangeHandlerFacet.sol#L2


 - [ ] ID-245
Pragma version[0.8.9](contracts/protocol/bases/PausableBase.sol#L2) allows old versions

contracts/protocol/bases/PausableBase.sol#L2


 - [ ] ID-246
Pragma version[0.8.9](contracts/protocol/facets/DisputeHandlerFacet.sol#L2) allows old versions

contracts/protocol/facets/DisputeHandlerFacet.sol#L2


 - [ ] ID-247
Pragma version[0.8.9](contracts/interfaces/IERC2981.sol#L4) allows old versions

contracts/interfaces/IERC2981.sol#L4


 - [ ] ID-248
Pragma version[^0.8.0](node_modules/@openzeppelin/contracts/utils/Strings.sol#L4) allows old versions

node_modules/@openzeppelin/contracts/utils/Strings.sol#L4


 - [ ] ID-249
Pragma version[0.8.9](contracts/example/SnapshotGate/support/IERC721Receiver.sol#L4) allows old versions

contracts/example/SnapshotGate/support/IERC721Receiver.sol#L4


 - [ ] ID-250
Pragma version[0.8.9](contracts/protocol/libs/BeaconClientLib.sol#L2) allows old versions

contracts/protocol/libs/BeaconClientLib.sol#L2


 - [ ] ID-251
Pragma version[^0.8.0](node_modules/@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/IERC1155MetadataURIUpgradeable.sol#L4) allows old versions

node_modules/@openzeppelin/contracts-upgradeable/token/ERC1155/extensions/IERC1155MetadataURIUpgradeable.sol#L4


 - [ ] ID-252
Pragma version[0.8.9](contracts/protocol/libs/EIP712Lib.sol#L2) allows old versions

contracts/protocol/libs/EIP712Lib.sol#L2


 - [ ] ID-253
Pragma version[0.8.9](contracts/domain/BosonTypes.sol#L2) allows old versions

contracts/domain/BosonTypes.sol#L2


 - [ ] ID-254
Pragma version[0.8.9](contracts/interfaces/clients/IClientExternalAddresses.sol#L2) allows old versions

contracts/interfaces/clients/IClientExternalAddresses.sol#L2


 - [ ] ID-255
Pragma version[0.8.9](contracts/protocol/bases/ClientExternalAddressesBase.sol#L2) allows old versions

contracts/protocol/bases/ClientExternalAddressesBase.sol#L2


 - [ ] ID-256
Pragma version[0.8.9](contracts/protocol/facets/PauseHandlerFacet.sol#L2) allows old versions

contracts/protocol/facets/PauseHandlerFacet.sol#L2


 - [ ] ID-257
Pragma version[0.8.9](contracts/interfaces/handlers/IBosonConfigHandler.sol#L2) allows old versions

contracts/interfaces/handlers/IBosonConfigHandler.sol#L2


 - [ ] ID-258
Pragma version[0.8.9](contracts/access/AccessControl.sol#L4) allows old versions

contracts/access/AccessControl.sol#L4


 - [ ] ID-259
Pragma version[^0.8.0](node_modules/@openzeppelin/contracts-upgradeable/token/ERC1155/IERC1155ReceiverUpgradeable.sol#L4) allows old versions

node_modules/@openzeppelin/contracts-upgradeable/token/ERC1155/IERC1155ReceiverUpgradeable.sol#L4


 - [ ] ID-260
Pragma version[0.8.9](contracts/diamond/facets/DiamondLoupeFacet.sol#L2) allows old versions

contracts/diamond/facets/DiamondLoupeFacet.sol#L2


 - [ ] ID-261
Pragma version[0.8.9](contracts/protocol/libs/ProtocolLib.sol#L2) allows old versions

contracts/protocol/libs/ProtocolLib.sol#L2


 - [ ] ID-262
Pragma version[0.8.9](contracts/interfaces/handlers/IBosonOfferHandler.sol#L2) allows old versions

contracts/interfaces/handlers/IBosonOfferHandler.sol#L2


 - [ ] ID-263
Pragma version[0.8.9](contracts/mock/MockNFTAuth721.sol#L2) allows old versions

contracts/mock/MockNFTAuth721.sol#L2


 - [ ] ID-264
Pragma version[0.8.9](contracts/interfaces/clients/IBosonVoucher.sol#L2) allows old versions

contracts/interfaces/clients/IBosonVoucher.sol#L2


 - [ ] ID-265
Pragma version[0.8.9](contracts/protocol/bases/SellerBase.sol#L2) allows old versions

contracts/protocol/bases/SellerBase.sol#L2


 - [ ] ID-266
Pragma version[0.8.9](contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L2) allows old versions

contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L2


 - [ ] ID-267
Pragma version[0.8.9](contracts/interfaces/IInitializableVoucherClone.sol#L2) allows old versions

contracts/interfaces/IInitializableVoucherClone.sol#L2


 - [ ] ID-268
Pragma version[0.8.9](contracts/protocol/facets/FundsHandlerFacet.sol#L2) allows old versions

contracts/protocol/facets/FundsHandlerFacet.sol#L2


 - [ ] ID-269
Pragma version[0.8.9](contracts/protocol/facets/GroupHandlerFacet.sol#L2) allows old versions

contracts/protocol/facets/GroupHandlerFacet.sol#L2


 - [ ] ID-270
Pragma version[^0.8.0](node_modules/@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol#L4) allows old versions

node_modules/@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol#L4


 - [ ] ID-271
Pragma version[^0.8.0](node_modules/@openzeppelin/contracts-upgradeable/token/ERC721/extensions/IERC721MetadataUpgradeable.sol#L4) allows old versions

node_modules/@openzeppelin/contracts-upgradeable/token/ERC721/extensions/IERC721MetadataUpgradeable.sol#L4


 - [ ] ID-272
Pragma version[0.8.9](contracts/mock/MockEIP712Base.sol#L2) allows old versions

contracts/mock/MockEIP712Base.sol#L2


 - [ ] ID-273
Pragma version[0.8.9](contracts/mock/TestFacetLib.sol#L2) allows old versions

contracts/mock/TestFacetLib.sol#L2


 - [ ] ID-274
Pragma version[0.8.9](contracts/protocol/bases/BeaconClientBase.sol#L2) allows old versions

contracts/protocol/bases/BeaconClientBase.sol#L2


 - [ ] ID-275
Pragma version[0.8.9](contracts/interfaces/IERC20.sol#L2) allows old versions

contracts/interfaces/IERC20.sol#L2


 - [ ] ID-276
Pragma version[0.8.9](contracts/interfaces/events/IBosonGroupEvents.sol#L2) allows old versions

contracts/interfaces/events/IBosonGroupEvents.sol#L2


 - [ ] ID-277
Pragma version[0.8.9](contracts/interfaces/handlers/IBosonDisputeHandler.sol#L2) allows old versions

contracts/interfaces/handlers/IBosonDisputeHandler.sol#L2


 - [ ] ID-278
Pragma version[0.8.9](contracts/diamond/DiamondLib.sol#L2) allows old versions

contracts/diamond/DiamondLib.sol#L2


 - [ ] ID-279
Pragma version[0.8.9](contracts/interfaces/events/IClientExternalAddressesEvents.sol#L2) allows old versions

contracts/interfaces/events/IClientExternalAddressesEvents.sol#L2


 - [ ] ID-280
Pragma version[0.8.9](contracts/protocol/libs/FundsLib.sol#L2) allows old versions

contracts/protocol/libs/FundsLib.sol#L2


 - [ ] ID-281
Pragma version[0.8.9](contracts/protocol/libs/ClientLib.sol#L2) allows old versions

contracts/protocol/libs/ClientLib.sol#L2


 - [ ] ID-282
Pragma version[0.8.9](contracts/interfaces/events/IBosonOfferEvents.sol#L2) allows old versions

contracts/interfaces/events/IBosonOfferEvents.sol#L2


 - [ ] ID-283
Pragma version[^0.8.0](node_modules/@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol#L4) allows old versions

node_modules/@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol#L4


 - [ ] ID-284
Pragma version[^0.8.0](node_modules/@openzeppelin/contracts/token/ERC20/IERC20.sol#L4) allows old versions

node_modules/@openzeppelin/contracts/token/ERC20/IERC20.sol#L4


 - [ ] ID-285
Pragma version[0.8.9](contracts/mock/TestProtocolFunctions.sol#L2) allows old versions

contracts/mock/TestProtocolFunctions.sol#L2


 - [ ] ID-286
Pragma version[0.8.9](contracts/ext_libs/Strings.sol#L4) allows old versions

contracts/ext_libs/Strings.sol#L4


 - [ ] ID-287
Pragma version[0.8.9](contracts/interfaces/handlers/IBosonFundsHandler.sol#L2) allows old versions

contracts/interfaces/handlers/IBosonFundsHandler.sol#L2


 - [ ] ID-288
Pragma version[^0.8.0](node_modules/@openzeppelin/contracts-upgradeable/interfaces/IERC2981Upgradeable.sol#L4) allows old versions

node_modules/@openzeppelin/contracts-upgradeable/interfaces/IERC2981Upgradeable.sol#L4


 - [ ] ID-289
Pragma version[0.8.9](contracts/protocol/bases/DisputeBase.sol#L2) allows old versions

contracts/protocol/bases/DisputeBase.sol#L2


 - [ ] ID-290
Pragma version[0.8.9](contracts/protocol/clients/proxy/BosonClientBeacon.sol#L2) allows old versions

contracts/protocol/clients/proxy/BosonClientBeacon.sol#L2


 - [ ] ID-291
Pragma version[^0.8.0](node_modules/@openzeppelin/contracts-upgradeable/token/ERC721/extensions/IERC721EnumerableUpgradeable.sol#L4) allows old versions

node_modules/@openzeppelin/contracts-upgradeable/token/ERC721/extensions/IERC721EnumerableUpgradeable.sol#L4


 - [ ] ID-292
Pragma version[0.8.9](contracts/protocol/clients/proxy/Proxy.sol#L3) allows old versions

contracts/protocol/clients/proxy/Proxy.sol#L3


 - [ ] ID-293
Pragma version[^0.8.0](node_modules/@openzeppelin/contracts-upgradeable/token/ERC1155/IERC1155Upgradeable.sol#L4) allows old versions

node_modules/@openzeppelin/contracts-upgradeable/token/ERC1155/IERC1155Upgradeable.sol#L4


 - [ ] ID-294
Pragma version[0.8.9](contracts/interfaces/handlers/IBosonPauseHandler.sol#L2) allows old versions

contracts/interfaces/handlers/IBosonPauseHandler.sol#L2


 - [ ] ID-295
Pragma version[0.8.9](contracts/interfaces/events/IBosonAccountEvents.sol#L2) allows old versions

contracts/interfaces/events/IBosonAccountEvents.sol#L2


 - [ ] ID-296
Pragma version[0.8.9](contracts/diamond/JewelerLib.sol#L2) allows old versions

contracts/diamond/JewelerLib.sol#L2


 - [ ] ID-297
Pragma version[0.8.9](contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L2) allows old versions

contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L2


 - [ ] ID-298
Pragma version[0.8.9](contracts/interfaces/handlers/IBosonExchangeHandler.sol#L2) allows old versions

contracts/interfaces/handlers/IBosonExchangeHandler.sol#L2


 - [ ] ID-299
Pragma version[^0.8.0](node_modules/@openzeppelin/contracts/token/ERC20/ERC20.sol#L4) allows old versions

node_modules/@openzeppelin/contracts/token/ERC20/ERC20.sol#L4


 - [ ] ID-300
Pragma version[0.8.9](contracts/interfaces/diamond/IERC165Extended.sol#L2) allows old versions

contracts/interfaces/diamond/IERC165Extended.sol#L2


 - [ ] ID-301
Pragma version[0.8.9](contracts/protocol/bases/TwinBase.sol#L2) allows old versions

contracts/protocol/bases/TwinBase.sol#L2


 - [ ] ID-302
Pragma version[0.8.9](contracts/mock/Test2FacetUpgrade.sol#L2) allows old versions

contracts/mock/Test2FacetUpgrade.sol#L2


 - [ ] ID-303
Pragma version[^0.8.0](node_modules/@openzeppelin/contracts-upgradeable/token/ERC721/IERC721ReceiverUpgradeable.sol#L4) allows old versions

node_modules/@openzeppelin/contracts-upgradeable/token/ERC721/IERC721ReceiverUpgradeable.sol#L4


 - [ ] ID-304
Pragma version[^0.8.0](node_modules/@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol#L4) allows old versions

node_modules/@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol#L4


 - [ ] ID-305
Pragma version[0.8.9](contracts/interfaces/ITwinToken.sol#L4) allows old versions

contracts/interfaces/ITwinToken.sol#L4


 - [ ] ID-306
Pragma version[0.8.9](contracts/interfaces/IERC1155.sol#L4) allows old versions

contracts/interfaces/IERC1155.sol#L4


 - [ ] ID-307
Pragma version[0.8.9](contracts/protocol/facets/BundleHandlerFacet.sol#L2) allows old versions

contracts/protocol/facets/BundleHandlerFacet.sol#L2


 - [ ] ID-308
Pragma version[0.8.9](contracts/protocol/facets/ProtocolInitializationHandlerFacet.sol#L2) allows old versions

contracts/protocol/facets/ProtocolInitializationHandlerFacet.sol#L2


 - [ ] ID-309
Pragma version[0.8.9](contracts/protocol/facets/BuyerHandlerFacet.sol#L2) allows old versions

contracts/protocol/facets/BuyerHandlerFacet.sol#L2


 - [ ] ID-310
Pragma version[0.8.9](contracts/interfaces/IERC20Metadata.sol#L2) allows old versions

contracts/interfaces/IERC20Metadata.sol#L2


 - [ ] ID-311
Pragma version[^0.8.0](node_modules/@openzeppelin/contracts/security/Pausable.sol#L4) allows old versions

node_modules/@openzeppelin/contracts/security/Pausable.sol#L4


 - [ ] ID-312
Pragma version[^0.8.0](node_modules/@openzeppelin/contracts-upgradeable/utils/introspection/IERC165Upgradeable.sol#L4) allows old versions

node_modules/@openzeppelin/contracts-upgradeable/utils/introspection/IERC165Upgradeable.sol#L4


 - [ ] ID-313
Pragma version[0.8.9](contracts/mock/MockMetaTransactionsHandlerFacet.sol#L2) allows old versions

contracts/mock/MockMetaTransactionsHandlerFacet.sol#L2


 - [ ] ID-314
Pragma version[0.8.9](contracts/interfaces/events/IBosonProtocolInitializationEvents.sol#L2) allows old versions

contracts/interfaces/events/IBosonProtocolInitializationEvents.sol#L2


 - [ ] ID-315
Pragma version[0.8.9](contracts/interfaces/events/IBosonPauseEvents.sol#L2) allows old versions

contracts/interfaces/events/IBosonPauseEvents.sol#L2


 - [ ] ID-316
Pragma version[0.8.9](contracts/domain/BosonConstants.sol#L2) allows old versions

contracts/domain/BosonConstants.sol#L2


 - [ ] ID-317
Pragma version[0.8.9](contracts/mock/Foreign20.sol#L2) allows old versions

contracts/mock/Foreign20.sol#L2


 - [ ] ID-318
Pragma version[0.8.9](contracts/mock/TestInitializableDiamond.sol#L2) allows old versions

contracts/mock/TestInitializableDiamond.sol#L2


 - [ ] ID-319
Pragma version[0.8.9](contracts/interfaces/IERC165.sol#L4) allows old versions

contracts/interfaces/IERC165.sol#L4


 - [ ] ID-320
Pragma version[0.8.9](contracts/interfaces/events/IBosonBundleEvents.sol#L2) allows old versions

contracts/interfaces/events/IBosonBundleEvents.sol#L2


 - [ ] ID-321
Pragma version[0.8.9](contracts/protocol/facets/AgentHandlerFacet.sol#L2) allows old versions

contracts/protocol/facets/AgentHandlerFacet.sol#L2


 - [ ] ID-322
Pragma version[0.8.9](contracts/protocol/facets/ConfigHandlerFacet.sol#L2) allows old versions

contracts/protocol/facets/ConfigHandlerFacet.sol#L2


 - [ ] ID-323
Pragma version[0.8.9](contracts/interfaces/handlers/IBosonAccountHandler.sol#L2) allows old versions

contracts/interfaces/handlers/IBosonAccountHandler.sol#L2


 - [ ] ID-324
Pragma version[0.8.9](contracts/example/SnapshotGate/support/IERC721Metadata.sol#L4) allows old versions

contracts/example/SnapshotGate/support/IERC721Metadata.sol#L4


 - [ ] ID-325
Pragma version[0.8.9](contracts/protocol/facets/OrchestrationHandlerFacet2.sol#L2) allows old versions

contracts/protocol/facets/OrchestrationHandlerFacet2.sol#L2


 - [ ] ID-326
Pragma version[^0.8.0](node_modules/@openzeppelin/contracts/access/Ownable.sol#L4) allows old versions

node_modules/@openzeppelin/contracts/access/Ownable.sol#L4


 - [ ] ID-327
Pragma version[0.8.9](contracts/protocol/clients/proxy/BeaconClientProxy.sol#L2) allows old versions

contracts/protocol/clients/proxy/BeaconClientProxy.sol#L2


 - [ ] ID-328
Pragma version[^0.8.0](node_modules/@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol#L4) allows old versions

node_modules/@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol#L4


 - [ ] ID-329
Pragma version[0.8.9](contracts/protocol/facets/ExchangeHandlerFacet.sol#L2) allows old versions

contracts/protocol/facets/ExchangeHandlerFacet.sol#L2


 - [ ] ID-330
Pragma version[^0.8.9](contracts/example/SnapshotGate/SnapshotGate.sol#L2) allows old versions

contracts/example/SnapshotGate/SnapshotGate.sol#L2


 - [ ] ID-331
Pragma version[^0.8.2](node_modules/@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol#L4) allows old versions

node_modules/@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol#L4


 - [ ] ID-332
Pragma version[0.8.9](contracts/interfaces/handlers/IBosonProtocolInitializationHandler.sol#L2) allows old versions

contracts/interfaces/handlers/IBosonProtocolInitializationHandler.sol#L2


 - [ ] ID-333
Pragma version[0.8.9](contracts/mock/MockNativeMetaTransaction.sol#L2) allows old versions

contracts/mock/MockNativeMetaTransaction.sol#L2


 - [ ] ID-334
Pragma version[^0.8.9](node_modules/@openzeppelin/contracts-upgradeable/metatx/ERC2771ContextUpgradeable.sol#L4) allows old versions

node_modules/@openzeppelin/contracts-upgradeable/metatx/ERC2771ContextUpgradeable.sol#L4


 - [ ] ID-335
Pragma version[^0.8.1](node_modules/@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol#L4) allows old versions

node_modules/@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol#L4


 - [ ] ID-336
Pragma version[^0.8.0](node_modules/@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol#L4) allows old versions

node_modules/@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol#L4


 - [ ] ID-337
Pragma version[^0.8.0](node_modules/@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol#L4) allows old versions

node_modules/@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol#L4


 - [ ] ID-338
Pragma version[^0.8.0](node_modules/@openzeppelin/contracts-upgradeable/utils/StringsUpgradeable.sol#L4) allows old versions

node_modules/@openzeppelin/contracts-upgradeable/utils/StringsUpgradeable.sol#L4


 - [ ] ID-339
Pragma version[0.8.9](contracts/interfaces/handlers/IBosonTwinHandler.sol#L2) allows old versions

contracts/interfaces/handlers/IBosonTwinHandler.sol#L2


 - [ ] ID-340
Pragma version[0.8.9](contracts/mock/Foreign1155.sol#L2) allows old versions

contracts/mock/Foreign1155.sol#L2


 - [ ] ID-341
Pragma version[0.8.9](contracts/protocol/clients/voucher/BosonVoucher.sol#L2) allows old versions

contracts/protocol/clients/voucher/BosonVoucher.sol#L2


 - [ ] ID-342
Pragma version[0.8.9](contracts/interfaces/events/IBosonMetaTransactionsEvents.sol#L2) allows old versions

contracts/interfaces/events/IBosonMetaTransactionsEvents.sol#L2


 - [ ] ID-343
Pragma version[0.8.9](contracts/interfaces/diamond/IDiamondLoupe.sol#L2) allows old versions

contracts/interfaces/diamond/IDiamondLoupe.sol#L2


 - [ ] ID-344
Pragma version[0.8.9](contracts/interfaces/events/IBosonConfigEvents.sol#L2) allows old versions

contracts/interfaces/events/IBosonConfigEvents.sol#L2


 - [ ] ID-345
Pragma version[0.8.9](contracts/interfaces/events/IBosonFundsEvents.sol#L2) allows old versions

contracts/interfaces/events/IBosonFundsEvents.sol#L2


 - [ ] ID-346
Pragma version[0.8.9](contracts/interfaces/events/IBosonDisputeEvents.sol#L2) allows old versions

contracts/interfaces/events/IBosonDisputeEvents.sol#L2


## low-level-calls
Impact: Informational
Confidence: High
 - [ ] ID-347
Low level call in [ProtocolInitializationHandlerFacet.initialize(bytes32,address[],bytes[],bool,bytes,bytes4[],bytes4[])](contracts/protocol/facets/ProtocolInitializationHandlerFacet.sol#L40-L80):
	- [(success,error) = _addresses[i].delegatecall(_calldata[i])](contracts/protocol/facets/ProtocolInitializationHandlerFacet.sol#L54)

contracts/protocol/facets/ProtocolInitializationHandlerFacet.sol#L40-L80


 - [ ] ID-348
Low level call in [ExchangeHandlerFacet.transferTwins(BosonTypes.Exchange,BosonTypes.Voucher)](contracts/protocol/facets/ExchangeHandlerFacet.sol#L696-L817):
	- [(success,result) = twin.tokenAddress.call(abi.encodeWithSignature(transferFrom(address,address,uint256),seller.operator,sender,twin.amount))](contracts/protocol/facets/ExchangeHandlerFacet.sol#L748-L755)
	- [(success,result) = twin.tokenAddress.call(abi.encodeWithSignature(safeTransferFrom(address,address,uint256,bytes),seller.operator,sender,tokenId,))](contracts/protocol/facets/ExchangeHandlerFacet.sol#L765-L773)
	- [(success,result) = twin.tokenAddress.call(abi.encodeWithSignature(safeTransferFrom(address,address,uint256,uint256,bytes),seller.operator,sender,tokenId,twin.amount,))](contracts/protocol/facets/ExchangeHandlerFacet.sol#L776-L785)

contracts/protocol/facets/ExchangeHandlerFacet.sol#L696-L817


 - [ ] ID-349
Low level call in [AddressUpgradeable.functionCallWithValue(address,bytes,uint256,string)](node_modules/@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol#L128-L139):
	- [(success,returndata) = target.call{value: value}(data)](node_modules/@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol#L137)

node_modules/@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol#L128-L139


 - [ ] ID-350
Low level call in [MockExchangeHandlerFacet.transferTwins(BosonTypes.Exchange,BosonTypes.Voucher)](contracts/mock/MockExchangeHandlerFacet.sol#L381-L496):
	- [(success,result) = twin.tokenAddress.call(abi.encodeWithSignature(transferFrom(address,address,uint256),seller.operator,sender,twin.amount))](contracts/mock/MockExchangeHandlerFacet.sol#L430-L437)
	- [(success,result) = twin.tokenAddress.call(abi.encodeWithSignature(safeTransferFrom(address,address,uint256,bytes),seller.operator,sender,tokenId,))](contracts/mock/MockExchangeHandlerFacet.sol#L447-L455)
	- [(success,result) = twin.tokenAddress.call(abi.encodeWithSignature(safeTransferFrom(address,address,uint256,uint256,bytes),seller.operator,sender,tokenId,twin.amount,))](contracts/mock/MockExchangeHandlerFacet.sol#L458-L467)

contracts/mock/MockExchangeHandlerFacet.sol#L381-L496


 - [ ] ID-351
Low level call in [MockNativeMetaTransaction.executeMetaTransaction(MockNativeMetaTransaction.MetaTransaction,bytes32,bytes32,uint8)](contracts/mock/MockNativeMetaTransaction.sol#L30-L50):
	- [(success,returnData) = metaTx.to.call(abi.encodePacked(metaTx.functionSignature,metaTx.from))](contracts/mock/MockNativeMetaTransaction.sol#L44-L46)

contracts/mock/MockNativeMetaTransaction.sol#L30-L50


 - [ ] ID-352
Low level call in [AddressUpgradeable.sendValue(address,uint256)](node_modules/@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol#L60-L65):
	- [(success) = recipient.call{value: amount}()](node_modules/@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol#L63)

node_modules/@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol#L60-L65


 - [ ] ID-353
Low level call in [AddressUpgradeable.functionStaticCall(address,bytes,string)](node_modules/@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol#L157-L166):
	- [(success,returndata) = target.staticcall(data)](node_modules/@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol#L164)

node_modules/@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol#L157-L166


 - [ ] ID-354
Low level call in [MetaTransactionsHandlerFacet.executeTx(address,string,bytes,uint256)](contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L236-L265):
	- [(success,returnData) = address(this).call{value: msg.value}(_functionSignature)](contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L253)

contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L236-L265


 - [ ] ID-355
Low level call in [FundsLib.transferFundsFromProtocol(uint256,address,address,uint256)](contracts/protocol/libs/FundsLib.sol#L274-L295):
	- [(success) = _to.call{value: _amount}()](contracts/protocol/libs/FundsLib.sol#L286)

contracts/protocol/libs/FundsLib.sol#L274-L295


 - [ ] ID-356
Low level call in [Address.functionCallWithValue(address,bytes,uint256,string)](contracts/ext_libs/Address.sol#L103-L114):
	- [(success,returndata) = target.call{value: value}(data)](contracts/ext_libs/Address.sol#L112)

contracts/ext_libs/Address.sol#L103-L114


 - [ ] ID-357
Low level call in [JewelerLib.initializeDiamondCut(address,bytes)](contracts/diamond/JewelerLib.sol#L271-L297):
	- [(success,error) = _init.delegatecall(_calldata)](contracts/diamond/JewelerLib.sol#L285)

contracts/diamond/JewelerLib.sol#L271-L297


## naming-convention
Impact: Informational
Confidence: High
 - [ ] ID-358
Parameter [BosonToken.allowance(address,address)._spender](contracts/mock/BosonToken.sol#L39) is not in mixedCase

contracts/mock/BosonToken.sol#L39


 - [ ] ID-359
Parameter [BosonToken.setHolderBalance(address,uint256)._balance](contracts/mock/BosonToken.sol#L21) is not in mixedCase

contracts/mock/BosonToken.sol#L21


 - [ ] ID-360
Parameter [BosonToken.allowance(address,address)._owner](contracts/mock/BosonToken.sol#L39) is not in mixedCase

contracts/mock/BosonToken.sol#L39


 - [ ] ID-361
Parameter [BosonToken.balanceOf(address)._holder](contracts/mock/BosonToken.sol#L30) is not in mixedCase

contracts/mock/BosonToken.sol#L30


 - [ ] ID-362
Parameter [BosonToken.setHolderBalance(address,uint256)._holder](contracts/mock/BosonToken.sol#L21) is not in mixedCase

contracts/mock/BosonToken.sol#L21


 - [ ] ID-363
Parameter [OrchestrationHandlerFacet1.createSellerAndPremintedOfferWithConditionAndTwinAndBundle(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Condition,BosonTypes.Twin,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._seller](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1220) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1220


 - [ ] ID-364
Parameter [BeaconClientBase.getBosonSeller(uint256)._sellerId](contracts/protocol/bases/BeaconClientBase.sol#L92) is not in mixedCase

contracts/protocol/bases/BeaconClientBase.sol#L92


 - [ ] ID-365
Parameter [SellerHandlerFacet.optInToSellerUpdate(uint256,BosonTypes.SellerUpdateFields[])._fieldsToUpdate](contracts/protocol/facets/SellerHandlerFacet.sol#L193) is not in mixedCase

contracts/protocol/facets/SellerHandlerFacet.sol#L193


 - [ ] ID-366
Parameter [ProtocolBase.getBuyerIdByWallet(address)._wallet](contracts/protocol/bases/ProtocolBase.sol#L186) is not in mixedCase

contracts/protocol/bases/ProtocolBase.sol#L186


 - [ ] ID-367
Parameter [OfferBase.createOfferInternal(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256)._offer](contracts/protocol/bases/OfferBase.sol#L49) is not in mixedCase

contracts/protocol/bases/OfferBase.sol#L49


 - [ ] ID-368
Parameter [EIP712Lib.verify(address,bytes32,bytes32,bytes32,uint8)._sigS](contracts/protocol/libs/EIP712Lib.sol#L53) is not in mixedCase

contracts/protocol/libs/EIP712Lib.sol#L53


 - [ ] ID-369
Parameter [PausableBase.revertIfPaused(BosonTypes.PausableRegion)._region](contracts/protocol/bases/PausableBase.sol#L177) is not in mixedCase

contracts/protocol/bases/PausableBase.sol#L177


 - [ ] ID-370
Parameter [JewelerLib.enforceHasContractCode(address,string)._contract](contracts/diamond/JewelerLib.sol#L307) is not in mixedCase

contracts/diamond/JewelerLib.sol#L307


 - [ ] ID-371
Parameter [ClientBase.getBosonOffer(uint256)._exchangeId](contracts/protocol/bases/ClientBase.sol#L42) is not in mixedCase

contracts/protocol/bases/ClientBase.sol#L42


 - [ ] ID-372
Parameter [SellerBase.storeSeller(BosonTypes.Seller,BosonTypes.AuthToken,ProtocolLib.ProtocolLookups)._authToken](contracts/protocol/bases/SellerBase.sol#L118) is not in mixedCase

contracts/protocol/bases/SellerBase.sol#L118


 - [ ] ID-373
Parameter [ConfigHandlerFacet.setProtocolFeePercentage(uint256)._protocolFeePercentage](contracts/protocol/facets/ConfigHandlerFacet.sol#L194) is not in mixedCase

contracts/protocol/facets/ConfigHandlerFacet.sol#L194


 - [ ] ID-374
Parameter [MetaTransactionsHandlerFacet.hashDisputeResolutionDetails(bytes)._disputeResolutionDetails](contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L154) is not in mixedCase

contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L154


 - [ ] ID-375
Parameter [ProtocolBase.fetchBundleIdByTwin(uint256)._twinId](contracts/protocol/bases/ProtocolBase.sol#L590) is not in mixedCase

contracts/protocol/bases/ProtocolBase.sol#L590


 - [ ] ID-376
Parameter [ConfigHandlerFacet.setProtocolFeeFlatBoson(uint256)._protocolFeeFlatBoson](contracts/protocol/facets/ConfigHandlerFacet.sol#L224) is not in mixedCase

contracts/protocol/facets/ConfigHandlerFacet.sol#L224


 - [ ] ID-377
Parameter [OfferHandlerFacet.reserveRange(uint256,uint256)._length](contracts/protocol/facets/OfferHandlerFacet.sol#L144) is not in mixedCase

contracts/protocol/facets/OfferHandlerFacet.sol#L144


 - [ ] ID-378
Parameter [ERC165Facet.removeSupportedInterface(bytes4)._interfaceId](contracts/diamond/facets/ERC165Facet.sol#L47) is not in mixedCase

contracts/diamond/facets/ERC165Facet.sol#L47


 - [ ] ID-379
Parameter [BosonVoucherBase.royaltyInfo(uint256,uint256)._salePrice](contracts/protocol/clients/voucher/BosonVoucher.sol#L544) is not in mixedCase

contracts/protocol/clients/voucher/BosonVoucher.sol#L544


 - [ ] ID-380
Parameter [OrchestrationHandlerFacet1.createSellerAndOffer(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._agentId](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L91) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L91


 - [ ] ID-381
Parameter [FundsLib.validateIncomingPayment(address,uint256)._exchangeToken](contracts/protocol/libs/FundsLib.sol#L113) is not in mixedCase

contracts/protocol/libs/FundsLib.sol#L113


 - [ ] ID-382
Parameter [TwinBase.contractSupportsInterface(address,bytes4)._interfaceId](contracts/protocol/bases/TwinBase.sol#L152) is not in mixedCase

contracts/protocol/bases/TwinBase.sol#L152


 - [ ] ID-383
Parameter [ConfigHandlerFacet.setMaxPremintedVouchers(uint256)._maxPremintedVouchers](contracts/protocol/facets/ConfigHandlerFacet.sol#L747) is not in mixedCase

contracts/protocol/facets/ConfigHandlerFacet.sol#L747


 - [ ] ID-384
Parameter [MetaTransactionsHandlerFacet.isFunctionAllowlisted(bytes32)._functionNameHash](contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L353) is not in mixedCase

contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L353


 - [ ] ID-385
Function [ERC1155Upgradeable.__ERC1155_init_unchained(string)](node_modules/@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol#L40-L42) is not in mixedCase

node_modules/@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol#L40-L42


 - [ ] ID-386
Parameter [DisputeResolverHandlerFacet.optInToDisputeResolverUpdate(uint256,BosonTypes.DisputeResolverUpdateFields[])._disputeResolverId](contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L311) is not in mixedCase

contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L311


 - [ ] ID-387
Parameter [FundsHandlerFacet.getAvailableFunds(uint256)._entityId](contracts/protocol/facets/FundsHandlerFacet.sol#L163) is not in mixedCase

contracts/protocol/facets/FundsHandlerFacet.sol#L163


 - [ ] ID-388
Parameter [ProtocolInitializationHandlerFacet.addInterfaces(bytes4[])._interfaces](contracts/protocol/facets/ProtocolInitializationHandlerFacet.sol#L109) is not in mixedCase

contracts/protocol/facets/ProtocolInitializationHandlerFacet.sol#L109


 - [ ] ID-389
Parameter [DisputeHandlerFacet.finalizeDispute(uint256,BosonTypes.Exchange,BosonTypes.Dispute,BosonTypes.DisputeDates,BosonTypes.DisputeState,uint256)._disputeDates](contracts/protocol/facets/DisputeHandlerFacet.sol#L442) is not in mixedCase

contracts/protocol/facets/DisputeHandlerFacet.sol#L442


 - [ ] ID-390
Parameter [DisputeHandlerFacet.hashResolution(uint256,uint256)._buyerPercent](contracts/protocol/facets/DisputeHandlerFacet.sol#L583) is not in mixedCase

contracts/protocol/facets/DisputeHandlerFacet.sol#L583


 - [ ] ID-391
Parameter [ConfigHandlerFacet.setMinDisputePeriod(uint256)._minDisputePeriod](contracts/protocol/facets/ConfigHandlerFacet.sol#L723) is not in mixedCase

contracts/protocol/facets/ConfigHandlerFacet.sol#L723


 - [ ] ID-392
Parameter [ProtocolBase.getSellerIdByAuthToken(BosonTypes.AuthToken)._authToken](contracts/protocol/bases/ProtocolBase.sol#L167) is not in mixedCase

contracts/protocol/bases/ProtocolBase.sol#L167


 - [ ] ID-393
Parameter [MetaTransactionsHandlerFacet.isFunctionAllowlisted(string)._functionName](contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L363) is not in mixedCase

contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L363


 - [ ] ID-394
Parameter [DisputeHandlerFacet.getDisputeState(uint256)._exchangeId](contracts/protocol/facets/DisputeHandlerFacet.sol#L488) is not in mixedCase

contracts/protocol/facets/DisputeHandlerFacet.sol#L488


 - [ ] ID-395
Parameter [GroupBase.createGroupInternal(BosonTypes.Group,BosonTypes.Condition)._condition](contracts/protocol/bases/GroupBase.sol#L30) is not in mixedCase

contracts/protocol/bases/GroupBase.sol#L30


 - [ ] ID-396
Parameter [BosonVoucherBase.transferOwnership(address)._newOwner](contracts/protocol/clients/voucher/BosonVoucher.sol#L494) is not in mixedCase

contracts/protocol/clients/voucher/BosonVoucher.sol#L494


 - [ ] ID-397
Parameter [DisputeHandlerFacet.raiseDispute(uint256)._exchangeId](contracts/protocol/facets/DisputeHandlerFacet.sol#L41) is not in mixedCase

contracts/protocol/facets/DisputeHandlerFacet.sol#L41


 - [ ] ID-398
Parameter [OrchestrationHandlerFacet1.createSellerAndPremintedOfferWithCondition(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Condition,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._disputeResolverId](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L840) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L840


 - [ ] ID-399
Parameter [BuyerHandlerFacet.updateBuyer(BosonTypes.Buyer)._buyer](contracts/protocol/facets/BuyerHandlerFacet.sol#L57) is not in mixedCase

contracts/protocol/facets/BuyerHandlerFacet.sol#L57


 - [ ] ID-400
Parameter [BosonVoucherBase.initializeVoucher(uint256,address,BosonTypes.VoucherInitValues)._newOwner](contracts/protocol/clients/voucher/BosonVoucher.sol#L86) is not in mixedCase

contracts/protocol/clients/voucher/BosonVoucher.sol#L86


 - [ ] ID-401
Parameter [DisputeHandlerFacet.extendDisputeTimeout(uint256,uint256)._newDisputeTimeout](contracts/protocol/facets/DisputeHandlerFacet.sol#L111) is not in mixedCase

contracts/protocol/facets/DisputeHandlerFacet.sol#L111


 - [ ] ID-402
Parameter [OrchestrationHandlerFacet1.createSellerAndPremintedOfferWithCondition(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Condition,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._offer](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L837) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L837


 - [ ] ID-403
Parameter [ExchangeHandlerFacet.completeExchange(uint256)._exchangeId](contracts/protocol/facets/ExchangeHandlerFacet.sol#L240) is not in mixedCase

contracts/protocol/facets/ExchangeHandlerFacet.sol#L240


 - [ ] ID-404
Parameter [OrchestrationHandlerFacet1.createTwinAndBundleAfterOffer(BosonTypes.Twin,uint256,uint256)._offerId](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1269) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1269


 - [ ] ID-405
Parameter [ProtocolBase.getSellerIdByClerk(address)._clerk](contracts/protocol/bases/ProtocolBase.sol#L152) is not in mixedCase

contracts/protocol/bases/ProtocolBase.sol#L152


 - [ ] ID-406
Parameter [OfferBase.createOfferInternal(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256)._offerDurations](contracts/protocol/bases/OfferBase.sol#L51) is not in mixedCase

contracts/protocol/bases/OfferBase.sol#L51


 - [ ] ID-407
Parameter [ExchangeHandlerFacet.commitToOfferInternal(address,BosonTypes.Offer,uint256,bool)._exchangeId](contracts/protocol/facets/ExchangeHandlerFacet.sol#L153) is not in mixedCase

contracts/protocol/facets/ExchangeHandlerFacet.sol#L153


 - [ ] ID-408
Parameter [OrchestrationHandlerFacet1.createPremintedOfferWithCondition(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Condition,uint256)._agentId](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L295) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L295


 - [ ] ID-409
Parameter [OrchestrationHandlerFacet1.createSellerAndOfferAndTwinWithBundle(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.Twin,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._voucherInitValues](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L938) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L938


 - [ ] ID-410
Parameter [DisputeResolverHandlerFacet.getDisputeResolver(uint256)._disputeResolverId](contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L673) is not in mixedCase

contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L673


 - [ ] ID-411
Parameter [BosonVoucherBase.royaltyInfo(uint256,uint256)._tokenId](contracts/protocol/clients/voucher/BosonVoucher.sol#L544) is not in mixedCase

contracts/protocol/clients/voucher/BosonVoucher.sol#L544


 - [ ] ID-412
Parameter [SellerHandlerFacet.updateSeller(BosonTypes.Seller,BosonTypes.AuthToken)._seller](contracts/protocol/facets/SellerHandlerFacet.sol#L77) is not in mixedCase

contracts/protocol/facets/SellerHandlerFacet.sol#L77


 - [ ] ID-413
Parameter [ConfigHandlerFacet.setMaxResolutionPeriod(uint256)._maxResolutionPeriod](contracts/protocol/facets/ConfigHandlerFacet.sol#L697) is not in mixedCase

contracts/protocol/facets/ConfigHandlerFacet.sol#L697


 - [ ] ID-414
Parameter [EIP712Lib.toTypedMessageHash(bytes32)._messageHash](contracts/protocol/libs/EIP712Lib.sol#L101) is not in mixedCase

contracts/protocol/libs/EIP712Lib.sol#L101


 - [ ] ID-415
Parameter [BosonVoucherBase.reserveRange(uint256,uint256,uint256)._length](contracts/protocol/clients/voucher/BosonVoucher.sol#L163) is not in mixedCase

contracts/protocol/clients/voucher/BosonVoucher.sol#L163


 - [ ] ID-416
Parameter [AgentHandlerFacet.createAgent(BosonTypes.Agent)._agent](contracts/protocol/facets/AgentHandlerFacet.sol#L38) is not in mixedCase

contracts/protocol/facets/AgentHandlerFacet.sol#L38


 - [ ] ID-417
Parameter [DisputeResolverHandlerFacet.storeSellerAllowList(uint256,uint256[])._sellerAllowList](contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L802) is not in mixedCase

contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L802


 - [ ] ID-418
Parameter [ExchangeHandlerFacet.holdsSpecificToken(address,BosonTypes.Condition)._buyer](contracts/protocol/facets/ExchangeHandlerFacet.sol#L947) is not in mixedCase

contracts/protocol/facets/ExchangeHandlerFacet.sol#L947


 - [ ] ID-419
Parameter [DisputeHandlerFacet.hashResolution(uint256,uint256)._exchangeId](contracts/protocol/facets/DisputeHandlerFacet.sol#L583) is not in mixedCase

contracts/protocol/facets/DisputeHandlerFacet.sol#L583


 - [ ] ID-420
Parameter [DiamondLoupeFacet.facetAddress(bytes4)._functionSelector](contracts/diamond/facets/DiamondLoupeFacet.sol#L162) is not in mixedCase

contracts/diamond/facets/DiamondLoupeFacet.sol#L162


 - [ ] ID-421
Parameter [Foreign1155.mint(uint256,uint256)._tokenId](contracts/mock/Foreign1155.sol#L17) is not in mixedCase

contracts/mock/Foreign1155.sol#L17


 - [ ] ID-422
Parameter [MetaTransactionsHandlerFacet.executeMetaTransaction(address,string,bytes,uint256,bytes32,bytes32,uint8)._userAddress](contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L288) is not in mixedCase

contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L288


 - [ ] ID-423
Parameter [DisputeHandlerFacet.decideDispute(uint256,uint256)._exchangeId](contracts/protocol/facets/DisputeHandlerFacet.sol#L345) is not in mixedCase

contracts/protocol/facets/DisputeHandlerFacet.sol#L345


 - [ ] ID-424
Parameter [Foreign20Malicious2.setProtocolAddress(address)._newProtocolAddress](contracts/mock/Foreign20.sol#L130) is not in mixedCase

contracts/mock/Foreign20.sol#L130


 - [ ] ID-425
Parameter [ProtocolBase.getSellerIdByAdmin(address)._admin](contracts/protocol/bases/ProtocolBase.sol#L137) is not in mixedCase

contracts/protocol/bases/ProtocolBase.sol#L137


 - [ ] ID-426
Parameter [ConfigHandlerFacet.setAuthTokenContract(BosonTypes.AuthTokenType,address)._authTokenType](contracts/protocol/facets/ConfigHandlerFacet.sol#L633) is not in mixedCase

contracts/protocol/facets/ConfigHandlerFacet.sol#L633


 - [ ] ID-427
Parameter [OrchestrationHandlerFacet1.createOfferAddToGroup(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,uint256)._agentId](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L348) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L348


 - [ ] ID-428
Parameter [OrchestrationHandlerFacet2.raiseAndEscalateDispute(uint256)._exchangeId](contracts/protocol/facets/OrchestrationHandlerFacet2.sol#L48) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet2.sol#L48


 - [ ] ID-429
Parameter [MetaTransactionsHandlerFacet.isUsedNonce(address,uint256)._associatedAddress](contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L169) is not in mixedCase

contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L169


 - [ ] ID-430
Parameter [SellerHandlerFacet.preUpdateSellerCheck(uint256,address,ProtocolLib.ProtocolLookups)._sellerId](contracts/protocol/facets/SellerHandlerFacet.sol#L433) is not in mixedCase

contracts/protocol/facets/SellerHandlerFacet.sol#L433


 - [ ] ID-431
Parameter [TwinHandlerFacet.removeTwin(uint256)._twinId](contracts/protocol/facets/TwinHandlerFacet.sol#L59) is not in mixedCase

contracts/protocol/facets/TwinHandlerFacet.sol#L59


 - [ ] ID-432
Parameter [OrchestrationHandlerFacet1.createPremintedOfferAddToGroup(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,uint256,uint256)._offer](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L408) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L408


 - [ ] ID-433
Parameter [DiamondCutFacet.diamondCut(IDiamondCut.FacetCut[],address,bytes)._facetCuts](contracts/diamond/facets/DiamondCutFacet.sol#L38) is not in mixedCase

contracts/diamond/facets/DiamondCutFacet.sol#L38


 - [ ] ID-434
Parameter [DisputeResolverHandlerFacet.storeDisputeResolver(BosonTypes.DisputeResolver)._disputeResolver](contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L769) is not in mixedCase

contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L769


 - [ ] ID-435
Parameter [OrchestrationHandlerFacet1.createSellerAndOfferAndTwinWithBundle(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.Twin,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._disputeResolverId](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L935) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L935


 - [ ] ID-436
Parameter [ExchangeHandlerFacet.extendVoucher(uint256,uint256)._exchangeId](contracts/protocol/facets/ExchangeHandlerFacet.sol#L401) is not in mixedCase

contracts/protocol/facets/ExchangeHandlerFacet.sol#L401


 - [ ] ID-437
Parameter [ProtocolBase.getGroupIdByOffer(uint256)._offerId](contracts/protocol/bases/ProtocolBase.sol#L273) is not in mixedCase

contracts/protocol/bases/ProtocolBase.sol#L273


 - [ ] ID-438
Parameter [OrchestrationHandlerFacet1.createPremintedOfferWithConditionAndTwinAndBundle(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Condition,BosonTypes.Twin,uint256)._agentId](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L679) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L679


 - [ ] ID-439
Parameter [Foreign20Malicious2.setMetaTxBytes(address,bytes,bytes32,bytes32,uint8)._metaTxBytes](contracts/mock/Foreign20.sol#L136) is not in mixedCase

contracts/mock/Foreign20.sol#L136


 - [ ] ID-440
Parameter [BosonVoucherBase.burnPremintedVouchers(uint256)._offerId](contracts/protocol/clients/voucher/BosonVoucher.sol#L277) is not in mixedCase

contracts/protocol/clients/voucher/BosonVoucher.sol#L277


 - [ ] ID-441
Parameter [ExchangeHandlerFacet.getExchange(uint256)._exchangeId](contracts/protocol/facets/ExchangeHandlerFacet.sol#L579) is not in mixedCase

contracts/protocol/facets/ExchangeHandlerFacet.sol#L579


 - [ ] ID-442
Parameter [FundsHandlerFacet.withdrawFunds(uint256,address[],uint256[])._entityId](contracts/protocol/facets/FundsHandlerFacet.sol#L91) is not in mixedCase

contracts/protocol/facets/FundsHandlerFacet.sol#L91


 - [ ] ID-443
Parameter [OrchestrationHandlerFacet1.createSellerAndPremintedOfferWithConditionAndTwinAndBundle(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Condition,BosonTypes.Twin,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._authToken](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1228) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1228


 - [ ] ID-444
Parameter [OrchestrationHandlerFacet1.createOfferAndTwinWithBundle(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.Twin,uint256)._agentId](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L472) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L472


 - [ ] ID-445
Parameter [OfferBase.reserveRangeInternal(uint256,uint256)._offerId](contracts/protocol/bases/OfferBase.sol#L295) is not in mixedCase

contracts/protocol/bases/OfferBase.sol#L295


 - [ ] ID-446
Parameter [OrchestrationHandlerFacet1.createOfferAddToGroup(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,uint256)._disputeResolverId](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L346) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L346


 - [ ] ID-447
Parameter [OrchestrationHandlerFacet1.createOfferAndTwinWithBundle(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.Twin,uint256)._offer](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L467) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L467


 - [ ] ID-448
Parameter [MetaTransactionsHandlerFacet.hashExchangeDetails(bytes)._exchangeDetails](contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L121) is not in mixedCase

contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L121


 - [ ] ID-449
Parameter [OrchestrationHandlerFacet1.createSellerAndPremintedOfferWithCondition(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Condition,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._condition](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L842) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L842


 - [ ] ID-450
Parameter [FundsLib.encumberFunds(uint256,uint256,bool)._buyerId](contracts/protocol/libs/FundsLib.sol#L67) is not in mixedCase

contracts/protocol/libs/FundsLib.sol#L67


 - [ ] ID-451
Parameter [OrchestrationHandlerFacet1.createPremintedOfferWithConditionAndTwinAndBundle(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Condition,BosonTypes.Twin,uint256)._twin](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L678) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L678


 - [ ] ID-452
Parameter [OrchestrationHandlerFacet1.createSellerAndOfferWithConditionAndTwinAndBundle(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.Condition,BosonTypes.Twin,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._voucherInitValues](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1126) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1126


 - [ ] ID-453
Parameter [FundsLib.validateIncomingPayment(address,uint256)._value](contracts/protocol/libs/FundsLib.sol#L113) is not in mixedCase

contracts/protocol/libs/FundsLib.sol#L113


 - [ ] ID-454
Parameter [OrchestrationHandlerFacet1.createOfferAndTwinWithBundle(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.Twin,uint256)._disputeResolverId](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L470) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L470


 - [ ] ID-455
Parameter [ExchangeHandlerFacet.commitToOffer(address,uint256)._buyer](contracts/protocol/facets/ExchangeHandlerFacet.sol#L62) is not in mixedCase

contracts/protocol/facets/ExchangeHandlerFacet.sol#L62


 - [ ] ID-456
Parameter [ExchangeHandlerFacet.extendVoucher(uint256,uint256)._validUntilDate](contracts/protocol/facets/ExchangeHandlerFacet.sol#L401) is not in mixedCase

contracts/protocol/facets/ExchangeHandlerFacet.sol#L401


 - [ ] ID-457
Parameter [AgentHandlerFacet.storeAgent(BosonTypes.Agent)._agent](contracts/protocol/facets/AgentHandlerFacet.sol#L129) is not in mixedCase

contracts/protocol/facets/AgentHandlerFacet.sol#L129


 - [ ] ID-458
Parameter [ProtocolBase.fetchDisputeResolver(uint256)._disputeResolverId](contracts/protocol/bases/ProtocolBase.sol#L334) is not in mixedCase

contracts/protocol/bases/ProtocolBase.sol#L334


 - [ ] ID-459
Parameter [OrchestrationHandlerFacet1.createPremintedOfferWithCondition(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Condition,uint256)._reservedRangeLength](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L293) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L293


 - [ ] ID-460
Parameter [ExchangeHandlerFacet.commitToPreMintedOffer(address,uint256,uint256)._buyer](contracts/protocol/facets/ExchangeHandlerFacet.sol#L106) is not in mixedCase

contracts/protocol/facets/ExchangeHandlerFacet.sol#L106


 - [ ] ID-461
Parameter [MockNFTAuth721.mint(address,uint256)._tokenId](contracts/mock/MockNFTAuth721.sol#L20) is not in mixedCase

contracts/mock/MockNFTAuth721.sol#L20


 - [ ] ID-462
Parameter [DisputeHandlerFacet.expireEscalatedDispute(uint256)._exchangeId](contracts/protocol/facets/DisputeHandlerFacet.sol#L403) is not in mixedCase

contracts/protocol/facets/DisputeHandlerFacet.sol#L403


 - [ ] ID-463
Parameter [MockExchangeHandlerFacet.finalizeExchange(BosonTypes.Exchange,BosonTypes.ExchangeState)._exchange](contracts/mock/MockExchangeHandlerFacet.sol#L314) is not in mixedCase

contracts/mock/MockExchangeHandlerFacet.sol#L314


 - [ ] ID-464
Parameter [ERC165Facet.addSupportedInterface(bytes4)._interfaceId](contracts/diamond/facets/ERC165Facet.sol#L32) is not in mixedCase

contracts/diamond/facets/ERC165Facet.sol#L32


 - [ ] ID-465
Parameter [TwinHandlerFacet.createTwin(BosonTypes.Twin)._twin](contracts/protocol/facets/TwinHandlerFacet.sol#L42) is not in mixedCase

contracts/protocol/facets/TwinHandlerFacet.sol#L42


 - [ ] ID-466
Parameter [OrchestrationHandlerFacet1.createSellerAndOfferWithConditionAndTwinAndBundle(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.Condition,BosonTypes.Twin,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._disputeResolverId](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1122) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1122


 - [ ] ID-467
Parameter [OrchestrationHandlerFacet1.createOfferWithCondition(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.Condition,uint256)._offer](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L221) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L221


 - [ ] ID-468
Parameter [DiamondLib.removeSupportedInterface(bytes4)._interfaceId](contracts/diamond/DiamondLib.sol#L76) is not in mixedCase

contracts/diamond/DiamondLib.sol#L76


 - [ ] ID-469
Parameter [OrchestrationHandlerFacet1.createOfferWithConditionAndTwinAndBundle(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.Condition,BosonTypes.Twin,uint256)._condition](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L604) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L604


 - [ ] ID-470
Parameter [BeaconClientBase.getBosonExchange(uint256)._exchangeId](contracts/protocol/bases/BeaconClientBase.sol#L69) is not in mixedCase

contracts/protocol/bases/BeaconClientBase.sol#L69


 - [ ] ID-471
Parameter [OfferHandlerFacet.createOffer(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256)._offerDurations](contracts/protocol/facets/OfferHandlerFacet.sol#L59) is not in mixedCase

contracts/protocol/facets/OfferHandlerFacet.sol#L59


 - [ ] ID-472
Parameter [ProtocolBase.getValidExchange(uint256,BosonTypes.ExchangeState)._expectedState](contracts/protocol/bases/ProtocolBase.sol#L645) is not in mixedCase

contracts/protocol/bases/ProtocolBase.sol#L645


 - [ ] ID-473
Parameter [WithoutFallbackError.withdrawFunds(address,uint256,address[],uint256[])._fundsHandlerAddress](contracts/mock/FallbackError.sol#L21) is not in mixedCase

contracts/mock/FallbackError.sol#L21


 - [ ] ID-474
Parameter [WithoutFallbackError.withdrawFunds(address,uint256,address[],uint256[])._buyerId](contracts/mock/FallbackError.sol#L22) is not in mixedCase

contracts/mock/FallbackError.sol#L22


 - [ ] ID-475
Parameter [DiamondCutFacet.diamondCut(IDiamondCut.FacetCut[],address,bytes)._init](contracts/diamond/facets/DiamondCutFacet.sol#L39) is not in mixedCase

contracts/diamond/facets/DiamondCutFacet.sol#L39


 - [ ] ID-476
Parameter [ExchangeHandlerFacet.commitToOfferInternal(address,BosonTypes.Offer,uint256,bool)._buyer](contracts/protocol/facets/ExchangeHandlerFacet.sol#L151) is not in mixedCase

contracts/protocol/facets/ExchangeHandlerFacet.sol#L151


 - [ ] ID-477
Parameter [GroupHandlerFacet.addOffersToGroup(uint256,uint256[])._groupId](contracts/protocol/facets/GroupHandlerFacet.sol#L66) is not in mixedCase

contracts/protocol/facets/GroupHandlerFacet.sol#L66


 - [ ] ID-478
Parameter [DisputeBase.raiseDisputeInternal(BosonTypes.Exchange,BosonTypes.Voucher,uint256)._exchange](contracts/protocol/bases/DisputeBase.sol#L30) is not in mixedCase

contracts/protocol/bases/DisputeBase.sol#L30


 - [ ] ID-479
Parameter [AgentHandlerFacet.getAgent(uint256)._agentId](contracts/protocol/facets/AgentHandlerFacet.sol#L120) is not in mixedCase

contracts/protocol/facets/AgentHandlerFacet.sol#L120


 - [ ] ID-480
Parameter [OfferHandlerFacet.createOffer(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256)._disputeResolverId](contracts/protocol/facets/OfferHandlerFacet.sol#L60) is not in mixedCase

contracts/protocol/facets/OfferHandlerFacet.sol#L60


 - [ ] ID-481
Parameter [OrchestrationHandlerFacet1.createSellerAndOfferWithConditionAndTwinAndBundle(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.Condition,BosonTypes.Twin,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._offerDurations](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1121) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1121


 - [ ] ID-482
Parameter [DisputeResolverHandlerFacet.addFeesToDisputeResolver(uint256,BosonTypes.DisputeResolverFee[])._disputeResolverId](contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L424) is not in mixedCase

contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L424


 - [ ] ID-483
Parameter [OrchestrationHandlerFacet1.createSellerAndPremintedOfferAndTwinWithBundle(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Twin,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._voucherInitValues](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1028) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1028


 - [ ] ID-484
Parameter [BosonVoucherBase.transferFrom(address,address,uint256)._tokenId](contracts/protocol/clients/voucher/BosonVoucher.sol#L395) is not in mixedCase

contracts/protocol/clients/voucher/BosonVoucher.sol#L395


 - [ ] ID-485
Parameter [ConfigHandlerFacet.setMaxOffersPerBundle(uint16)._maxOffersPerBundle](contracts/protocol/facets/ConfigHandlerFacet.sol#L308) is not in mixedCase

contracts/protocol/facets/ConfigHandlerFacet.sol#L308


 - [ ] ID-486
Parameter [MockExchangeHandlerFacet.revokeVoucher(uint256)._exchangeId](contracts/mock/MockExchangeHandlerFacet.sol#L134) is not in mixedCase

contracts/mock/MockExchangeHandlerFacet.sol#L134


 - [ ] ID-487
Parameter [ExchangeHandlerFacet.burnVoucher(BosonTypes.Exchange)._exchange](contracts/protocol/facets/ExchangeHandlerFacet.sol#L672) is not in mixedCase

contracts/protocol/facets/ExchangeHandlerFacet.sol#L672


 - [ ] ID-488
Parameter [ProtocolInitializationHandlerFacet.initialize(bytes32,address[],bytes[],bool,bytes,bytes4[],bytes4[])._addresses](contracts/protocol/facets/ProtocolInitializationHandlerFacet.sol#L42) is not in mixedCase

contracts/protocol/facets/ProtocolInitializationHandlerFacet.sol#L42


 - [ ] ID-489
Parameter [ConfigHandlerFacet.setTokenAddress(address)._tokenAddress](contracts/protocol/facets/ConfigHandlerFacet.sol#L87) is not in mixedCase

contracts/protocol/facets/ConfigHandlerFacet.sol#L87


 - [ ] ID-490
Parameter [FundsHandlerFacet.withdrawProtocolFees(address[],uint256[])._tokenAmounts](contracts/protocol/facets/FundsHandlerFacet.sol#L146) is not in mixedCase

contracts/protocol/facets/FundsHandlerFacet.sol#L146


 - [ ] ID-491
Parameter [MockExchangeHandlerFacet.burnVoucher(BosonTypes.Exchange)._exchange](contracts/mock/MockExchangeHandlerFacet.sol#L360) is not in mixedCase

contracts/mock/MockExchangeHandlerFacet.sol#L360


 - [ ] ID-492
Parameter [ExchangeHandlerFacet.onVoucherTransferred(uint256,address)._newBuyer](contracts/protocol/facets/ExchangeHandlerFacet.sol#L496) is not in mixedCase

contracts/protocol/facets/ExchangeHandlerFacet.sol#L496


 - [ ] ID-493
Parameter [ProtocolBase.getSellerIdByOperator(address)._operator](contracts/protocol/bases/ProtocolBase.sol#L122) is not in mixedCase

contracts/protocol/bases/ProtocolBase.sol#L122


 - [ ] ID-494
Parameter [ClientExternalAddressesBase.setImplementation(address)._impl](contracts/protocol/bases/ClientExternalAddressesBase.sol#L72) is not in mixedCase

contracts/protocol/bases/ClientExternalAddressesBase.sol#L72


 - [ ] ID-495
Parameter [ExchangeHandlerFacet.revokeVoucher(uint256)._exchangeId](contracts/protocol/facets/ExchangeHandlerFacet.sol#L309) is not in mixedCase

contracts/protocol/facets/ExchangeHandlerFacet.sol#L309


 - [ ] ID-496
Parameter [BosonVoucherBase.setRoyaltyPercentage(uint256)._newRoyaltyPercentage](contracts/protocol/clients/voucher/BosonVoucher.sol#L574) is not in mixedCase

contracts/protocol/clients/voucher/BosonVoucher.sol#L574


 - [ ] ID-497
Parameter [OrchestrationHandlerFacet1.createSellerAndPremintedOfferWithConditionAndTwinAndBundle(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Condition,BosonTypes.Twin,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._voucherInitValues](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1229) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1229


 - [ ] ID-498
Parameter [OfferHandlerFacet.voidOfferBatch(uint256[])._offerIds](contracts/protocol/facets/OfferHandlerFacet.sol#L190) is not in mixedCase

contracts/protocol/facets/OfferHandlerFacet.sol#L190


 - [ ] ID-499
Parameter [DisputeResolverHandlerFacet.addSellersToAllowList(uint256,uint256[])._sellerAllowList](contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L563) is not in mixedCase

contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L563


 - [ ] ID-500
Parameter [ConfigHandlerFacet.initialize(ProtocolLib.ProtocolAddresses,ProtocolLib.ProtocolLimits,ProtocolLib.ProtocolFees)._addresses](contracts/protocol/facets/ConfigHandlerFacet.sol#L27) is not in mixedCase

contracts/protocol/facets/ConfigHandlerFacet.sol#L27


 - [ ] ID-501
Parameter [OrchestrationHandlerFacet1.createPremintedOfferWithConditionAndTwinAndBundle(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Condition,BosonTypes.Twin,uint256)._offer](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L672) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L672


 - [ ] ID-502
Variable [ContextUpgradeable.__gap](node_modules/@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol#L36) is not in mixedCase

node_modules/@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol#L36


 - [ ] ID-503
Parameter [ExchangeHandlerFacet.finalizeExchange(BosonTypes.Exchange,BosonTypes.ExchangeState)._exchange](contracts/protocol/facets/ExchangeHandlerFacet.sol#L626) is not in mixedCase

contracts/protocol/facets/ExchangeHandlerFacet.sol#L626


 - [ ] ID-504
Parameter [OrchestrationHandlerFacet1.createSellerAndPremintedOfferAndTwinWithBundle(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Twin,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._offerDates](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1022) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1022


 - [ ] ID-505
Parameter [OrchestrationHandlerFacet1.createSellerAndOfferWithCondition(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.Condition,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._offerDates](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L757) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L757


 - [ ] ID-506
Parameter [GroupHandlerFacet.setGroupCondition(uint256,BosonTypes.Condition)._condition](contracts/protocol/facets/GroupHandlerFacet.sol#L158) is not in mixedCase

contracts/protocol/facets/GroupHandlerFacet.sol#L158


 - [ ] ID-507
Parameter [MetaTransactionsHandlerFacet.executeMetaTransaction(address,string,bytes,uint256,bytes32,bytes32,uint8)._functionName](contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L289) is not in mixedCase

contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L289


 - [ ] ID-508
Parameter [Foreign20.mint(address,uint256)._amount](contracts/mock/Foreign20.sol#L45) is not in mixedCase

contracts/mock/Foreign20.sol#L45


 - [ ] ID-509
Parameter [ProtocolBase.fetchOfferDurations(uint256)._offerId](contracts/protocol/bases/ProtocolBase.sol#L403) is not in mixedCase

contracts/protocol/bases/ProtocolBase.sol#L403


 - [ ] ID-510
Parameter [OrchestrationHandlerFacet1.createSellerAndOfferWithCondition(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.Condition,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._condition](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L760) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L760


 - [ ] ID-511
Parameter [OrchestrationHandlerFacet1.createSellerAndOfferAndTwinWithBundle(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.Twin,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._offer](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L932) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L932


 - [ ] ID-512
Parameter [ConfigHandlerFacet.setMaxTwinsPerBundle(uint16)._maxTwinsPerBundle](contracts/protocol/facets/ConfigHandlerFacet.sol#L280) is not in mixedCase

contracts/protocol/facets/ConfigHandlerFacet.sol#L280


 - [ ] ID-513
Parameter [SnapshotGate.commitToGatedOffer(address,uint256,uint256)._buyer](contracts/example/SnapshotGate/SnapshotGate.sol#L212) is not in mixedCase

contracts/example/SnapshotGate/SnapshotGate.sol#L212


 - [ ] ID-514
Parameter [OrchestrationHandlerFacet1.createOfferWithCondition(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.Condition,uint256)._offerDurations](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L223) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L223


 - [ ] ID-515
Parameter [OrchestrationHandlerFacet1.createOfferWithCondition(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.Condition,uint256)._offerDates](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L222) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L222


 - [ ] ID-516
Parameter [OrchestrationHandlerFacet1.createOfferWithConditionAndTwinAndBundle(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.Condition,BosonTypes.Twin,uint256)._offerDates](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L601) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L601


 - [ ] ID-517
Parameter [EIP712Lib.verify(address,bytes32,bytes32,bytes32,uint8)._hashedMetaTx](contracts/protocol/libs/EIP712Lib.sol#L51) is not in mixedCase

contracts/protocol/libs/EIP712Lib.sol#L51


 - [ ] ID-518
Parameter [OrchestrationHandlerFacet1.createPremintedOfferAndTwinWithBundle(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Twin,uint256)._twin](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L540) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L540


 - [ ] ID-519
Parameter [FundsLib.decreaseAvailableFunds(uint256,address,uint256)._amount](contracts/protocol/libs/FundsLib.sol#L337) is not in mixedCase

contracts/protocol/libs/FundsLib.sol#L337


 - [ ] ID-520
Parameter [DisputeHandlerFacet.expireDispute(uint256)._exchangeId](contracts/protocol/facets/DisputeHandlerFacet.sol#L166) is not in mixedCase

contracts/protocol/facets/DisputeHandlerFacet.sol#L166


 - [ ] ID-521
Parameter [Foreign20Malicious2.setMetaTxBytes(address,bytes,bytes32,bytes32,uint8)._attacker](contracts/mock/Foreign20.sol#L135) is not in mixedCase

contracts/mock/Foreign20.sol#L135


 - [ ] ID-522
Parameter [ExchangeHandlerFacet.transferTwins(BosonTypes.Exchange,BosonTypes.Voucher)._voucher](contracts/protocol/facets/ExchangeHandlerFacet.sol#L696) is not in mixedCase

contracts/protocol/facets/ExchangeHandlerFacet.sol#L696


 - [ ] ID-523
Parameter [BundleHandlerFacet.getBundle(uint256)._bundleId](contracts/protocol/facets/BundleHandlerFacet.sol#L57) is not in mixedCase

contracts/protocol/facets/BundleHandlerFacet.sol#L57


 - [ ] ID-524
Parameter [JewelerLib.diamondCut(IDiamondCut.FacetCut[],address,bytes)._init](contracts/diamond/JewelerLib.sol#L45) is not in mixedCase

contracts/diamond/JewelerLib.sol#L45


 - [ ] ID-525
Parameter [DisputeResolverHandlerFacet.createDisputeResolver(BosonTypes.DisputeResolver,BosonTypes.DisputeResolverFee[],uint256[])._sellerAllowList](contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L50) is not in mixedCase

contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L50


 - [ ] ID-526
Parameter [FundsLib.increaseAvailableFunds(uint256,address,uint256)._tokenAddress](contracts/protocol/libs/FundsLib.sol#L306) is not in mixedCase

contracts/protocol/libs/FundsLib.sol#L306


 - [ ] ID-527
Parameter [GroupBase.storeCondition(uint256,BosonTypes.Condition)._groupId](contracts/protocol/bases/GroupBase.sol#L86) is not in mixedCase

contracts/protocol/bases/GroupBase.sol#L86


 - [ ] ID-528
Parameter [ExchangeHandlerFacet.expireVoucher(uint256)._exchangeId](contracts/protocol/facets/ExchangeHandlerFacet.sol#L369) is not in mixedCase

contracts/protocol/facets/ExchangeHandlerFacet.sol#L369


 - [ ] ID-529
Parameter [MockExchangeHandlerFacet.extendVoucher(uint256,uint256)._validUntilDate](contracts/mock/MockExchangeHandlerFacet.sol#L226) is not in mixedCase

contracts/mock/MockExchangeHandlerFacet.sol#L226


 - [ ] ID-530
Parameter [OfferHandlerFacet.createOfferBatch(BosonTypes.Offer[],BosonTypes.OfferDates[],BosonTypes.OfferDurations[],uint256[],uint256[])._agentIds](contracts/protocol/facets/OfferHandlerFacet.sol#L107) is not in mixedCase

contracts/protocol/facets/OfferHandlerFacet.sol#L107


 - [ ] ID-531
Parameter [ExchangeHandlerFacet.getReceipt(uint256)._exchangeId](contracts/protocol/facets/ExchangeHandlerFacet.sol#L961) is not in mixedCase

contracts/protocol/facets/ExchangeHandlerFacet.sol#L961


 - [ ] ID-532
Parameter [ConfigHandlerFacet.getAuthTokenContract(BosonTypes.AuthTokenType)._authTokenType](contracts/protocol/facets/ConfigHandlerFacet.sol#L654) is not in mixedCase

contracts/protocol/facets/ConfigHandlerFacet.sol#L654


 - [ ] ID-533
Parameter [OrchestrationHandlerFacet1.createTwinAndBundleAfterOffer(BosonTypes.Twin,uint256,uint256)._sellerId](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1270) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1270


 - [ ] ID-534
Parameter [ConfigHandlerFacet.checkNonZero(uint256)._value](contracts/protocol/facets/ConfigHandlerFacet.sol#L793) is not in mixedCase

contracts/protocol/facets/ConfigHandlerFacet.sol#L793


 - [ ] ID-535
Parameter [MockExchangeHandlerFacetWithDefect.cancelVoucher(uint256)._exchangeId](contracts/mock/MockExchangeHandlerFacet.sol#L512) is not in mixedCase

contracts/mock/MockExchangeHandlerFacet.sol#L512


 - [ ] ID-536
Variable [ERC721Upgradeable.__gap](node_modules/@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol#L465) is not in mixedCase

node_modules/@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol#L465


 - [ ] ID-537
Parameter [ProtocolBase.fetchGroup(uint256)._groupId](contracts/protocol/bases/ProtocolBase.sol#L434) is not in mixedCase

contracts/protocol/bases/ProtocolBase.sol#L434


 - [ ] ID-538
Parameter [FundsHandlerFacet.withdrawFundsInternal(address,uint256,address[],uint256[])._tokenAmounts](contracts/protocol/facets/FundsHandlerFacet.sol#L219) is not in mixedCase

contracts/protocol/facets/FundsHandlerFacet.sol#L219


 - [ ] ID-539
Parameter [OfferHandlerFacet.extendOfferBatch(uint256[],uint256)._offerIds](contracts/protocol/facets/OfferHandlerFacet.sol#L252) is not in mixedCase

contracts/protocol/facets/OfferHandlerFacet.sol#L252


 - [ ] ID-540
Parameter [OrchestrationHandlerFacet1.createSellerAndPremintedOfferWithCondition(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Condition,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._offerDates](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L838) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L838


 - [ ] ID-541
Parameter [OfferHandlerFacet.createOfferBatch(BosonTypes.Offer[],BosonTypes.OfferDates[],BosonTypes.OfferDurations[],uint256[],uint256[])._disputeResolverIds](contracts/protocol/facets/OfferHandlerFacet.sol#L106) is not in mixedCase

contracts/protocol/facets/OfferHandlerFacet.sol#L106


 - [ ] ID-542
Parameter [Foreign20.mint(address,uint256)._account](contracts/mock/Foreign20.sol#L45) is not in mixedCase

contracts/mock/Foreign20.sol#L45


 - [ ] ID-543
Parameter [OfferHandlerFacet.reserveRange(uint256,uint256)._offerId](contracts/protocol/facets/OfferHandlerFacet.sol#L144) is not in mixedCase

contracts/protocol/facets/OfferHandlerFacet.sol#L144


 - [ ] ID-544
Parameter [MockExchangeHandlerFacet.transferTwins(BosonTypes.Exchange,BosonTypes.Voucher)._exchange](contracts/mock/MockExchangeHandlerFacet.sol#L381) is not in mixedCase

contracts/mock/MockExchangeHandlerFacet.sol#L381


 - [ ] ID-545
Parameter [DisputeResolverHandlerFacet.fetchDisputeResolverPendingUpdate(uint256)._disputeResolverId](contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L861) is not in mixedCase

contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L861


 - [ ] ID-546
Parameter [DisputeResolverHandlerFacet.removeFeesFromDisputeResolver(uint256,address[])._disputeResolverId](contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L489) is not in mixedCase

contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L489


 - [ ] ID-547
Variable [BosonVoucher.__gap](contracts/protocol/clients/voucher/BosonVoucher.sol#L781) is not in mixedCase

contracts/protocol/clients/voucher/BosonVoucher.sol#L781


 - [ ] ID-548
Parameter [OfferHandlerFacet.extendOffer(uint256,uint256)._offerId](contracts/protocol/facets/OfferHandlerFacet.sol#L213) is not in mixedCase

contracts/protocol/facets/OfferHandlerFacet.sol#L213


 - [ ] ID-549
Parameter [DisputeHandlerFacet.decideDispute(uint256,uint256)._buyerPercent](contracts/protocol/facets/DisputeHandlerFacet.sol#L345) is not in mixedCase

contracts/protocol/facets/DisputeHandlerFacet.sol#L345


 - [ ] ID-550
Parameter [ProtocolBase.fetchVoucher(uint256)._exchangeId](contracts/protocol/bases/ProtocolBase.sol#L474) is not in mixedCase

contracts/protocol/bases/ProtocolBase.sol#L474


 - [ ] ID-551
Parameter [MockExchangeHandlerFacet.cancelVoucher(uint256)._exchangeId](contracts/mock/MockExchangeHandlerFacet.sol#L167) is not in mixedCase

contracts/mock/MockExchangeHandlerFacet.sol#L167


 - [ ] ID-552
Parameter [WithoutFallbackError.withdrawFunds(address,uint256,address[],uint256[])._tokenAmounts](contracts/mock/FallbackError.sol#L24) is not in mixedCase

contracts/mock/FallbackError.sol#L24


 - [ ] ID-553
Parameter [OrchestrationHandlerFacet1.createPremintedOfferWithConditionAndTwinAndBundle(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Condition,BosonTypes.Twin,uint256)._condition](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L677) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L677


 - [ ] ID-554
Parameter [DisputeHandlerFacet.refuseEscalatedDispute(uint256)._exchangeId](contracts/protocol/facets/DisputeHandlerFacet.sol#L376) is not in mixedCase

contracts/protocol/facets/DisputeHandlerFacet.sol#L376


 - [ ] ID-555
Parameter [OrchestrationHandlerFacet1.createSellerAndPremintedOfferWithConditionAndTwinAndBundle(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Condition,BosonTypes.Twin,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._offerDates](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1222) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1222


 - [ ] ID-556
Parameter [MetaTransactionsHandlerFacet.setCurrentSenderAddress(address)._signerAddress](contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L221) is not in mixedCase

contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L221


 - [ ] ID-557
Parameter [FundsLib.decreaseAvailableFunds(uint256,address,uint256)._entityId](contracts/protocol/libs/FundsLib.sol#L335) is not in mixedCase

contracts/protocol/libs/FundsLib.sol#L335


 - [ ] ID-558
Parameter [OfferHandlerFacet.createOfferBatch(BosonTypes.Offer[],BosonTypes.OfferDates[],BosonTypes.OfferDurations[],uint256[],uint256[])._offers](contracts/protocol/facets/OfferHandlerFacet.sol#L103) is not in mixedCase

contracts/protocol/facets/OfferHandlerFacet.sol#L103


 - [ ] ID-559
Parameter [ExchangeHandlerFacet.onVoucherTransferred(uint256,address)._exchangeId](contracts/protocol/facets/ExchangeHandlerFacet.sol#L496) is not in mixedCase

contracts/protocol/facets/ExchangeHandlerFacet.sol#L496


 - [ ] ID-560
Parameter [ConfigHandlerFacet.setBeaconProxyAddress(address)._beaconProxyAddress](contracts/protocol/facets/ConfigHandlerFacet.sol#L165) is not in mixedCase

contracts/protocol/facets/ConfigHandlerFacet.sol#L165


 - [ ] ID-561
Parameter [ProtocolInitializationHandlerFacet.initV2_2_0(bytes)._initializationData](contracts/protocol/facets/ProtocolInitializationHandlerFacet.sol#L89) is not in mixedCase

contracts/protocol/facets/ProtocolInitializationHandlerFacet.sol#L89


 - [ ] ID-562
Parameter [ExchangeHandlerFacet.cancelVoucher(uint256)._exchangeId](contracts/protocol/facets/ExchangeHandlerFacet.sol#L342) is not in mixedCase

contracts/protocol/facets/ExchangeHandlerFacet.sol#L342


 - [ ] ID-563
Parameter [GroupHandlerFacet.createGroup(BosonTypes.Group,BosonTypes.Condition)._condition](contracts/protocol/facets/GroupHandlerFacet.sol#L39) is not in mixedCase

contracts/protocol/facets/GroupHandlerFacet.sol#L39


 - [ ] ID-564
Parameter [BosonVoucherBase.reserveRange(uint256,uint256,uint256)._start](contracts/protocol/clients/voucher/BosonVoucher.sol#L162) is not in mixedCase

contracts/protocol/clients/voucher/BosonVoucher.sol#L162


 - [ ] ID-565
Parameter [FundsHandlerFacet.withdrawFundsInternal(address,uint256,address[],uint256[])._destinationAddress](contracts/protocol/facets/FundsHandlerFacet.sol#L216) is not in mixedCase

contracts/protocol/facets/FundsHandlerFacet.sol#L216


 - [ ] ID-566
Parameter [OrchestrationHandlerFacet1.createSellerAndPremintedOfferWithConditionAndTwinAndBundle(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Condition,BosonTypes.Twin,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._reservedRangeLength](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1225) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1225


 - [ ] ID-567
Parameter [DiamondLib.supportsInterface(bytes4)._interfaceId](contracts/diamond/DiamondLib.sol#L91) is not in mixedCase

contracts/diamond/DiamondLib.sol#L91


 - [ ] ID-568
Parameter [EIP712Lib.verify(address,bytes32,bytes32,bytes32,uint8)._user](contracts/protocol/libs/EIP712Lib.sol#L50) is not in mixedCase

contracts/protocol/libs/EIP712Lib.sol#L50


 - [ ] ID-569
Parameter [ExchangeHandlerFacet.getValidBuyer(address)._buyer](contracts/protocol/facets/ExchangeHandlerFacet.sol#L827) is not in mixedCase

contracts/protocol/facets/ExchangeHandlerFacet.sol#L827


 - [ ] ID-570
Function [OwnableUpgradeable.__Ownable_init()](node_modules/@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol#L29-L31) is not in mixedCase

node_modules/@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol#L29-L31


 - [ ] ID-571
Parameter [OrchestrationHandlerFacet1.createPremintedOfferAddToGroup(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,uint256,uint256)._reservedRangeLength](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L412) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L412


 - [ ] ID-572
Parameter [OrchestrationHandlerFacet1.createOfferWithCondition(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.Condition,uint256)._condition](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L225) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L225


 - [ ] ID-573
Parameter [OrchestrationHandlerFacet1.createSellerAndOfferAndTwinWithBundle(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.Twin,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._offerDates](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L933) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L933


 - [ ] ID-574
Parameter [ExchangeHandlerFacet.commitToOfferInternal(address,BosonTypes.Offer,uint256,bool)._isPreminted](contracts/protocol/facets/ExchangeHandlerFacet.sol#L154) is not in mixedCase

contracts/protocol/facets/ExchangeHandlerFacet.sol#L154


 - [ ] ID-575
Parameter [OrchestrationHandlerFacet1.createSellerAndPremintedOffer(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._authToken](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L165) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L165


 - [ ] ID-576
Parameter [ConfigHandlerFacet.setBuyerEscalationDepositPercentage(uint256)._buyerEscalationDepositPercentage](contracts/protocol/facets/ConfigHandlerFacet.sol#L593) is not in mixedCase

contracts/protocol/facets/ConfigHandlerFacet.sol#L593


 - [ ] ID-577
Parameter [OrchestrationHandlerFacet1.createSellerAndOfferWithConditionAndTwinAndBundle(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.Condition,BosonTypes.Twin,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._agentId](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1127) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1127


 - [ ] ID-578
Parameter [DisputeHandlerFacet.isDisputeFinalized(uint256)._exchangeId](contracts/protocol/facets/DisputeHandlerFacet.sol#L517) is not in mixedCase

contracts/protocol/facets/DisputeHandlerFacet.sol#L517


 - [ ] ID-579
Parameter [ProtocolInitializationHandlerFacet.removeInterfaces(bytes4[])._interfaces](contracts/protocol/facets/ProtocolInitializationHandlerFacet.sol#L115) is not in mixedCase

contracts/protocol/facets/ProtocolInitializationHandlerFacet.sol#L115


 - [ ] ID-580
Parameter [DisputeBase.raiseDisputeInternal(BosonTypes.Exchange,BosonTypes.Voucher,uint256)._sellerId](contracts/protocol/bases/DisputeBase.sol#L32) is not in mixedCase

contracts/protocol/bases/DisputeBase.sol#L32


 - [ ] ID-581
Parameter [OrchestrationHandlerFacet1.createSellerAndPremintedOfferAndTwinWithBundle(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Twin,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._seller](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1020) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1020


 - [ ] ID-582
Parameter [GroupHandlerFacet.setGroupCondition(uint256,BosonTypes.Condition)._groupId](contracts/protocol/facets/GroupHandlerFacet.sol#L158) is not in mixedCase

contracts/protocol/facets/GroupHandlerFacet.sol#L158


 - [ ] ID-583
Parameter [SellerBase.createSellerInternal(BosonTypes.Seller,BosonTypes.AuthToken,BosonTypes.VoucherInitValues)._seller](contracts/protocol/bases/SellerBase.sol#L40) is not in mixedCase

contracts/protocol/bases/SellerBase.sol#L40


 - [ ] ID-584
Parameter [Foreign721.mint(uint256,uint256)._supply](contracts/mock/Foreign721.sol#L20) is not in mixedCase

contracts/mock/Foreign721.sol#L20


 - [ ] ID-585
Parameter [OrchestrationHandlerFacet1.createPremintedOfferWithCondition(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Condition,uint256)._condition](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L294) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L294


 - [ ] ID-586
Parameter [ConfigHandlerFacet.initialize(ProtocolLib.ProtocolAddresses,ProtocolLib.ProtocolLimits,ProtocolLib.ProtocolFees)._fees](contracts/protocol/facets/ConfigHandlerFacet.sol#L29) is not in mixedCase

contracts/protocol/facets/ConfigHandlerFacet.sol#L29


 - [ ] ID-587
Parameter [GroupBase.createGroupInternal(BosonTypes.Group,BosonTypes.Condition)._group](contracts/protocol/bases/GroupBase.sol#L30) is not in mixedCase

contracts/protocol/bases/GroupBase.sol#L30


 - [ ] ID-588
Parameter [OrchestrationHandlerFacet1.createSellerAndPremintedOfferWithConditionAndTwinAndBundle(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Condition,BosonTypes.Twin,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._agentId](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1230) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1230


 - [ ] ID-589
Parameter [FundsLib.transferFundsToProtocol(address,uint256)._amount](contracts/protocol/libs/FundsLib.sol#L243) is not in mixedCase

contracts/protocol/libs/FundsLib.sol#L243


 - [ ] ID-590
Parameter [FundsLib.encumberFunds(uint256,uint256,bool)._offerId](contracts/protocol/libs/FundsLib.sol#L66) is not in mixedCase

contracts/protocol/libs/FundsLib.sol#L66


 - [ ] ID-591
Parameter [MetaTransactionsHandlerFacet.executeMetaTransaction(address,string,bytes,uint256,bytes32,bytes32,uint8)._nonce](contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L291) is not in mixedCase

contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L291


 - [ ] ID-592
Parameter [ConfigHandlerFacet.setMaxTotalOfferFeePercentage(uint16)._maxTotalOfferFeePercentage](contracts/protocol/facets/ConfigHandlerFacet.sol#L487) is not in mixedCase

contracts/protocol/facets/ConfigHandlerFacet.sol#L487


 - [ ] ID-593
Parameter [OrchestrationHandlerFacet1.createSellerAndPremintedOfferWithCondition(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Condition,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._authToken](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L843) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L843


 - [ ] ID-594
Parameter [OrchestrationHandlerFacet1.createOfferAndTwinWithBundle(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.Twin,uint256)._twin](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L471) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L471


 - [ ] ID-595
Parameter [GroupBase.addOffersToGroupInternal(uint256,uint256[])._offerIds](contracts/protocol/bases/GroupBase.sol#L142) is not in mixedCase

contracts/protocol/bases/GroupBase.sol#L142


 - [ ] ID-596
Parameter [BosonVoucherBase.getRangeByOfferId(uint256)._offerId](contracts/protocol/clients/voucher/BosonVoucher.sol#L350) is not in mixedCase

contracts/protocol/clients/voucher/BosonVoucher.sol#L350


 - [ ] ID-597
Parameter [ConfigHandlerFacet.setVoucherBeaconAddress(address)._voucherBeaconAddress](contracts/protocol/facets/ConfigHandlerFacet.sol#L139) is not in mixedCase

contracts/protocol/facets/ConfigHandlerFacet.sol#L139


 - [ ] ID-598
Parameter [OfferHandlerFacet.voidOffer(uint256)._offerId](contracts/protocol/facets/OfferHandlerFacet.sol#L163) is not in mixedCase

contracts/protocol/facets/OfferHandlerFacet.sol#L163


 - [ ] ID-599
Parameter [JewelerLib.addReplaceRemoveFacetSelectors(uint256,bytes32,address,IDiamondCut.FacetCutAction,bytes4[])._newFacetAddress](contracts/diamond/JewelerLib.sol#L113) is not in mixedCase

contracts/diamond/JewelerLib.sol#L113


 - [ ] ID-600
Parameter [OrchestrationHandlerFacet1.createSellerAndOfferWithConditionAndTwinAndBundle(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.Condition,BosonTypes.Twin,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._offer](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1119) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1119


 - [ ] ID-601
Parameter [ConfigHandlerFacet.setAccessControllerAddress(address)._accessControllerAddress](contracts/protocol/facets/ConfigHandlerFacet.sol#L773) is not in mixedCase

contracts/protocol/facets/ConfigHandlerFacet.sol#L773


 - [ ] ID-602
Parameter [DisputeHandlerFacet.disputeResolverChecks(uint256)._exchangeId](contracts/protocol/facets/DisputeHandlerFacet.sol#L545) is not in mixedCase

contracts/protocol/facets/DisputeHandlerFacet.sol#L545


 - [ ] ID-603
Parameter [OrchestrationHandlerFacet1.createOfferWithConditionAndTwinAndBundle(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.Condition,BosonTypes.Twin,uint256)._disputeResolverId](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L603) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L603


 - [ ] ID-604
Variable [OwnableUpgradeable.__gap](node_modules/@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol#L94) is not in mixedCase

node_modules/@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol#L94


 - [ ] ID-605
Parameter [MockExchangeHandlerFacet.finalizeExchange(BosonTypes.Exchange,BosonTypes.ExchangeState)._targetState](contracts/mock/MockExchangeHandlerFacet.sol#L314) is not in mixedCase

contracts/mock/MockExchangeHandlerFacet.sol#L314


 - [ ] ID-606
Parameter [OrchestrationHandlerFacet1.createSellerAndOfferWithCondition(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.Condition,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._voucherInitValues](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L762) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L762


 - [ ] ID-607
Parameter [OrchestrationHandlerFacet1.createPremintedOfferAndTwinWithBundle(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Twin,uint256)._agentId](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L541) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L541


 - [ ] ID-608
Function [ERC721Upgradeable.__ERC721_init_unchained(string,string)](node_modules/@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol#L49-L52) is not in mixedCase

node_modules/@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol#L49-L52


 - [ ] ID-609
Parameter [OrchestrationHandlerFacet1.createOfferAddToGroup(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,uint256)._offerDurations](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L345) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L345


 - [ ] ID-610
Parameter [MetaTransactionsHandlerFacet.executeMetaTransaction(address,string,bytes,uint256,bytes32,bytes32,uint8)._functionSignature](contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L290) is not in mixedCase

contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L290


 - [ ] ID-611
Parameter [OrchestrationHandlerFacet1.createSellerAndOfferAndTwinWithBundle(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.Twin,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._twin](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L936) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L936


 - [ ] ID-612
Parameter [BosonVoucherBase.transferFrom(address,address,uint256)._from](contracts/protocol/clients/voucher/BosonVoucher.sol#L393) is not in mixedCase

contracts/protocol/clients/voucher/BosonVoucher.sol#L393


 - [ ] ID-613
Parameter [FundsHandlerFacet.depositFunds(uint256,address,uint256)._tokenAddress](contracts/protocol/facets/FundsHandlerFacet.sol#L48) is not in mixedCase

contracts/protocol/facets/FundsHandlerFacet.sol#L48


 - [ ] ID-614
Parameter [GroupBase.preUpdateChecks(uint256,uint256[])._offerIds](contracts/protocol/bases/GroupBase.sol#L194) is not in mixedCase

contracts/protocol/bases/GroupBase.sol#L194


 - [ ] ID-615
Parameter [OfferHandlerFacet.createOffer(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256)._offer](contracts/protocol/facets/OfferHandlerFacet.sol#L57) is not in mixedCase

contracts/protocol/facets/OfferHandlerFacet.sol#L57


 - [ ] ID-616
Parameter [OfferHandlerFacet.getOffer(uint256)._offerId](contracts/protocol/facets/OfferHandlerFacet.sol#L271) is not in mixedCase

contracts/protocol/facets/OfferHandlerFacet.sol#L271


 - [ ] ID-617
Parameter [FundsLib.transferFundsFromProtocol(uint256,address,address,uint256)._tokenAddress](contracts/protocol/libs/FundsLib.sol#L276) is not in mixedCase

contracts/protocol/libs/FundsLib.sol#L276


 - [ ] ID-618
Parameter [MetaTransactionsHandlerFacet.executeTx(address,string,bytes,uint256)._functionName](contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L238) is not in mixedCase

contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L238


 - [ ] ID-619
Parameter [SellerHandlerFacet.preUpdateSellerCheck(uint256,address,ProtocolLib.ProtocolLookups)._lookups](contracts/protocol/facets/SellerHandlerFacet.sol#L435) is not in mixedCase

contracts/protocol/facets/SellerHandlerFacet.sol#L435


 - [ ] ID-620
Parameter [OrchestrationHandlerFacet1.createPremintedOfferAndTwinWithBundle(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Twin,uint256)._reservedRangeLength](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L539) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L539


 - [ ] ID-621
Parameter [FundsLib.transferFundsFromProtocol(uint256,address,address,uint256)._to](contracts/protocol/libs/FundsLib.sol#L277) is not in mixedCase

contracts/protocol/libs/FundsLib.sol#L277


 - [ ] ID-622
Parameter [FundsLib.transferFundsFromProtocol(uint256,address,address,uint256)._entityId](contracts/protocol/libs/FundsLib.sol#L275) is not in mixedCase

contracts/protocol/libs/FundsLib.sol#L275


 - [ ] ID-623
Parameter [OrchestrationHandlerFacet1.createSellerAndOffer(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._seller](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L84) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L84


 - [ ] ID-624
Parameter [BosonVoucherBase.supportsInterface(bytes4)._interfaceId](contracts/protocol/clients/voucher/BosonVoucher.sol#L445) is not in mixedCase

contracts/protocol/clients/voucher/BosonVoucher.sol#L445


 - [ ] ID-625
Parameter [OrchestrationHandlerFacet1.createSellerAndOfferWithConditionAndTwinAndBundle(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.Condition,BosonTypes.Twin,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._condition](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1123) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1123


 - [ ] ID-626
Parameter [OrchestrationHandlerFacet1.createSellerAndPremintedOfferWithConditionAndTwinAndBundle(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Condition,BosonTypes.Twin,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._disputeResolverId](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1224) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1224


 - [ ] ID-627
Parameter [Foreign20Malicious2.setMetaTxBytes(address,bytes,bytes32,bytes32,uint8)._sigR](contracts/mock/Foreign20.sol#L137) is not in mixedCase

contracts/mock/Foreign20.sol#L137


 - [ ] ID-628
Parameter [BuyerHandlerFacet.getBuyer(uint256)._buyerId](contracts/protocol/facets/BuyerHandlerFacet.sol#L107) is not in mixedCase

contracts/protocol/facets/BuyerHandlerFacet.sol#L107


 - [ ] ID-629
Parameter [ConfigHandlerFacet.setMaxExchangesPerBatch(uint16)._maxExchangesPerBatch](contracts/protocol/facets/ConfigHandlerFacet.sol#L669) is not in mixedCase

contracts/protocol/facets/ConfigHandlerFacet.sol#L669


 - [ ] ID-630
Parameter [OrchestrationHandlerFacet1.createOfferWithConditionAndTwinAndBundle(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.Condition,BosonTypes.Twin,uint256)._offer](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L600) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L600


 - [ ] ID-631
Parameter [BosonVoucherBase.initializeVoucher(uint256,address,BosonTypes.VoucherInitValues)._sellerId](contracts/protocol/clients/voucher/BosonVoucher.sol#L85) is not in mixedCase

contracts/protocol/clients/voucher/BosonVoucher.sol#L85


 - [ ] ID-632
Parameter [BuyerBase.createBuyerInternal(BosonTypes.Buyer)._buyer](contracts/protocol/bases/BuyerBase.sol#L27) is not in mixedCase

contracts/protocol/bases/BuyerBase.sol#L27


 - [ ] ID-633
Parameter [MetaTransactionsHandlerFacet.hashOfferDetails(bytes)._offerDetails](contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L110) is not in mixedCase

contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L110


 - [ ] ID-634
Parameter [ProtocolBase.fetchBuyer(uint256)._buyerId](contracts/protocol/bases/ProtocolBase.sol#L318) is not in mixedCase

contracts/protocol/bases/ProtocolBase.sol#L318


 - [ ] ID-635
Parameter [BosonVoucherBase.silentMint(address,uint256)._from](contracts/protocol/clients/voucher/BosonVoucher.sol#L744) is not in mixedCase

contracts/protocol/clients/voucher/BosonVoucher.sol#L744


 - [ ] ID-636
Parameter [DisputeHandlerFacet.getDisputeTimeout(uint256)._exchangeId](contracts/protocol/facets/DisputeHandlerFacet.sol#L501) is not in mixedCase

contracts/protocol/facets/DisputeHandlerFacet.sol#L501


 - [ ] ID-637
Parameter [MetaTransactionsHandlerFacet.setAllowlistedFunctions(bytes32[],bool)._functionNameHashes](contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L331) is not in mixedCase

contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L331


 - [ ] ID-638
Parameter [MockMetaTransactionsHandlerFacet.setAsMetaTransactionAndCurrentSenderAs(address)._signerAddress](contracts/mock/MockMetaTransactionsHandlerFacet.sol#L17) is not in mixedCase

contracts/mock/MockMetaTransactionsHandlerFacet.sol#L17


 - [ ] ID-639
Parameter [ProtocolBase.fetchDispute(uint256)._exchangeId](contracts/protocol/bases/ProtocolBase.sol#L486) is not in mixedCase

contracts/protocol/bases/ProtocolBase.sol#L486


 - [ ] ID-640
Parameter [FundsLib.increaseAvailableFunds(uint256,address,uint256)._amount](contracts/protocol/libs/FundsLib.sol#L307) is not in mixedCase

contracts/protocol/libs/FundsLib.sol#L307


 - [ ] ID-641
Parameter [OfferBase.storeOffer(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256)._offerDates](contracts/protocol/bases/OfferBase.sol#L110) is not in mixedCase

contracts/protocol/bases/OfferBase.sol#L110


 - [ ] ID-642
Parameter [OrchestrationHandlerFacet1.createSellerAndOfferWithCondition(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.Condition,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._agentId](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L763) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L763


 - [ ] ID-643
Parameter [OfferHandlerFacet.createOffer(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256)._agentId](contracts/protocol/facets/OfferHandlerFacet.sol#L61) is not in mixedCase

contracts/protocol/facets/OfferHandlerFacet.sol#L61


 - [ ] ID-644
Parameter [OrchestrationHandlerFacet1.createSellerAndOfferWithConditionAndTwinAndBundle(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.Condition,BosonTypes.Twin,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._authToken](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1125) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1125


 - [ ] ID-645
Parameter [DisputeResolverHandlerFacet.areSellersAllowed(uint256,uint256[])._disputeResolverId](contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L735) is not in mixedCase

contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L735


 - [ ] ID-646
Parameter [BosonVoucherBase.issueVoucher(uint256,address)._exchangeId](contracts/protocol/clients/voucher/BosonVoucher.sol#L117) is not in mixedCase

contracts/protocol/clients/voucher/BosonVoucher.sol#L117


 - [ ] ID-647
Parameter [OrchestrationHandlerFacet1.createSellerAndOffer(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._authToken](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L89) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L89


 - [ ] ID-648
Function [ProtocolInitializationHandlerFacet.initV2_2_0(bytes)](contracts/protocol/facets/ProtocolInitializationHandlerFacet.sol#L89-L98) is not in mixedCase

contracts/protocol/facets/ProtocolInitializationHandlerFacet.sol#L89-L98


 - [ ] ID-649
Parameter [OrchestrationHandlerFacet1.createSellerAndOfferWithConditionAndTwinAndBundle(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.Condition,BosonTypes.Twin,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._seller](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1118) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1118


 - [ ] ID-650
Parameter [OrchestrationHandlerFacet1.createSellerAndPremintedOffer(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._offerDates](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L161) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L161


 - [ ] ID-651
Parameter [JewelerLib.addReplaceRemoveFacetSelectors(uint256,bytes32,address,IDiamondCut.FacetCutAction,bytes4[])._selectors](contracts/diamond/JewelerLib.sol#L115) is not in mixedCase

contracts/diamond/JewelerLib.sol#L115


 - [ ] ID-652
Parameter [DisputeResolverHandlerFacet.removeSellersFromAllowList(uint256,uint256[])._sellerAllowList](contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L609) is not in mixedCase

contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L609


 - [ ] ID-653
Parameter [MockMetaTransactionsHandlerFacet.setCachedChainId(uint256)._chainId](contracts/mock/MockMetaTransactionsHandlerFacet.sol#L27) is not in mixedCase

contracts/mock/MockMetaTransactionsHandlerFacet.sol#L27


 - [ ] ID-654
Parameter [MetaTransactionsHandlerFacet.executeTx(address,string,bytes,uint256)._userAddress](contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L237) is not in mixedCase

contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L237


 - [ ] ID-655
Parameter [OrchestrationHandlerFacet1.createSellerAndOfferWithCondition(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.Condition,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._offer](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L756) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L756


 - [ ] ID-656
Parameter [OrchestrationHandlerFacet1.createOfferWithConditionAndTwinAndBundle(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.Condition,BosonTypes.Twin,uint256)._agentId](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L606) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L606


 - [ ] ID-657
Parameter [Foreign20Malicious.setProtocolAddress(address)._newProtocolAddress](contracts/mock/Foreign20.sol#L92) is not in mixedCase

contracts/mock/Foreign20.sol#L92


 - [ ] ID-658
Parameter [OrchestrationHandlerFacet1.createSellerAndPremintedOfferAndTwinWithBundle(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Twin,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._offer](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1021) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1021


 - [ ] ID-659
Parameter [OrchestrationHandlerFacet1.createSellerAndOfferWithCondition(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.Condition,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._seller](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L755) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L755


 - [ ] ID-660
Parameter [OfferBase.storeOffer(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256)._disputeResolverId](contracts/protocol/bases/OfferBase.sol#L112) is not in mixedCase

contracts/protocol/bases/OfferBase.sol#L112


 - [ ] ID-661
Parameter [BundleHandlerFacet.createBundle(BosonTypes.Bundle)._bundle](contracts/protocol/facets/BundleHandlerFacet.sol#L46) is not in mixedCase

contracts/protocol/facets/BundleHandlerFacet.sol#L46


 - [ ] ID-662
Parameter [EIP712Lib.verify(address,bytes32,bytes32,bytes32,uint8)._sigR](contracts/protocol/libs/EIP712Lib.sol#L52) is not in mixedCase

contracts/protocol/libs/EIP712Lib.sol#L52


 - [ ] ID-663
Parameter [DisputeBase.escalateDisputeInternal(uint256)._exchangeId](contracts/protocol/bases/DisputeBase.sol#L87) is not in mixedCase

contracts/protocol/bases/DisputeBase.sol#L87


 - [ ] ID-664
Parameter [SellerHandlerFacet.preUpdateSellerCheck(uint256,address,ProtocolLib.ProtocolLookups)._role](contracts/protocol/facets/SellerHandlerFacet.sol#L434) is not in mixedCase

contracts/protocol/facets/SellerHandlerFacet.sol#L434


 - [ ] ID-665
Parameter [OrchestrationHandlerFacet1.createPremintedOfferWithCondition(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Condition,uint256)._offerDurations](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L291) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L291


 - [ ] ID-666
Parameter [GroupBase.addOffersToGroupInternal(uint256,uint256[])._groupId](contracts/protocol/bases/GroupBase.sol#L142) is not in mixedCase

contracts/protocol/bases/GroupBase.sol#L142


 - [ ] ID-667
Function [ERC165Upgradeable.__ERC165_init_unchained()](node_modules/@openzeppelin/contracts-upgradeable/utils/introspection/ERC165Upgradeable.sol#L27-L28) is not in mixedCase

node_modules/@openzeppelin/contracts-upgradeable/utils/introspection/ERC165Upgradeable.sol#L27-L28


 - [ ] ID-668
Function [ContextUpgradeable.__Context_init_unchained()](node_modules/@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol#L21-L22) is not in mixedCase

node_modules/@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol#L21-L22


 - [ ] ID-669
Parameter [GroupBase.storeCondition(uint256,BosonTypes.Condition)._condition](contracts/protocol/bases/GroupBase.sol#L86) is not in mixedCase

contracts/protocol/bases/GroupBase.sol#L86


 - [ ] ID-670
Parameter [ERC165Facet.supportsInterface(bytes4)._interfaceId](contracts/diamond/facets/ERC165Facet.sol#L22) is not in mixedCase

contracts/diamond/facets/ERC165Facet.sol#L22


 - [ ] ID-671
Parameter [BeaconClientBase.getBosonSellerByAddress(address)._sellerAddress](contracts/protocol/bases/BeaconClientBase.sol#L105) is not in mixedCase

contracts/protocol/bases/BeaconClientBase.sol#L105


 - [ ] ID-672
Parameter [ProtocolBase.fetchTwinReceipts(uint256)._exchangeId](contracts/protocol/bases/ProtocolBase.sol#L703) is not in mixedCase

contracts/protocol/bases/ProtocolBase.sol#L703


 - [ ] ID-673
Parameter [ProtocolInitializationHandlerFacet.initialize(bytes32,address[],bytes[],bool,bytes,bytes4[],bytes4[])._isUpgrade](contracts/protocol/facets/ProtocolInitializationHandlerFacet.sol#L44) is not in mixedCase

contracts/protocol/facets/ProtocolInitializationHandlerFacet.sol#L44


 - [ ] ID-674
Parameter [OrchestrationHandlerFacet1.createSellerAndOffer(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._offer](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L85) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L85


 - [ ] ID-675
Parameter [MetaTransactionsHandlerFacet.convertBytesToBytes4(bytes)._inBytes](contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L63) is not in mixedCase

contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L63


 - [ ] ID-676
Parameter [FundsLib.transferFundsToProtocol(address,uint256)._tokenAddress](contracts/protocol/libs/FundsLib.sol#L243) is not in mixedCase

contracts/protocol/libs/FundsLib.sol#L243


 - [ ] ID-677
Parameter [DisputeResolverHandlerFacet.removeFeesFromDisputeResolver(uint256,address[])._feeTokenAddresses](contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L489) is not in mixedCase

contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L489


 - [ ] ID-678
Parameter [OrchestrationHandlerFacet1.createSellerAndPremintedOfferWithConditionAndTwinAndBundle(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Condition,BosonTypes.Twin,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._offer](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1221) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1221


 - [ ] ID-679
Parameter [OfferHandlerFacet.extendOffer(uint256,uint256)._validUntilDate](contracts/protocol/facets/OfferHandlerFacet.sol#L213) is not in mixedCase

contracts/protocol/facets/OfferHandlerFacet.sol#L213


 - [ ] ID-680
Parameter [ConfigHandlerFacet.setMaxRoyaltyPecentage(uint16)._maxRoyaltyPecentage](contracts/protocol/facets/ConfigHandlerFacet.sol#L528) is not in mixedCase

contracts/protocol/facets/ConfigHandlerFacet.sol#L528


 - [ ] ID-681
Parameter [GroupHandlerFacet.removeOffersFromGroup(uint256,uint256[])._offerIds](contracts/protocol/facets/GroupHandlerFacet.sol#L91) is not in mixedCase

contracts/protocol/facets/GroupHandlerFacet.sol#L91


 - [ ] ID-682
Parameter [BundleHandlerFacet.getBundleIdByOffer(uint256)._offerId](contracts/protocol/facets/BundleHandlerFacet.sol#L79) is not in mixedCase

contracts/protocol/facets/BundleHandlerFacet.sol#L79


 - [ ] ID-683
Parameter [MetaTransactionsHandlerFacet.validateTx(string,bytes,uint256,address)._nonce](contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L188) is not in mixedCase

contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L188


 - [ ] ID-684
Parameter [BosonVoucherBase.getPreMintStatus(uint256)._tokenId](contracts/protocol/clients/voucher/BosonVoucher.sol#L681) is not in mixedCase

contracts/protocol/clients/voucher/BosonVoucher.sol#L681


 - [ ] ID-685
Parameter [MockExchangeHandlerFacet.completeExchange(uint256)._exchangeId](contracts/mock/MockExchangeHandlerFacet.sol#L65) is not in mixedCase

contracts/mock/MockExchangeHandlerFacet.sol#L65


 - [ ] ID-686
Parameter [ProtocolBase.getDisputeResolverIdByClerk(address)._clerk](contracts/protocol/bases/ProtocolBase.sol#L254) is not in mixedCase

contracts/protocol/bases/ProtocolBase.sol#L254


 - [ ] ID-687
Parameter [OrchestrationHandlerFacet1.createTwinAndBundleAfterOffer(BosonTypes.Twin,uint256,uint256)._twin](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1268) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1268


 - [ ] ID-688
Parameter [ConfigHandlerFacet.setMaxDisputesPerBatch(uint16)._maxDisputesPerBatch](contracts/protocol/facets/ConfigHandlerFacet.sol#L456) is not in mixedCase

contracts/protocol/facets/ConfigHandlerFacet.sol#L456


 - [ ] ID-689
Parameter [OrchestrationHandlerFacet1.createSellerAndPremintedOffer(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._disputeResolverId](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L163) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L163


 - [ ] ID-690
Parameter [ConfigHandlerFacet.setMaxFeesPerDisputeResolver(uint16)._maxFeesPerDisputeResolver](contracts/protocol/facets/ConfigHandlerFacet.sol#L392) is not in mixedCase

contracts/protocol/facets/ConfigHandlerFacet.sol#L392


 - [ ] ID-691
Parameter [TwinBase.isProtocolApproved(address,address,address)._tokenAddress](contracts/protocol/bases/TwinBase.sol#L169) is not in mixedCase

contracts/protocol/bases/TwinBase.sol#L169


 - [ ] ID-692
Parameter [DisputeResolverHandlerFacet.areSellersAllowed(uint256,uint256[])._sellerIds](contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L735) is not in mixedCase

contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L735


 - [ ] ID-693
Parameter [OrchestrationHandlerFacet1.createPremintedOfferWithConditionAndTwinAndBundle(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Condition,BosonTypes.Twin,uint256)._offerDurations](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L674) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L674


 - [ ] ID-694
Parameter [BundleBase.calculateOffersTotalQuantity(uint256,uint256)._offerId](contracts/protocol/bases/BundleBase.sol#L169) is not in mixedCase

contracts/protocol/bases/BundleBase.sol#L169


 - [ ] ID-695
Parameter [BosonVoucherBase.ownerOf(uint256)._tokenId](contracts/protocol/clients/voucher/BosonVoucher.sol#L369) is not in mixedCase

contracts/protocol/clients/voucher/BosonVoucher.sol#L369


 - [ ] ID-696
Parameter [BundleBase.bundleSupplyChecks(uint256,uint256)._twinId](contracts/protocol/bases/BundleBase.sol#L144) is not in mixedCase

contracts/protocol/bases/BundleBase.sol#L144


 - [ ] ID-697
Parameter [OrchestrationHandlerFacet1.createSellerAndPremintedOfferAndTwinWithBundle(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Twin,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._disputeResolverId](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1024) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1024


 - [ ] ID-698
Parameter [DisputeResolverHandlerFacet.addSellersToAllowList(uint256,uint256[])._disputeResolverId](contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L563) is not in mixedCase

contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L563


 - [ ] ID-699
Parameter [BundleBase.createBundleInternal(BosonTypes.Bundle)._bundle](contracts/protocol/bases/BundleBase.sol#L38) is not in mixedCase

contracts/protocol/bases/BundleBase.sol#L38


 - [ ] ID-700
Parameter [GroupHandlerFacet.removeOffersFromGroup(uint256,uint256[])._groupId](contracts/protocol/facets/GroupHandlerFacet.sol#L91) is not in mixedCase

contracts/protocol/facets/GroupHandlerFacet.sol#L91


 - [ ] ID-701
Parameter [SellerBase.createSellerInternal(BosonTypes.Seller,BosonTypes.AuthToken,BosonTypes.VoucherInitValues)._voucherInitValues](contracts/protocol/bases/SellerBase.sol#L42) is not in mixedCase

contracts/protocol/bases/SellerBase.sol#L42


 - [ ] ID-702
Parameter [FundsLib.increaseAvailableFunds(uint256,address,uint256)._entityId](contracts/protocol/libs/FundsLib.sol#L305) is not in mixedCase

contracts/protocol/libs/FundsLib.sol#L305


 - [ ] ID-703
Parameter [MetaTransactionsHandlerFacet.executeTx(address,string,bytes,uint256)._nonce](contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L240) is not in mixedCase

contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L240


 - [ ] ID-704
Parameter [OrchestrationHandlerFacet1.createSellerAndPremintedOffer(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._voucherInitValues](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L166) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L166


 - [ ] ID-705
Variable [ERC1155Upgradeable.__gap](node_modules/@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol#L528) is not in mixedCase

node_modules/@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol#L528


 - [ ] ID-706
Parameter [ProtocolBase.fetchTwin(uint256)._twinId](contracts/protocol/bases/ProtocolBase.sol#L515) is not in mixedCase

contracts/protocol/bases/ProtocolBase.sol#L515


 - [ ] ID-707
Parameter [MetaTransactionsHandlerFacet.validateTx(string,bytes,uint256,address)._functionName](contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L186) is not in mixedCase

contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L186


 - [ ] ID-708
Parameter [DisputeHandlerFacet.finalizeDispute(uint256,BosonTypes.Exchange,BosonTypes.Dispute,BosonTypes.DisputeDates,BosonTypes.DisputeState,uint256)._dispute](contracts/protocol/facets/DisputeHandlerFacet.sol#L441) is not in mixedCase

contracts/protocol/facets/DisputeHandlerFacet.sol#L441


 - [ ] ID-709
Parameter [ConfigHandlerFacet.setMaxEscalationResponsePeriod(uint256)._maxEscalationResponsePeriod](contracts/protocol/facets/ConfigHandlerFacet.sol#L425) is not in mixedCase

contracts/protocol/facets/ConfigHandlerFacet.sol#L425


 - [ ] ID-710
Parameter [OrchestrationHandlerFacet1.createSellerAndOfferAndTwinWithBundle(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.Twin,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._agentId](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L939) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L939


 - [ ] ID-711
Parameter [MetaTransactionsHandlerFacet.isUsedNonce(address,uint256)._nonce](contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L169) is not in mixedCase

contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L169


 - [ ] ID-712
Parameter [OrchestrationHandlerFacet1.createSellerAndPremintedOfferAndTwinWithBundle(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Twin,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._agentId](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1029) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1029


 - [ ] ID-713
Parameter [OrchestrationHandlerFacet1.createOfferAndTwinWithBundle(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.Twin,uint256)._offerDurations](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L469) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L469


 - [ ] ID-714
Parameter [OrchestrationHandlerFacet1.createPremintedOfferWithCondition(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Condition,uint256)._offer](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L289) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L289


 - [ ] ID-715
Parameter [TwinBase.contractSupportsInterface(address,bytes4)._tokenAddress](contracts/protocol/bases/TwinBase.sol#L152) is not in mixedCase

contracts/protocol/bases/TwinBase.sol#L152


 - [ ] ID-716
Parameter [SnapshotGate.appendToSnapshot(SnapshotGate.Holder[])._holders](contracts/example/SnapshotGate/SnapshotGate.sol#L137) is not in mixedCase

contracts/example/SnapshotGate/SnapshotGate.sol#L137


 - [ ] ID-717
Parameter [JewelerLib.addReplaceRemoveFacetSelectors(uint256,bytes32,address,IDiamondCut.FacetCutAction,bytes4[])._action](contracts/diamond/JewelerLib.sol#L114) is not in mixedCase

contracts/diamond/JewelerLib.sol#L114


 - [ ] ID-718
Parameter [OrchestrationHandlerFacet1.createOfferWithCondition(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.Condition,uint256)._disputeResolverId](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L224) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L224


 - [ ] ID-719
Parameter [ExchangeHandlerFacet.authorizeCommit(address,BosonTypes.Offer,uint256)._buyer](contracts/protocol/facets/ExchangeHandlerFacet.sol#L874) is not in mixedCase

contracts/protocol/facets/ExchangeHandlerFacet.sol#L874


 - [ ] ID-720
Parameter [OrchestrationHandlerFacet1.createSellerAndOfferAndTwinWithBundle(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.Twin,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._authToken](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L937) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L937


 - [ ] ID-721
Parameter [ProtocolInitializationHandlerFacet.initialize(bytes32,address[],bytes[],bool,bytes,bytes4[],bytes4[])._version](contracts/protocol/facets/ProtocolInitializationHandlerFacet.sol#L41) is not in mixedCase

contracts/protocol/facets/ProtocolInitializationHandlerFacet.sol#L41


 - [ ] ID-722
Parameter [GroupHandlerFacet.addOffersToGroup(uint256,uint256[])._offerIds](contracts/protocol/facets/GroupHandlerFacet.sol#L66) is not in mixedCase

contracts/protocol/facets/GroupHandlerFacet.sol#L66


 - [ ] ID-723
Parameter [BosonVoucherBase.issueVoucher(uint256,address)._buyer](contracts/protocol/clients/voucher/BosonVoucher.sol#L117) is not in mixedCase

contracts/protocol/clients/voucher/BosonVoucher.sol#L117


 - [ ] ID-724
Parameter [OrchestrationHandlerFacet1.createSellerAndPremintedOfferAndTwinWithBundle(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Twin,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._offerDurations](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1023) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1023


 - [ ] ID-725
Parameter [FundsHandlerFacet.withdrawProtocolFees(address[],uint256[])._tokenList](contracts/protocol/facets/FundsHandlerFacet.sol#L146) is not in mixedCase

contracts/protocol/facets/FundsHandlerFacet.sol#L146


 - [ ] ID-726
Parameter [OrchestrationHandlerFacet1.createSellerAndPremintedOfferWithCondition(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Condition,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._voucherInitValues](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L844) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L844


 - [ ] ID-727
Parameter [OrchestrationHandlerFacet1.createPremintedOfferAddToGroup(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,uint256,uint256)._offerDates](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L409) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L409


 - [ ] ID-728
Parameter [OfferBase.createOfferInternal(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256)._disputeResolverId](contracts/protocol/bases/OfferBase.sol#L52) is not in mixedCase

contracts/protocol/bases/OfferBase.sol#L52


 - [ ] ID-729
Parameter [OrchestrationHandlerFacet1.createSellerAndOffer(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._offerDates](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L86) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L86


 - [ ] ID-730
Parameter [SellerHandlerFacet.getSellerByAddress(address)._associatedAddress](contracts/protocol/facets/SellerHandlerFacet.sol#L366) is not in mixedCase

contracts/protocol/facets/SellerHandlerFacet.sol#L366


 - [ ] ID-731
Parameter [DisputeHandlerFacet.finalizeDispute(uint256,BosonTypes.Exchange,BosonTypes.Dispute,BosonTypes.DisputeDates,BosonTypes.DisputeState,uint256)._exchange](contracts/protocol/facets/DisputeHandlerFacet.sol#L440) is not in mixedCase

contracts/protocol/facets/DisputeHandlerFacet.sol#L440


 - [ ] ID-732
Parameter [SellerHandlerFacet.optInToSellerUpdate(uint256,BosonTypes.SellerUpdateFields[])._sellerId](contracts/protocol/facets/SellerHandlerFacet.sol#L193) is not in mixedCase

contracts/protocol/facets/SellerHandlerFacet.sol#L193


 - [ ] ID-733
Parameter [FundsHandlerFacet.withdrawFunds(uint256,address[],uint256[])._tokenAmounts](contracts/protocol/facets/FundsHandlerFacet.sol#L93) is not in mixedCase

contracts/protocol/facets/FundsHandlerFacet.sol#L93


 - [ ] ID-734
Parameter [SellerBase.storeSeller(BosonTypes.Seller,BosonTypes.AuthToken,ProtocolLib.ProtocolLookups)._lookups](contracts/protocol/bases/SellerBase.sol#L119) is not in mixedCase

contracts/protocol/bases/SellerBase.sol#L119


 - [ ] ID-735
Parameter [Foreign20Malicious2.setMetaTxBytes(address,bytes,bytes32,bytes32,uint8)._sigS](contracts/mock/Foreign20.sol#L138) is not in mixedCase

contracts/mock/Foreign20.sol#L138


 - [ ] ID-736
Parameter [DisputeHandlerFacet.resolveDispute(uint256,uint256,bytes32,bytes32,uint8)._sigS](contracts/protocol/facets/DisputeHandlerFacet.sol#L239) is not in mixedCase

contracts/protocol/facets/DisputeHandlerFacet.sol#L239


 - [ ] ID-737
Parameter [ConfigHandlerFacet.setMaxOffersPerBatch(uint16)._maxOffersPerBatch](contracts/protocol/facets/ConfigHandlerFacet.sol#L336) is not in mixedCase

contracts/protocol/facets/ConfigHandlerFacet.sol#L336


 - [ ] ID-738
Parameter [OrchestrationHandlerFacet1.createPremintedOfferAndTwinWithBundle(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Twin,uint256)._offerDates](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L536) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L536


 - [ ] ID-739
Parameter [OrchestrationHandlerFacet1.createOfferAddToGroup(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,uint256)._offer](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L343) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L343


 - [ ] ID-740
Parameter [SellerBase.storeSeller(BosonTypes.Seller,BosonTypes.AuthToken,ProtocolLib.ProtocolLookups)._seller](contracts/protocol/bases/SellerBase.sol#L117) is not in mixedCase

contracts/protocol/bases/SellerBase.sol#L117


 - [ ] ID-741
Parameter [BeaconClientBase.onVoucherTransferred(uint256,address)._exchangeId](contracts/protocol/bases/BeaconClientBase.sol#L80) is not in mixedCase

contracts/protocol/bases/BeaconClientBase.sol#L80


 - [ ] ID-742
Parameter [DisputeResolverHandlerFacet.createDisputeResolver(BosonTypes.DisputeResolver,BosonTypes.DisputeResolverFee[],uint256[])._disputeResolverFees](contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L49) is not in mixedCase

contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L49


 - [ ] ID-743
Parameter [JewelerLib.addReplaceRemoveFacetSelectors(uint256,bytes32,address,IDiamondCut.FacetCutAction,bytes4[])._selectorCount](contracts/diamond/JewelerLib.sol#L111) is not in mixedCase

contracts/diamond/JewelerLib.sol#L111


 - [ ] ID-744
Parameter [FundsHandlerFacet.withdrawFunds(uint256,address[],uint256[])._tokenList](contracts/protocol/facets/FundsHandlerFacet.sol#L92) is not in mixedCase

contracts/protocol/facets/FundsHandlerFacet.sol#L92


 - [ ] ID-745
Parameter [JewelerLib.enforceHasContractCode(address,string)._errorMessage](contracts/diamond/JewelerLib.sol#L307) is not in mixedCase

contracts/diamond/JewelerLib.sol#L307


 - [ ] ID-746
Parameter [ExchangeHandlerFacet.holdsSpecificToken(address,BosonTypes.Condition)._condition](contracts/protocol/facets/ExchangeHandlerFacet.sol#L947) is not in mixedCase

contracts/protocol/facets/ExchangeHandlerFacet.sol#L947


 - [ ] ID-747
Parameter [FundsLib.decreaseAvailableFunds(uint256,address,uint256)._tokenAddress](contracts/protocol/libs/FundsLib.sol#L336) is not in mixedCase

contracts/protocol/libs/FundsLib.sol#L336


 - [ ] ID-748
Parameter [DisputeResolverHandlerFacet.updateDisputeResolver(BosonTypes.DisputeResolver)._disputeResolver](contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L186) is not in mixedCase

contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L186


 - [ ] ID-749
Parameter [GroupBase.validateCondition(BosonTypes.Condition)._condition](contracts/protocol/bases/GroupBase.sol#L111) is not in mixedCase

contracts/protocol/bases/GroupBase.sol#L111


 - [ ] ID-750
Parameter [OrchestrationHandlerFacet1.createOfferWithConditionAndTwinAndBundle(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.Condition,BosonTypes.Twin,uint256)._twin](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L605) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L605


 - [ ] ID-751
Parameter [ProtocolBase.getDisputeResolverIdByAdmin(address)._admin](contracts/protocol/bases/ProtocolBase.sol#L235) is not in mixedCase

contracts/protocol/bases/ProtocolBase.sol#L235


 - [ ] ID-752
Parameter [TestInitializableDiamond.initialize(address)._testAddress](contracts/mock/TestInitializableDiamond.sol#L39) is not in mixedCase

contracts/mock/TestInitializableDiamond.sol#L39


 - [ ] ID-753
Parameter [ExchangeHandlerFacet.completeExchangeBatch(uint256[])._exchangeIds](contracts/protocol/facets/ExchangeHandlerFacet.sol#L286) is not in mixedCase

contracts/protocol/facets/ExchangeHandlerFacet.sol#L286


 - [ ] ID-754
Parameter [MetaTransactionsHandlerFacet.validateTx(string,bytes,uint256,address)._functionSignature](contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L187) is not in mixedCase

contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L187


 - [ ] ID-755
Parameter [ProtocolBase.getAgentIdByWallet(address)._wallet](contracts/protocol/bases/ProtocolBase.sol#L201) is not in mixedCase

contracts/protocol/bases/ProtocolBase.sol#L201


 - [ ] ID-756
Parameter [OrchestrationHandlerFacet1.createPremintedOfferWithConditionAndTwinAndBundle(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Condition,BosonTypes.Twin,uint256)._disputeResolverId](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L675) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L675


 - [ ] ID-757
Parameter [MetaTransactionsHandlerFacet.hashGenericDetails(bytes)._functionSignature](contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L100) is not in mixedCase

contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L100


 - [ ] ID-758
Parameter [GroupHandlerFacet.getGroup(uint256)._groupId](contracts/protocol/facets/GroupHandlerFacet.sol#L195) is not in mixedCase

contracts/protocol/facets/GroupHandlerFacet.sol#L195


 - [ ] ID-759
Parameter [ProtocolBase.fetchExchange(uint256)._exchangeId](contracts/protocol/bases/ProtocolBase.sol#L460) is not in mixedCase

contracts/protocol/bases/ProtocolBase.sol#L460


 - [ ] ID-760
Parameter [SnapshotGate.checkSnapshot(uint256,address)._tokenId](contracts/example/SnapshotGate/SnapshotGate.sol#L310) is not in mixedCase

contracts/example/SnapshotGate/SnapshotGate.sol#L310


 - [ ] ID-761
Parameter [OrchestrationHandlerFacet1.createSellerAndPremintedOffer(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._offer](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L160) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L160


 - [ ] ID-762
Parameter [OrchestrationHandlerFacet1.createSellerAndPremintedOfferWithConditionAndTwinAndBundle(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Condition,BosonTypes.Twin,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._condition](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1226) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1226


 - [ ] ID-763
Parameter [ExchangeHandlerFacet.holdsThreshold(address,BosonTypes.Condition)._buyer](contracts/protocol/facets/ExchangeHandlerFacet.sol#L926) is not in mixedCase

contracts/protocol/facets/ExchangeHandlerFacet.sol#L926


 - [ ] ID-764
Parameter [ProtocolBase.fetchBundleIdByOffer(uint256)._offerId](contracts/protocol/bases/ProtocolBase.sol#L575) is not in mixedCase

contracts/protocol/bases/ProtocolBase.sol#L575


 - [ ] ID-765
Parameter [OrchestrationHandlerFacet1.createPremintedOfferAndTwinWithBundle(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Twin,uint256)._offerDurations](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L537) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L537


 - [ ] ID-766
Parameter [BuyerHandlerFacet.createBuyer(BosonTypes.Buyer)._buyer](contracts/protocol/facets/BuyerHandlerFacet.sol#L36) is not in mixedCase

contracts/protocol/facets/BuyerHandlerFacet.sol#L36


 - [ ] ID-767
Parameter [MetaTransactionsHandlerFacet.executeMetaTransaction(address,string,bytes,uint256,bytes32,bytes32,uint8)._sigR](contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L292) is not in mixedCase

contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L292


 - [ ] ID-768
Parameter [DisputeResolverHandlerFacet.addFeesToDisputeResolver(uint256,BosonTypes.DisputeResolverFee[])._disputeResolverFees](contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L424) is not in mixedCase

contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L424


 - [ ] ID-769
Parameter [OfferHandlerFacet.getAgentIdByOffer(uint256)._offerId](contracts/protocol/facets/OfferHandlerFacet.sol#L324) is not in mixedCase

contracts/protocol/facets/OfferHandlerFacet.sol#L324


 - [ ] ID-770
Parameter [OrchestrationHandlerFacet1.createOfferAddToGroup(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,uint256)._groupId](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L347) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L347


 - [ ] ID-771
Parameter [BosonVoucherBase.getAvailablePreMints(uint256)._offerId](contracts/protocol/clients/voucher/BosonVoucher.sol#L330) is not in mixedCase

contracts/protocol/clients/voucher/BosonVoucher.sol#L330


 - [ ] ID-772
Parameter [ProtocolBase.fetchCondition(uint256)._groupId](contracts/protocol/bases/ProtocolBase.sol#L448) is not in mixedCase

contracts/protocol/bases/ProtocolBase.sol#L448


 - [ ] ID-773
Parameter [ExchangeHandlerFacet.redeemVoucher(uint256)._exchangeId](contracts/protocol/facets/ExchangeHandlerFacet.sol#L446) is not in mixedCase

contracts/protocol/facets/ExchangeHandlerFacet.sol#L446


 - [ ] ID-774
Parameter [OrchestrationHandlerFacet1.createPremintedOfferWithConditionAndTwinAndBundle(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Condition,BosonTypes.Twin,uint256)._reservedRangeLength](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L676) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L676


 - [ ] ID-775
Parameter [ExchangeHandlerFacet.commitToPreMintedOffer(address,uint256,uint256)._exchangeId](contracts/protocol/facets/ExchangeHandlerFacet.sol#L108) is not in mixedCase

contracts/protocol/facets/ExchangeHandlerFacet.sol#L108


 - [ ] ID-776
Parameter [JewelerLib.diamondCut(IDiamondCut.FacetCut[],address,bytes)._facetCuts](contracts/diamond/JewelerLib.sol#L44) is not in mixedCase

contracts/diamond/JewelerLib.sol#L44


 - [ ] ID-777
Parameter [BeaconClientBase.getBosonOfferByExchangeId(uint256)._exchangeId](contracts/protocol/bases/BeaconClientBase.sol#L44) is not in mixedCase

contracts/protocol/bases/BeaconClientBase.sol#L44


 - [ ] ID-778
Parameter [DisputeResolverHandlerFacet.storeSellerAllowList(uint256,uint256[])._disputeResolverId](contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L802) is not in mixedCase

contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L802


 - [ ] ID-779
Parameter [OrchestrationHandlerFacet1.createSellerAndOffer(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._disputeResolverId](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L88) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L88


 - [ ] ID-780
Parameter [ProtocolBase.getExchangeIdsByOffer(uint256)._offerId](contracts/protocol/bases/ProtocolBase.sol#L605) is not in mixedCase

contracts/protocol/bases/ProtocolBase.sol#L605


 - [ ] ID-781
Parameter [OrchestrationHandlerFacet1.createPremintedOfferAddToGroup(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,uint256,uint256)._disputeResolverId](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L411) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L411


 - [ ] ID-782
Parameter [ProtocolInitializationHandlerFacet.initialize(bytes32,address[],bytes[],bool,bytes,bytes4[],bytes4[])._calldata](contracts/protocol/facets/ProtocolInitializationHandlerFacet.sol#L43) is not in mixedCase

contracts/protocol/facets/ProtocolInitializationHandlerFacet.sol#L43


 - [ ] ID-783
Parameter [DiamondLib.addSupportedInterface(bytes4)._interfaceId](contracts/diamond/DiamondLib.sol#L63) is not in mixedCase

contracts/diamond/DiamondLib.sol#L63


 - [ ] ID-784
Function [ERC1155Upgradeable.__ERC1155_init(string)](node_modules/@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol#L36-L38) is not in mixedCase

node_modules/@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol#L36-L38


 - [ ] ID-785
Parameter [DisputeResolverHandlerFacet.optInToDisputeResolverUpdate(uint256,BosonTypes.DisputeResolverUpdateFields[])._fieldsToUpdate](contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L312) is not in mixedCase

contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L312


 - [ ] ID-786
Parameter [OrchestrationHandlerFacet1.createOfferAndTwinWithBundle(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.Twin,uint256)._offerDates](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L468) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L468


 - [ ] ID-787
Parameter [ProtocolBase.checkBuyer(uint256)._currentBuyer](contracts/protocol/bases/ProtocolBase.sol#L625) is not in mixedCase

contracts/protocol/bases/ProtocolBase.sol#L625


 - [ ] ID-788
Parameter [BundleHandlerFacet.getBundleIdByTwin(uint256)._twinId](contracts/protocol/facets/BundleHandlerFacet.sol#L90) is not in mixedCase

contracts/protocol/facets/BundleHandlerFacet.sol#L90


 - [ ] ID-789
Parameter [OfferBase.storeOffer(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256)._offer](contracts/protocol/bases/OfferBase.sol#L109) is not in mixedCase

contracts/protocol/bases/OfferBase.sol#L109


 - [ ] ID-790
Parameter [DisputeHandlerFacet.resolveDispute(uint256,uint256,bytes32,bytes32,uint8)._buyerPercent](contracts/protocol/facets/DisputeHandlerFacet.sol#L237) is not in mixedCase

contracts/protocol/facets/DisputeHandlerFacet.sol#L237


 - [ ] ID-791
Parameter [ProtocolInitializationHandlerFacet.initialize(bytes32,address[],bytes[],bool,bytes,bytes4[],bytes4[])._interfacesToRemove](contracts/protocol/facets/ProtocolInitializationHandlerFacet.sol#L46) is not in mixedCase

contracts/protocol/facets/ProtocolInitializationHandlerFacet.sol#L46


 - [ ] ID-792
Parameter [ConfigHandlerFacet.setTreasuryAddress(address)._treasuryAddress](contracts/protocol/facets/ConfigHandlerFacet.sol#L113) is not in mixedCase

contracts/protocol/facets/ConfigHandlerFacet.sol#L113


 - [ ] ID-793
Parameter [SellerBase.createSellerInternal(BosonTypes.Seller,BosonTypes.AuthToken,BosonTypes.VoucherInitValues)._authToken](contracts/protocol/bases/SellerBase.sol#L41) is not in mixedCase

contracts/protocol/bases/SellerBase.sol#L41


 - [ ] ID-794
Parameter [ExchangeHandlerFacet.authorizeCommit(address,BosonTypes.Offer,uint256)._offer](contracts/protocol/facets/ExchangeHandlerFacet.sol#L875) is not in mixedCase

contracts/protocol/facets/ExchangeHandlerFacet.sol#L875


 - [ ] ID-795
Parameter [DisputeHandlerFacet.finalizeDispute(uint256,BosonTypes.Exchange,BosonTypes.Dispute,BosonTypes.DisputeDates,BosonTypes.DisputeState,uint256)._buyerPercent](contracts/protocol/facets/DisputeHandlerFacet.sol#L444) is not in mixedCase

contracts/protocol/facets/DisputeHandlerFacet.sol#L444


 - [ ] ID-796
Parameter [TwinHandlerFacet.getTwin(uint256)._twinId](contracts/protocol/facets/TwinHandlerFacet.sol#L118) is not in mixedCase

contracts/protocol/facets/TwinHandlerFacet.sol#L118


 - [ ] ID-797
Parameter [MockExchangeHandlerFacet.transferTwins(BosonTypes.Exchange,BosonTypes.Voucher)._voucher](contracts/mock/MockExchangeHandlerFacet.sol#L381) is not in mixedCase

contracts/mock/MockExchangeHandlerFacet.sol#L381


 - [ ] ID-798
Variable [BosonVoucherBase.__gap](contracts/protocol/clients/voucher/BosonVoucher.sol#L78) is not in mixedCase

contracts/protocol/clients/voucher/BosonVoucher.sol#L78


 - [ ] ID-799
Variable [ERC165Upgradeable.__gap](node_modules/@openzeppelin/contracts-upgradeable/utils/introspection/ERC165Upgradeable.sol#L41) is not in mixedCase

node_modules/@openzeppelin/contracts-upgradeable/utils/introspection/ERC165Upgradeable.sol#L41


 - [ ] ID-800
Function [OwnableUpgradeable.__Ownable_init_unchained()](node_modules/@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol#L33-L35) is not in mixedCase

node_modules/@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol#L33-L35


 - [ ] ID-801
Parameter [DisputeHandlerFacet.finalizeDispute(uint256,BosonTypes.Exchange,BosonTypes.Dispute,BosonTypes.DisputeDates,BosonTypes.DisputeState,uint256)._exchangeId](contracts/protocol/facets/DisputeHandlerFacet.sol#L439) is not in mixedCase

contracts/protocol/facets/DisputeHandlerFacet.sol#L439


 - [ ] ID-802
Parameter [DiamondLoupeFacet.facetFunctionSelectors(address)._facet](contracts/diamond/facets/DiamondLoupeFacet.sol#L82) is not in mixedCase

contracts/diamond/facets/DiamondLoupeFacet.sol#L82


 - [ ] ID-803
Parameter [FundsHandlerFacet.depositFunds(uint256,address,uint256)._sellerId](contracts/protocol/facets/FundsHandlerFacet.sol#L47) is not in mixedCase

contracts/protocol/facets/FundsHandlerFacet.sol#L47


 - [ ] ID-804
Parameter [ProtocolInitializationHandlerFacet.initialize(bytes32,address[],bytes[],bool,bytes,bytes4[],bytes4[])._interfacesToAdd](contracts/protocol/facets/ProtocolInitializationHandlerFacet.sol#L47) is not in mixedCase

contracts/protocol/facets/ProtocolInitializationHandlerFacet.sol#L47


 - [ ] ID-805
Parameter [OrchestrationHandlerFacet1.createSellerAndPremintedOfferAndTwinWithBundle(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Twin,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._reservedRangeLength](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1025) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1025


 - [ ] ID-806
Parameter [DisputeHandlerFacet.getDispute(uint256)._exchangeId](contracts/protocol/facets/DisputeHandlerFacet.sol#L468) is not in mixedCase

contracts/protocol/facets/DisputeHandlerFacet.sol#L468


 - [ ] ID-807
Parameter [SnapshotGate.transferFundsToGateAndApproveProtocol(address,uint256)._tokenAddress](contracts/example/SnapshotGate/SnapshotGate.sol#L278) is not in mixedCase

contracts/example/SnapshotGate/SnapshotGate.sol#L278


 - [ ] ID-808
Variable [ERC721EnumerableUpgradeable.__gap](node_modules/@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol#L175) is not in mixedCase

node_modules/@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol#L175


 - [ ] ID-809
Parameter [BosonVoucherBase.safeTransferFrom(address,address,uint256,bytes)._from](contracts/protocol/clients/voucher/BosonVoucher.sol#L413) is not in mixedCase

contracts/protocol/clients/voucher/BosonVoucher.sol#L413


 - [ ] ID-810
Parameter [EIP712Lib.buildDomainSeparator(string,string)._name](contracts/protocol/libs/EIP712Lib.sol#L23) is not in mixedCase

contracts/protocol/libs/EIP712Lib.sol#L23


 - [ ] ID-811
Parameter [ProtocolBase.getValidOffer(uint256)._offerId](contracts/protocol/bases/ProtocolBase.sol#L548) is not in mixedCase

contracts/protocol/bases/ProtocolBase.sol#L548


 - [ ] ID-812
Parameter [OrchestrationHandlerFacet1.createSellerAndPremintedOffer(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._agentId](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L167) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L167


 - [ ] ID-813
Parameter [TwinBase.isProtocolApproved(address,address,address)._operator](contracts/protocol/bases/TwinBase.sol#L170) is not in mixedCase

contracts/protocol/bases/TwinBase.sol#L170


 - [ ] ID-814
Parameter [MetaTransactionsHandlerFacet.initialize(bytes32[])._functionNameHashes](contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L24) is not in mixedCase

contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L24


 - [ ] ID-815
Parameter [SnapshotGate.checkSnapshot(uint256,address)._holder](contracts/example/SnapshotGate/SnapshotGate.sol#L310) is not in mixedCase

contracts/example/SnapshotGate/SnapshotGate.sol#L310


 - [ ] ID-816
Parameter [SellerBase.cloneBosonVoucher(uint256,address,BosonTypes.VoucherInitValues)._sellerId](contracts/protocol/bases/SellerBase.sol#L160) is not in mixedCase

contracts/protocol/bases/SellerBase.sol#L160


 - [ ] ID-817
Parameter [ProtocolBase.getValidExchange(uint256,BosonTypes.ExchangeState)._exchangeId](contracts/protocol/bases/ProtocolBase.sol#L645) is not in mixedCase

contracts/protocol/bases/ProtocolBase.sol#L645


 - [ ] ID-818
Parameter [OrchestrationHandlerFacet1.createSellerAndPremintedOfferWithCondition(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Condition,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._seller](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L836) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L836


 - [ ] ID-819
Parameter [MockExchangeHandlerFacet.redeemVoucher(uint256)._exchangeId](contracts/mock/MockExchangeHandlerFacet.sol#L271) is not in mixedCase

contracts/mock/MockExchangeHandlerFacet.sol#L271


 - [ ] ID-820
Variable [ERC2771ContextUpgradeable.__gap](node_modules/@openzeppelin/contracts-upgradeable/metatx/ERC2771ContextUpgradeable.sol#L50) is not in mixedCase

node_modules/@openzeppelin/contracts-upgradeable/metatx/ERC2771ContextUpgradeable.sol#L50


 - [ ] ID-821
Parameter [JewelerLib.addReplaceRemoveFacetSelectors(uint256,bytes32,address,IDiamondCut.FacetCutAction,bytes4[])._selectorSlot](contracts/diamond/JewelerLib.sol#L112) is not in mixedCase

contracts/diamond/JewelerLib.sol#L112


 - [ ] ID-822
Parameter [WithoutFallbackError.withdrawFunds(address,uint256,address[],uint256[])._tokenList](contracts/mock/FallbackError.sol#L23) is not in mixedCase

contracts/mock/FallbackError.sol#L23


 - [ ] ID-823
Parameter [OfferHandlerFacet.createOfferBatch(BosonTypes.Offer[],BosonTypes.OfferDates[],BosonTypes.OfferDurations[],uint256[],uint256[])._offerDates](contracts/protocol/facets/OfferHandlerFacet.sol#L104) is not in mixedCase

contracts/protocol/facets/OfferHandlerFacet.sol#L104


 - [ ] ID-824
Parameter [OfferBase.storeOffer(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256)._agentId](contracts/protocol/bases/OfferBase.sol#L113) is not in mixedCase

contracts/protocol/bases/OfferBase.sol#L113


 - [ ] ID-825
Parameter [SellerBase.cloneBosonVoucher(uint256,address,BosonTypes.VoucherInitValues)._operator](contracts/protocol/bases/SellerBase.sol#L161) is not in mixedCase

contracts/protocol/bases/SellerBase.sol#L161


 - [ ] ID-826
Parameter [OrchestrationHandlerFacet1.createPremintedOfferAddToGroup(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,uint256,uint256)._offerDurations](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L410) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L410


 - [ ] ID-827
Parameter [MetaTransactionsHandlerFacet.hashMetaTransaction(BosonTypes.MetaTransaction)._metaTx](contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L75) is not in mixedCase

contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L75


 - [ ] ID-828
Parameter [OrchestrationHandlerFacet1.createSellerAndOfferWithConditionAndTwinAndBundle(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.Condition,BosonTypes.Twin,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._offerDates](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1120) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1120


 - [ ] ID-829
Parameter [MetaTransactionsHandlerFacet.hashFundDetails(bytes)._fundDetails](contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L132) is not in mixedCase

contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L132


 - [ ] ID-830
Parameter [DisputeResolverHandlerFacet.createDisputeResolver(BosonTypes.DisputeResolver,BosonTypes.DisputeResolverFee[],uint256[])._disputeResolver](contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L48) is not in mixedCase

contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L48


 - [ ] ID-831
Parameter [FundsLib.transferFundsFromProtocol(uint256,address,address,uint256)._amount](contracts/protocol/libs/FundsLib.sol#L278) is not in mixedCase

contracts/protocol/libs/FundsLib.sol#L278


 - [ ] ID-832
Parameter [ProtocolBase.fetchAgent(uint256)._agentId](contracts/protocol/bases/ProtocolBase.sol#L363) is not in mixedCase

contracts/protocol/bases/ProtocolBase.sol#L363


 - [ ] ID-833
Parameter [DisputeResolverHandlerFacet.getDisputeResolverByAddress(address)._associatedAddress](contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L698) is not in mixedCase

contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L698


 - [ ] ID-834
Parameter [OrchestrationHandlerFacet1.createPremintedOfferWithCondition(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Condition,uint256)._disputeResolverId](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L292) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L292


 - [ ] ID-835
Parameter [BosonVoucherBase.burnVoucher(uint256)._exchangeId](contracts/protocol/clients/voucher/BosonVoucher.sol#L142) is not in mixedCase

contracts/protocol/clients/voucher/BosonVoucher.sol#L142


 - [ ] ID-836
Parameter [ProtocolBase.fetchOfferFees(uint256)._offerId](contracts/protocol/bases/ProtocolBase.sol#L691) is not in mixedCase

contracts/protocol/bases/ProtocolBase.sol#L691


 - [ ] ID-837
Parameter [OfferBase.reserveRangeInternal(uint256,uint256)._length](contracts/protocol/bases/OfferBase.sol#L295) is not in mixedCase

contracts/protocol/bases/OfferBase.sol#L295


 - [ ] ID-838
Parameter [OrchestrationHandlerFacet1.createSellerAndOffer(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._offerDurations](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L87) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L87


 - [ ] ID-839
Parameter [OrchestrationHandlerFacet1.createSellerAndPremintedOfferWithConditionAndTwinAndBundle(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Condition,BosonTypes.Twin,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._twin](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1227) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1227


 - [ ] ID-840
Parameter [ProtocolBase.getDisputeResolverIdByOperator(address)._operator](contracts/protocol/bases/ProtocolBase.sol#L216) is not in mixedCase

contracts/protocol/bases/ProtocolBase.sol#L216


 - [ ] ID-841
Parameter [ExchangeHandlerFacet.transferTwins(BosonTypes.Exchange,BosonTypes.Voucher)._exchange](contracts/protocol/facets/ExchangeHandlerFacet.sol#L696) is not in mixedCase

contracts/protocol/facets/ExchangeHandlerFacet.sol#L696


 - [ ] ID-842
Parameter [BosonVoucherBase.safeTransferFrom(address,address,uint256,bytes)._tokenId](contracts/protocol/clients/voucher/BosonVoucher.sol#L415) is not in mixedCase

contracts/protocol/clients/voucher/BosonVoucher.sol#L415


 - [ ] ID-843
Parameter [OrchestrationHandlerFacet1.createSellerAndPremintedOfferWithCondition(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Condition,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._reservedRangeLength](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L841) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L841


 - [ ] ID-844
Parameter [JewelerLib.initializeDiamondCut(address,bytes)._init](contracts/diamond/JewelerLib.sol#L271) is not in mixedCase

contracts/diamond/JewelerLib.sol#L271


 - [ ] ID-845
Parameter [OrchestrationHandlerFacet1.createOfferAddToGroup(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,uint256)._offerDates](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L344) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L344


 - [ ] ID-846
Parameter [OrchestrationHandlerFacet1.createSellerAndPremintedOfferWithCondition(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Condition,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._offerDurations](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L839) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L839


 - [ ] ID-847
Parameter [DisputeResolverHandlerFacet.preUpdateDisputeResolverCheck(uint256,address,ProtocolLib.ProtocolLookups)._role](contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L838) is not in mixedCase

contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L838


 - [ ] ID-848
Parameter [ProtocolBase.fetchDisputeResolutionTerms(uint256)._offerId](contracts/protocol/bases/ProtocolBase.sol#L418) is not in mixedCase

contracts/protocol/bases/ProtocolBase.sol#L418


 - [ ] ID-849
Parameter [DisputeResolverHandlerFacet.preUpdateDisputeResolverCheck(uint256,address,ProtocolLib.ProtocolLookups)._disputeResolverId](contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L837) is not in mixedCase

contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L837


 - [ ] ID-850
Parameter [OfferHandlerFacet.extendOfferBatch(uint256[],uint256)._validUntilDate](contracts/protocol/facets/OfferHandlerFacet.sol#L252) is not in mixedCase

contracts/protocol/facets/OfferHandlerFacet.sol#L252


 - [ ] ID-851
Parameter [ConfigHandlerFacet.setMaxOffersPerGroup(uint16)._maxOffersPerGroup](contracts/protocol/facets/ConfigHandlerFacet.sol#L252) is not in mixedCase

contracts/protocol/facets/ConfigHandlerFacet.sol#L252


 - [ ] ID-852
Parameter [OrchestrationHandlerFacet1.createSellerAndOfferWithCondition(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.Condition,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._authToken](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L761) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L761


 - [ ] ID-853
Parameter [OrchestrationHandlerFacet1.createOfferWithConditionAndTwinAndBundle(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.Condition,BosonTypes.Twin,uint256)._offerDurations](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L602) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L602


 - [ ] ID-854
Parameter [OfferHandlerFacet.isOfferVoided(uint256)._offerId](contracts/protocol/facets/OfferHandlerFacet.sol#L311) is not in mixedCase

contracts/protocol/facets/OfferHandlerFacet.sol#L311


 - [ ] ID-855
Parameter [ExchangeHandlerFacet.finalizeExchange(BosonTypes.Exchange,BosonTypes.ExchangeState)._targetState](contracts/protocol/facets/ExchangeHandlerFacet.sol#L626) is not in mixedCase

contracts/protocol/facets/ExchangeHandlerFacet.sol#L626


 - [ ] ID-856
Parameter [MockNFTAuth721.mint(address,uint256)._to](contracts/mock/MockNFTAuth721.sol#L20) is not in mixedCase

contracts/mock/MockNFTAuth721.sol#L20


 - [ ] ID-857
Parameter [SellerHandlerFacet.getSeller(uint256)._sellerId](contracts/protocol/facets/SellerHandlerFacet.sol#L343) is not in mixedCase

contracts/protocol/facets/SellerHandlerFacet.sol#L343


 - [ ] ID-858
Parameter [DisputeHandlerFacet.finalizeDispute(uint256,BosonTypes.Exchange,BosonTypes.Dispute,BosonTypes.DisputeDates,BosonTypes.DisputeState,uint256)._targetState](contracts/protocol/facets/DisputeHandlerFacet.sol#L443) is not in mixedCase

contracts/protocol/facets/DisputeHandlerFacet.sol#L443


 - [ ] ID-859
Parameter [MetaTransactionsHandlerFacet.executeMetaTransaction(address,string,bytes,uint256,bytes32,bytes32,uint8)._sigS](contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L293) is not in mixedCase

contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L293


 - [ ] ID-860
Parameter [GroupHandlerFacet.createGroup(BosonTypes.Group,BosonTypes.Condition)._group](contracts/protocol/facets/GroupHandlerFacet.sol#L39) is not in mixedCase

contracts/protocol/facets/GroupHandlerFacet.sol#L39


 - [ ] ID-861
Parameter [DisputeHandlerFacet.resolveDispute(uint256,uint256,bytes32,bytes32,uint8)._sigV](contracts/protocol/facets/DisputeHandlerFacet.sol#L240) is not in mixedCase

contracts/protocol/facets/DisputeHandlerFacet.sol#L240


 - [ ] ID-862
Parameter [Foreign20WithFee.setFee(uint256)._newFee](contracts/mock/Foreign20.sol#L198) is not in mixedCase

contracts/mock/Foreign20.sol#L198


 - [ ] ID-863
Parameter [OrchestrationHandlerFacet1.createSellerAndPremintedOfferWithConditionAndTwinAndBundle(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Condition,BosonTypes.Twin,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._offerDurations](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1223) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1223


 - [ ] ID-864
Parameter [ExchangeHandlerFacet.commitToOfferInternal(address,BosonTypes.Offer,uint256,bool)._offer](contracts/protocol/facets/ExchangeHandlerFacet.sol#L152) is not in mixedCase

contracts/protocol/facets/ExchangeHandlerFacet.sol#L152


 - [ ] ID-865
Parameter [BosonVoucherBase.silentMint(address,uint256)._tokenId](contracts/protocol/clients/voucher/BosonVoucher.sol#L744) is not in mixedCase

contracts/protocol/clients/voucher/BosonVoucher.sol#L744


 - [ ] ID-866
Parameter [ProtocolBase.fetchConditionByExchange(uint256)._exchangeId](contracts/protocol/bases/ProtocolBase.sol#L722) is not in mixedCase

contracts/protocol/bases/ProtocolBase.sol#L722


 - [ ] ID-867
Parameter [ProtocolBase.fetchBundle(uint256)._bundleId](contracts/protocol/bases/ProtocolBase.sol#L530) is not in mixedCase

contracts/protocol/bases/ProtocolBase.sol#L530


 - [ ] ID-868
Parameter [DisputeResolverHandlerFacet.removeSellersFromAllowList(uint256,uint256[])._disputeResolverId](contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L609) is not in mixedCase

contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L609


 - [ ] ID-869
Parameter [ExchangeHandlerFacet.commitToPreMintedOffer(address,uint256,uint256)._offerId](contracts/protocol/facets/ExchangeHandlerFacet.sol#L107) is not in mixedCase

contracts/protocol/facets/ExchangeHandlerFacet.sol#L107


 - [ ] ID-870
Parameter [PauseHandlerFacet.pause(BosonTypes.PausableRegion[])._regions](contracts/protocol/facets/PauseHandlerFacet.sol#L37) is not in mixedCase

contracts/protocol/facets/PauseHandlerFacet.sol#L37


 - [ ] ID-871
Parameter [ExchangeHandlerFacet.holdsThreshold(address,BosonTypes.Condition)._condition](contracts/protocol/facets/ExchangeHandlerFacet.sol#L926) is not in mixedCase

contracts/protocol/facets/ExchangeHandlerFacet.sol#L926


 - [ ] ID-872
Parameter [BosonVoucherBase.preMint(uint256,uint256)._amount](contracts/protocol/clients/voucher/BosonVoucher.sol#L215) is not in mixedCase

contracts/protocol/clients/voucher/BosonVoucher.sol#L215


 - [ ] ID-873
Parameter [TwinBase.createTwinInternal(BosonTypes.Twin)._twin](contracts/protocol/bases/TwinBase.sol#L36) is not in mixedCase

contracts/protocol/bases/TwinBase.sol#L36


 - [ ] ID-874
Parameter [JewelerLib.diamondCut(IDiamondCut.FacetCut[],address,bytes)._calldata](contracts/diamond/JewelerLib.sol#L46) is not in mixedCase

contracts/diamond/JewelerLib.sol#L46


 - [ ] ID-875
Parameter [AgentHandlerFacet.updateAgent(BosonTypes.Agent)._agent](contracts/protocol/facets/AgentHandlerFacet.sol#L75) is not in mixedCase

contracts/protocol/facets/AgentHandlerFacet.sol#L75


 - [ ] ID-876
Parameter [DisputeHandlerFacet.escalateDispute(uint256)._exchangeId](contracts/protocol/facets/DisputeHandlerFacet.sol#L324) is not in mixedCase

contracts/protocol/facets/DisputeHandlerFacet.sol#L324


 - [ ] ID-877
Parameter [SnapshotGate.transferFundsToGateAndApproveProtocol(address,uint256)._amount](contracts/example/SnapshotGate/SnapshotGate.sol#L278) is not in mixedCase

contracts/example/SnapshotGate/SnapshotGate.sol#L278


 - [ ] ID-878
Parameter [SellerHandlerFacet.createSeller(BosonTypes.Seller,BosonTypes.AuthToken,BosonTypes.VoucherInitValues)._voucherInitValues](contracts/protocol/facets/SellerHandlerFacet.sol#L48) is not in mixedCase

contracts/protocol/facets/SellerHandlerFacet.sol#L48


 - [ ] ID-879
Parameter [TwinBase.isProtocolApproved(address,address,address)._protocol](contracts/protocol/bases/TwinBase.sol#L171) is not in mixedCase

contracts/protocol/bases/TwinBase.sol#L171


 - [ ] ID-880
Parameter [FundsHandlerFacet.withdrawFundsInternal(address,uint256,address[],uint256[])._entityId](contracts/protocol/facets/FundsHandlerFacet.sol#L217) is not in mixedCase

contracts/protocol/facets/FundsHandlerFacet.sol#L217


 - [ ] ID-881
Parameter [OrchestrationHandlerFacet1.createSellerAndPremintedOffer(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._reservedRangeLength](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L164) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L164


 - [ ] ID-882
Parameter [DisputeHandlerFacet.extendDisputeTimeout(uint256,uint256)._exchangeId](contracts/protocol/facets/DisputeHandlerFacet.sol#L111) is not in mixedCase

contracts/protocol/facets/DisputeHandlerFacet.sol#L111


 - [ ] ID-883
Parameter [OrchestrationHandlerFacet1.createPremintedOfferAndTwinWithBundle(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Twin,uint256)._disputeResolverId](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L538) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L538


 - [ ] ID-884
Parameter [EIP712Lib.buildDomainSeparator(string,string)._version](contracts/protocol/libs/EIP712Lib.sol#L23) is not in mixedCase

contracts/protocol/libs/EIP712Lib.sol#L23


 - [ ] ID-885
Parameter [SellerBase.fetchSellerPendingUpdate(uint256)._sellerId](contracts/protocol/bases/SellerBase.sol#L192) is not in mixedCase

contracts/protocol/bases/SellerBase.sol#L192


 - [ ] ID-886
Parameter [MetaTransactionsHandlerFacet.isSpecialFunction(string)._functionName](contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L212) is not in mixedCase

contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L212


 - [ ] ID-887
Parameter [BosonVoucherBase.safeTransferFrom(address,address,uint256,bytes)._data](contracts/protocol/clients/voucher/BosonVoucher.sol#L416) is not in mixedCase

contracts/protocol/clients/voucher/BosonVoucher.sol#L416


 - [ ] ID-888
Parameter [OrchestrationHandlerFacet1.createSellerAndOfferWithCondition(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.Condition,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._offerDurations](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L758) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L758


 - [ ] ID-889
Parameter [SellerHandlerFacet.getSellerByAuthToken(BosonTypes.AuthToken)._associatedAuthToken](contracts/protocol/facets/SellerHandlerFacet.sol#L405) is not in mixedCase

contracts/protocol/facets/SellerHandlerFacet.sol#L405


 - [ ] ID-890
Parameter [OrchestrationHandlerFacet1.createSellerAndOffer(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._voucherInitValues](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L90) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L90


 - [ ] ID-891
Parameter [SnapshotGate.commitToGatedOffer(address,uint256,uint256)._tokenId](contracts/example/SnapshotGate/SnapshotGate.sol#L214) is not in mixedCase

contracts/example/SnapshotGate/SnapshotGate.sol#L214


 - [ ] ID-892
Function [ERC721EnumerableUpgradeable.__ERC721Enumerable_init_unchained()](node_modules/@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol#L19-L20) is not in mixedCase

node_modules/@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol#L19-L20


 - [ ] ID-893
Parameter [OfferBase.storeOffer(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256)._offerDurations](contracts/protocol/bases/OfferBase.sol#L111) is not in mixedCase

contracts/protocol/bases/OfferBase.sol#L111


 - [ ] ID-894
Parameter [OrchestrationHandlerFacet1.createSellerAndPremintedOfferWithCondition(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Condition,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._agentId](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L845) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L845


 - [ ] ID-895
Parameter [OrchestrationHandlerFacet1.createPremintedOfferWithCondition(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Condition,uint256)._offerDates](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L290) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L290


 - [ ] ID-896
Parameter [OrchestrationHandlerFacet1.createPremintedOfferAndTwinWithBundle(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Twin,uint256)._offer](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L535) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L535


 - [ ] ID-897
Parameter [BosonVoucherBase.reserveRange(uint256,uint256,uint256)._offerId](contracts/protocol/clients/voucher/BosonVoucher.sol#L161) is not in mixedCase

contracts/protocol/clients/voucher/BosonVoucher.sol#L161


 - [ ] ID-898
Parameter [BosonVoucherBase.transferFrom(address,address,uint256)._to](contracts/protocol/clients/voucher/BosonVoucher.sol#L394) is not in mixedCase

contracts/protocol/clients/voucher/BosonVoucher.sol#L394


 - [ ] ID-899
Parameter [OfferHandlerFacet.createOfferBatch(BosonTypes.Offer[],BosonTypes.OfferDates[],BosonTypes.OfferDurations[],uint256[],uint256[])._offerDurations](contracts/protocol/facets/OfferHandlerFacet.sol#L105) is not in mixedCase

contracts/protocol/facets/OfferHandlerFacet.sol#L105


 - [ ] ID-900
Parameter [BosonVoucherBase.preMint(uint256,uint256)._offerId](contracts/protocol/clients/voucher/BosonVoucher.sol#L215) is not in mixedCase

contracts/protocol/clients/voucher/BosonVoucher.sol#L215


 - [ ] ID-901
Parameter [EIP712Lib.verify(address,bytes32,bytes32,bytes32,uint8)._sigV](contracts/protocol/libs/EIP712Lib.sol#L54) is not in mixedCase

contracts/protocol/libs/EIP712Lib.sol#L54


 - [ ] ID-902
Parameter [FundsHandlerFacet.depositFunds(uint256,address,uint256)._amount](contracts/protocol/facets/FundsHandlerFacet.sol#L49) is not in mixedCase

contracts/protocol/facets/FundsHandlerFacet.sol#L49


 - [ ] ID-903
Parameter [JewelerLib.initializeDiamondCut(address,bytes)._calldata](contracts/diamond/JewelerLib.sol#L271) is not in mixedCase

contracts/diamond/JewelerLib.sol#L271


 - [ ] ID-904
Parameter [Foreign1155.mint(uint256,uint256)._supply](contracts/mock/Foreign1155.sol#L17) is not in mixedCase

contracts/mock/Foreign1155.sol#L17


 - [ ] ID-905
Parameter [DisputeBase.raiseDisputeInternal(BosonTypes.Exchange,BosonTypes.Voucher,uint256)._voucher](contracts/protocol/bases/DisputeBase.sol#L31) is not in mixedCase

contracts/protocol/bases/DisputeBase.sol#L31


 - [ ] ID-906
Parameter [ProtocolBase.fetchOfferDates(uint256)._offerId](contracts/protocol/bases/ProtocolBase.sol#L392) is not in mixedCase

contracts/protocol/bases/ProtocolBase.sol#L392


 - [ ] ID-907
Parameter [ClientExternalAddressesBase.setProtocolAddress(address)._protocolAddress](contracts/protocol/bases/ClientExternalAddressesBase.sol#L116) is not in mixedCase

contracts/protocol/bases/ClientExternalAddressesBase.sol#L116


 - [ ] ID-908
Parameter [ConfigHandlerFacet.initialize(ProtocolLib.ProtocolAddresses,ProtocolLib.ProtocolLimits,ProtocolLib.ProtocolFees)._limits](contracts/protocol/facets/ConfigHandlerFacet.sol#L28) is not in mixedCase

contracts/protocol/facets/ConfigHandlerFacet.sol#L28


 - [ ] ID-909
Parameter [SnapshotGate.commitToGatedOffer(address,uint256,uint256)._offerId](contracts/example/SnapshotGate/SnapshotGate.sol#L213) is not in mixedCase

contracts/example/SnapshotGate/SnapshotGate.sol#L213


 - [ ] ID-910
Parameter [OrchestrationHandlerFacet1.createSellerAndOfferWithConditionAndTwinAndBundle(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.Condition,BosonTypes.Twin,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._twin](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1124) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1124


 - [ ] ID-911
Parameter [MockExchangeHandlerFacet.extendVoucher(uint256,uint256)._exchangeId](contracts/mock/MockExchangeHandlerFacet.sol#L226) is not in mixedCase

contracts/mock/MockExchangeHandlerFacet.sol#L226


 - [ ] ID-912
Parameter [MetaTransactionsHandlerFacet.validateTx(string,bytes,uint256,address)._userAddress](contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L189) is not in mixedCase

contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L189


 - [ ] ID-913
Parameter [OrchestrationHandlerFacet1.createSellerAndPremintedOffer(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._offerDurations](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L162) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L162


 - [ ] ID-914
Parameter [MetaTransactionsHandlerFacet.setAllowlistedFunctions(bytes32[],bool)._isAllowlisted](contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L331) is not in mixedCase

contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L331


 - [ ] ID-915
Parameter [DisputeResolverHandlerFacet.preUpdateDisputeResolverCheck(uint256,address,ProtocolLib.ProtocolLookups)._lookups](contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L839) is not in mixedCase

contracts/protocol/facets/DisputeResolverHandlerFacet.sol#L839


 - [ ] ID-916
Parameter [BosonVoucherBase.safeTransferFrom(address,address,uint256,bytes)._to](contracts/protocol/clients/voucher/BosonVoucher.sol#L414) is not in mixedCase

contracts/protocol/clients/voucher/BosonVoucher.sol#L414


 - [ ] ID-917
Parameter [ExchangeHandlerFacet.commitToOffer(address,uint256)._offerId](contracts/protocol/facets/ExchangeHandlerFacet.sol#L62) is not in mixedCase

contracts/protocol/facets/ExchangeHandlerFacet.sol#L62


 - [ ] ID-918
Parameter [SellerHandlerFacet.createSeller(BosonTypes.Seller,BosonTypes.AuthToken,BosonTypes.VoucherInitValues)._authToken](contracts/protocol/facets/SellerHandlerFacet.sol#L47) is not in mixedCase

contracts/protocol/facets/SellerHandlerFacet.sol#L47


 - [ ] ID-919
Parameter [ProtocolInitializationHandlerFacet.initialize(bytes32,address[],bytes[],bool,bytes,bytes4[],bytes4[])._initializationData](contracts/protocol/facets/ProtocolInitializationHandlerFacet.sol#L45) is not in mixedCase

contracts/protocol/facets/ProtocolInitializationHandlerFacet.sol#L45


 - [ ] ID-920
Parameter [GroupBase.preUpdateChecks(uint256,uint256[])._groupId](contracts/protocol/bases/GroupBase.sol#L194) is not in mixedCase

contracts/protocol/bases/GroupBase.sol#L194


 - [ ] ID-921
Parameter [BundleBase.getValidTwin(uint256)._twinId](contracts/protocol/bases/BundleBase.sol#L119) is not in mixedCase

contracts/protocol/bases/BundleBase.sol#L119


 - [ ] ID-922
Parameter [OrchestrationHandlerFacet1.createSellerAndPremintedOffer(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._seller](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L159) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L159


 - [ ] ID-923
Function [ContextUpgradeable.__Context_init()](node_modules/@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol#L18-L19) is not in mixedCase

node_modules/@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol#L18-L19


 - [ ] ID-924
Parameter [ConfigHandlerFacet.setMaxAllowedSellers(uint16)._maxAllowedSellers](contracts/protocol/facets/ConfigHandlerFacet.sol#L562) is not in mixedCase

contracts/protocol/facets/ConfigHandlerFacet.sol#L562


 - [ ] ID-925
Parameter [ProtocolBase.fetchAgentIdByOffer(uint256)._offerId](contracts/protocol/bases/ProtocolBase.sol#L677) is not in mixedCase

contracts/protocol/bases/ProtocolBase.sol#L677


 - [ ] ID-926
Parameter [OrchestrationHandlerFacet1.createPremintedOfferAddToGroup(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,uint256,uint256)._agentId](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L414) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L414


 - [ ] ID-927
Parameter [FundsHandlerFacet.withdrawFundsInternal(address,uint256,address[],uint256[])._tokenList](contracts/protocol/facets/FundsHandlerFacet.sol#L218) is not in mixedCase

contracts/protocol/facets/FundsHandlerFacet.sol#L218


 - [ ] ID-928
Parameter [DisputeHandlerFacet.resolveDispute(uint256,uint256,bytes32,bytes32,uint8)._exchangeId](contracts/protocol/facets/DisputeHandlerFacet.sol#L236) is not in mixedCase

contracts/protocol/facets/DisputeHandlerFacet.sol#L236


 - [ ] ID-929
Parameter [MockExchangeHandlerFacet.expireVoucher(uint256)._exchangeId](contracts/mock/MockExchangeHandlerFacet.sol#L194) is not in mixedCase

contracts/mock/MockExchangeHandlerFacet.sol#L194


 - [ ] ID-930
Parameter [MockExchangeHandlerFacet.completeExchangeBatch(uint256[])._exchangeIds](contracts/mock/MockExchangeHandlerFacet.sol#L111) is not in mixedCase

contracts/mock/MockExchangeHandlerFacet.sol#L111


 - [ ] ID-931
Parameter [ExchangeHandlerFacet.getExchangeState(uint256)._exchangeId](contracts/protocol/facets/ExchangeHandlerFacet.sol#L600) is not in mixedCase

contracts/protocol/facets/ExchangeHandlerFacet.sol#L600


 - [ ] ID-932
Parameter [FundsLib.releaseFunds(uint256)._exchangeId](contracts/protocol/libs/FundsLib.sol#L134) is not in mixedCase

contracts/protocol/libs/FundsLib.sol#L134


 - [ ] ID-933
Parameter [SellerHandlerFacet.createSeller(BosonTypes.Seller,BosonTypes.AuthToken,BosonTypes.VoucherInitValues)._seller](contracts/protocol/facets/SellerHandlerFacet.sol#L46) is not in mixedCase

contracts/protocol/facets/SellerHandlerFacet.sol#L46


 - [ ] ID-934
Parameter [ConfigHandlerFacet.setAuthTokenContract(BosonTypes.AuthTokenType,address)._authTokenContract](contracts/protocol/facets/ConfigHandlerFacet.sol#L633) is not in mixedCase

contracts/protocol/facets/ConfigHandlerFacet.sol#L633


 - [ ] ID-935
Parameter [OrchestrationHandlerFacet1.createPremintedOfferWithConditionAndTwinAndBundle(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Condition,BosonTypes.Twin,uint256)._offerDates](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L673) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L673


 - [ ] ID-936
Parameter [SellerBase.cloneBosonVoucher(uint256,address,BosonTypes.VoucherInitValues)._voucherInitValues](contracts/protocol/bases/SellerBase.sol#L162) is not in mixedCase

contracts/protocol/bases/SellerBase.sol#L162


 - [ ] ID-937
Parameter [BeaconClientProxy.initialize(address)._beaconAddress](contracts/protocol/clients/proxy/BeaconClientProxy.sol#L29) is not in mixedCase

contracts/protocol/clients/proxy/BeaconClientProxy.sol#L29


 - [ ] ID-938
Parameter [OrchestrationHandlerFacet1.createOfferWithCondition(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.Condition,uint256)._agentId](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L226) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L226


 - [ ] ID-939
Parameter [DisputeHandlerFacet.expireDisputeBatch(uint256[])._exchangeIds](contracts/protocol/facets/DisputeHandlerFacet.sol#L202) is not in mixedCase

contracts/protocol/facets/DisputeHandlerFacet.sol#L202


 - [ ] ID-940
Function [ERC165Upgradeable.__ERC165_init()](node_modules/@openzeppelin/contracts-upgradeable/utils/introspection/ERC165Upgradeable.sol#L24-L25) is not in mixedCase

node_modules/@openzeppelin/contracts-upgradeable/utils/introspection/ERC165Upgradeable.sol#L24-L25


 - [ ] ID-941
Parameter [ExchangeHandlerFacet.isExchangeFinalized(uint256)._exchangeId](contracts/protocol/facets/ExchangeHandlerFacet.sol#L543) is not in mixedCase

contracts/protocol/facets/ExchangeHandlerFacet.sol#L543


 - [ ] ID-942
Parameter [BeaconClientBase.onVoucherTransferred(uint256,address)._newBuyer](contracts/protocol/bases/BeaconClientBase.sol#L80) is not in mixedCase

contracts/protocol/bases/BeaconClientBase.sol#L80


 - [ ] ID-943
Parameter [OfferHandlerFacet.createOffer(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256)._offerDates](contracts/protocol/facets/OfferHandlerFacet.sol#L58) is not in mixedCase

contracts/protocol/facets/OfferHandlerFacet.sol#L58


 - [ ] ID-944
Parameter [Foreign20Malicious2.setMetaTxBytes(address,bytes,bytes32,bytes32,uint8)._sigV](contracts/mock/Foreign20.sol#L139) is not in mixedCase

contracts/mock/Foreign20.sol#L139


 - [ ] ID-945
Parameter [OrchestrationHandlerFacet1.createPremintedOfferAddToGroup(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,uint256,uint256)._groupId](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L413) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L413


 - [ ] ID-946
Parameter [BeaconClientBase.getBosonOffer(uint256)._offerId](contracts/protocol/bases/BeaconClientBase.sol#L57) is not in mixedCase

contracts/protocol/bases/BeaconClientBase.sol#L57


 - [ ] ID-947
Parameter [OrchestrationHandlerFacet1.createSellerAndPremintedOfferAndTwinWithBundle(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Twin,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._authToken](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1027) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1027


 - [ ] ID-948
Parameter [DisputeHandlerFacet.resolveDispute(uint256,uint256,bytes32,bytes32,uint8)._sigR](contracts/protocol/facets/DisputeHandlerFacet.sol#L238) is not in mixedCase

contracts/protocol/facets/DisputeHandlerFacet.sol#L238


 - [ ] ID-949
Parameter [OfferBase.createOfferInternal(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256)._agentId](contracts/protocol/bases/OfferBase.sol#L53) is not in mixedCase

contracts/protocol/bases/OfferBase.sol#L53


 - [ ] ID-950
Parameter [BosonVoucherBase.setContractURI(string)._newContractURI](contracts/protocol/clients/voucher/BosonVoucher.sol#L518) is not in mixedCase

contracts/protocol/clients/voucher/BosonVoucher.sol#L518


 - [ ] ID-951
Parameter [BosonVoucherBase.tokenURI(uint256)._exchangeId](contracts/protocol/clients/voucher/BosonVoucher.sol#L467) is not in mixedCase

contracts/protocol/clients/voucher/BosonVoucher.sol#L467


 - [ ] ID-952
Parameter [BuyerBase.storeBuyer(BosonTypes.Buyer)._buyer](contracts/protocol/bases/BuyerBase.sol#L52) is not in mixedCase

contracts/protocol/bases/BuyerBase.sol#L52


 - [ ] ID-953
Parameter [DiamondCutFacet.diamondCut(IDiamondCut.FacetCut[],address,bytes)._calldata](contracts/diamond/facets/DiamondCutFacet.sol#L40) is not in mixedCase

contracts/diamond/facets/DiamondCutFacet.sol#L40


 - [ ] ID-954
Parameter [DisputeHandlerFacet.retractDispute(uint256)._exchangeId](contracts/protocol/facets/DisputeHandlerFacet.sol#L67) is not in mixedCase

contracts/protocol/facets/DisputeHandlerFacet.sol#L67


 - [ ] ID-955
Parameter [MetaTransactionsHandlerFacet.executeTx(address,string,bytes,uint256)._functionSignature](contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L239) is not in mixedCase

contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L239


 - [ ] ID-956
Parameter [ProtocolBase.fetchOffer(uint256)._offerId](contracts/protocol/bases/ProtocolBase.sol#L378) is not in mixedCase

contracts/protocol/bases/ProtocolBase.sol#L378


 - [ ] ID-957
Parameter [ConfigHandlerFacet.setMaxTokensPerWithdrawal(uint16)._maxTokensPerWithdrawal](contracts/protocol/facets/ConfigHandlerFacet.sol#L364) is not in mixedCase

contracts/protocol/facets/ConfigHandlerFacet.sol#L364


 - [ ] ID-958
Parameter [MetaTransactionsHandlerFacet.executeMetaTransaction(address,string,bytes,uint256,bytes32,bytes32,uint8)._sigV](contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L294) is not in mixedCase

contracts/protocol/facets/MetaTransactionsHandlerFacet.sol#L294


 - [ ] ID-959
Parameter [FundsLib.encumberFunds(uint256,uint256,bool)._isPreminted](contracts/protocol/libs/FundsLib.sol#L68) is not in mixedCase

contracts/protocol/libs/FundsLib.sol#L68


 - [ ] ID-960
Parameter [SellerHandlerFacet.updateSeller(BosonTypes.Seller,BosonTypes.AuthToken)._authToken](contracts/protocol/facets/SellerHandlerFacet.sol#L77) is not in mixedCase

contracts/protocol/facets/SellerHandlerFacet.sol#L77


 - [ ] ID-961
Parameter [ProtocolBase.fetchSeller(uint256)._sellerId](contracts/protocol/bases/ProtocolBase.sol#L289) is not in mixedCase

contracts/protocol/bases/ProtocolBase.sol#L289


 - [ ] ID-962
Parameter [OrchestrationHandlerFacet1.createSellerAndPremintedOfferAndTwinWithBundle(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256,BosonTypes.Twin,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._twin](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1026) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L1026


 - [ ] ID-963
Parameter [Foreign721.mint(uint256,uint256)._tokenId](contracts/mock/Foreign721.sol#L20) is not in mixedCase

contracts/mock/Foreign721.sol#L20


 - [ ] ID-964
Parameter [OrchestrationHandlerFacet1.createSellerAndOfferAndTwinWithBundle(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.Twin,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._offerDurations](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L934) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L934


 - [ ] ID-965
Parameter [OfferBase.createOfferInternal(BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,uint256)._offerDates](contracts/protocol/bases/OfferBase.sol#L50) is not in mixedCase

contracts/protocol/bases/OfferBase.sol#L50


 - [ ] ID-966
Parameter [OrchestrationHandlerFacet1.createSellerAndOfferWithCondition(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.Condition,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._disputeResolverId](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L759) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L759


 - [ ] ID-967
Parameter [Test3Facet.initialize(address)._testAddress](contracts/mock/Test3Facet.sol#L24) is not in mixedCase

contracts/mock/Test3Facet.sol#L24


 - [ ] ID-968
Parameter [OrchestrationHandlerFacet1.createSellerAndOfferAndTwinWithBundle(BosonTypes.Seller,BosonTypes.Offer,BosonTypes.OfferDates,BosonTypes.OfferDurations,uint256,BosonTypes.Twin,BosonTypes.AuthToken,BosonTypes.VoucherInitValues,uint256)._seller](contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L931) is not in mixedCase

contracts/protocol/facets/OrchestrationHandlerFacet1.sol#L931


 - [ ] ID-969
Function [ERC721Upgradeable.__ERC721_init(string,string)](node_modules/@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol#L45-L47) is not in mixedCase

node_modules/@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol#L45-L47


 - [ ] ID-970
Function [ERC721EnumerableUpgradeable.__ERC721Enumerable_init()](node_modules/@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol#L16-L17) is not in mixedCase

node_modules/@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol#L16-L17


## similar-names
Impact: Informational
Confidence: Medium
 - [ ] ID-971
Variable [IBosonExchangeHandler.commitToPreMintedOffer(address,uint256,uint256)._exchangeId](contracts/interfaces/handlers/IBosonExchangeHandler.sol#L70) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/interfaces/handlers/IBosonExchangeHandler.sol#L70


 - [ ] ID-972
Variable [DisputeHandlerFacet.escalateDispute(uint256)._exchangeId](contracts/protocol/facets/DisputeHandlerFacet.sol#L324) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/protocol/facets/DisputeHandlerFacet.sol#L324


 - [ ] ID-973
Variable [DisputeHandlerFacet.retractDispute(uint256)._exchangeId](contracts/protocol/facets/DisputeHandlerFacet.sol#L67) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/protocol/facets/DisputeHandlerFacet.sol#L67


 - [ ] ID-974
Variable [MockExchangeHandlerFacet.redeemVoucher(uint256)._exchangeId](contracts/mock/MockExchangeHandlerFacet.sol#L271) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/mock/MockExchangeHandlerFacet.sol#L271


 - [ ] ID-975
Variable [IBosonExchangeHandler.onVoucherTransferred(uint256,address)._exchangeId](contracts/interfaces/handlers/IBosonExchangeHandler.sol#L200) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/interfaces/handlers/IBosonExchangeHandler.sol#L200


 - [ ] ID-976
Variable [DisputeHandlerFacet.finalizeDispute(uint256,BosonTypes.Exchange,BosonTypes.Dispute,BosonTypes.DisputeDates,BosonTypes.DisputeState,uint256)._exchangeId](contracts/protocol/facets/DisputeHandlerFacet.sol#L439) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/protocol/facets/DisputeHandlerFacet.sol#L439


 - [ ] ID-977
Variable [DisputeBase.escalateDisputeInternal(uint256)._exchangeId](contracts/protocol/bases/DisputeBase.sol#L87) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/protocol/bases/DisputeBase.sol#L87


 - [ ] ID-978
Variable [MockExchangeHandlerFacet.expireVoucher(uint256)._exchangeId](contracts/mock/MockExchangeHandlerFacet.sol#L194) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/mock/MockExchangeHandlerFacet.sol#L194


 - [ ] ID-979
Variable [DisputeHandlerFacet.getDisputeTimeout(uint256)._exchangeId](contracts/protocol/facets/DisputeHandlerFacet.sol#L501) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/protocol/facets/DisputeHandlerFacet.sol#L501


 - [ ] ID-980
Variable [ProtocolBase.getValidExchange(uint256,BosonTypes.ExchangeState)._exchangeId](contracts/protocol/bases/ProtocolBase.sol#L645) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/protocol/bases/ProtocolBase.sol#L645


 - [ ] ID-981
Variable [MockExchangeHandlerFacet.extendVoucher(uint256,uint256)._exchangeId](contracts/mock/MockExchangeHandlerFacet.sol#L226) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/mock/MockExchangeHandlerFacet.sol#L226


 - [ ] ID-982
Variable [DisputeHandlerFacet.disputeResolverChecks(uint256)._exchangeId](contracts/protocol/facets/DisputeHandlerFacet.sol#L545) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/protocol/facets/DisputeHandlerFacet.sol#L545


 - [ ] ID-983
Variable [IBosonExchangeHandler.cancelVoucher(uint256)._exchangeId](contracts/interfaces/handlers/IBosonExchangeHandler.sol#L133) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/interfaces/handlers/IBosonExchangeHandler.sol#L133


 - [ ] ID-984
Variable [ExchangeHandlerFacet.commitToOfferInternal(address,BosonTypes.Offer,uint256,bool)._exchangeId](contracts/protocol/facets/ExchangeHandlerFacet.sol#L153) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/protocol/facets/ExchangeHandlerFacet.sol#L153


 - [ ] ID-985
Variable [DisputeHandlerFacet.resolveDispute(uint256,uint256,bytes32,bytes32,uint8)._exchangeId](contracts/protocol/facets/DisputeHandlerFacet.sol#L236) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/protocol/facets/DisputeHandlerFacet.sol#L236


 - [ ] ID-986
Variable [IBosonDisputeHandler.decideDispute(uint256,uint256)._exchangeId](contracts/interfaces/handlers/IBosonDisputeHandler.sol#L176) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/interfaces/handlers/IBosonDisputeHandler.sol#L176


 - [ ] ID-987
Variable [IBosonDisputeHandler.expireEscalatedDispute(uint256)._exchangeId](contracts/interfaces/handlers/IBosonDisputeHandler.sol#L209) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/interfaces/handlers/IBosonDisputeHandler.sol#L209


 - [ ] ID-988
Variable [DisputeHandlerFacet.extendDisputeTimeout(uint256,uint256)._exchangeId](contracts/protocol/facets/DisputeHandlerFacet.sol#L111) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/protocol/facets/DisputeHandlerFacet.sol#L111


 - [ ] ID-989
Variable [IBosonExchangeHandler.completeExchange(uint256)._exchangeId](contracts/interfaces/handlers/IBosonExchangeHandler.sol#L86) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/interfaces/handlers/IBosonExchangeHandler.sol#L86


 - [ ] ID-990
Variable [IBosonExchangeHandler.expireVoucher(uint256)._exchangeId](contracts/interfaces/handlers/IBosonExchangeHandler.sol#L148) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/interfaces/handlers/IBosonExchangeHandler.sol#L148


 - [ ] ID-991
Variable [ExchangeHandlerFacet.onVoucherTransferred(uint256,address)._exchangeId](contracts/protocol/facets/ExchangeHandlerFacet.sol#L496) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/protocol/facets/ExchangeHandlerFacet.sol#L496


 - [ ] ID-992
Variable [IBosonDisputeHandler.isDisputeFinalized(uint256)._exchangeId](contracts/interfaces/handlers/IBosonDisputeHandler.sol#L256) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/interfaces/handlers/IBosonDisputeHandler.sol#L256


 - [ ] ID-993
Variable [ProtocolBase.fetchExchange(uint256)._exchangeId](contracts/protocol/bases/ProtocolBase.sol#L460) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/protocol/bases/ProtocolBase.sol#L460


 - [ ] ID-994
Variable [IBosonExchangeHandler.redeemVoucher(uint256)._exchangeId](contracts/interfaces/handlers/IBosonExchangeHandler.sol#L182) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/interfaces/handlers/IBosonExchangeHandler.sol#L182


 - [ ] ID-995
Variable [JewelerLib.addReplaceRemoveFacetSelectors(uint256,bytes32,address,IDiamondCut.FacetCutAction,bytes4[]).oldFacet_scope_2](contracts/diamond/JewelerLib.sol#L164) is too similar to [JewelerLib.addReplaceRemoveFacetSelectors(uint256,bytes32,address,IDiamondCut.FacetCutAction,bytes4[]).oldFacet_scope_5](contracts/diamond/JewelerLib.sol#L207)

contracts/diamond/JewelerLib.sol#L164


 - [ ] ID-996
Variable [DisputeHandlerFacet.decideDispute(uint256,uint256)._exchangeId](contracts/protocol/facets/DisputeHandlerFacet.sol#L345) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/protocol/facets/DisputeHandlerFacet.sol#L345


 - [ ] ID-997
Variable [DisputeHandlerFacet.refuseEscalatedDispute(uint256)._exchangeId](contracts/protocol/facets/DisputeHandlerFacet.sol#L376) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/protocol/facets/DisputeHandlerFacet.sol#L376


 - [ ] ID-998
Variable [IBosonDisputeHandler.getDisputeState(uint256)._exchangeId](contracts/interfaces/handlers/IBosonDisputeHandler.sol#L235) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/interfaces/handlers/IBosonDisputeHandler.sol#L235


 - [ ] ID-999
Variable [IBosonExchangeHandler.revokeVoucher(uint256)._exchangeId](contracts/interfaces/handlers/IBosonExchangeHandler.sol#L118) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/interfaces/handlers/IBosonExchangeHandler.sol#L118


 - [ ] ID-1000
Variable [ExchangeHandlerFacet.isExchangeFinalized(uint256)._exchangeId](contracts/protocol/facets/ExchangeHandlerFacet.sol#L543) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/protocol/facets/ExchangeHandlerFacet.sol#L543


 - [ ] ID-1001
Variable [IBosonDisputeHandler.getDisputeTimeout(uint256)._exchangeId](contracts/interfaces/handlers/IBosonDisputeHandler.sol#L244) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/interfaces/handlers/IBosonDisputeHandler.sol#L244


 - [ ] ID-1002
Variable [IBosonExchangeHandler.extendVoucher(uint256,uint256)._exchangeId](contracts/interfaces/handlers/IBosonExchangeHandler.sol#L165) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/interfaces/handlers/IBosonExchangeHandler.sol#L165


 - [ ] ID-1003
Variable [JewelerLib.addReplaceRemoveFacetSelectors(uint256,bytes32,address,IDiamondCut.FacetCutAction,bytes4[]).selectorIndex_scope_0](contracts/diamond/JewelerLib.sol#L161) is too similar to [JewelerLib.addReplaceRemoveFacetSelectors(uint256,bytes32,address,IDiamondCut.FacetCutAction,bytes4[]).selectorIndex_scope_3](contracts/diamond/JewelerLib.sol#L189)

contracts/diamond/JewelerLib.sol#L161


 - [ ] ID-1004
Variable [ExchangeHandlerFacet.cancelVoucher(uint256)._exchangeId](contracts/protocol/facets/ExchangeHandlerFacet.sol#L342) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/protocol/facets/ExchangeHandlerFacet.sol#L342


 - [ ] ID-1005
Variable [IBosonDisputeHandler.refuseEscalatedDispute(uint256)._exchangeId](contracts/interfaces/handlers/IBosonDisputeHandler.sol#L193) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/interfaces/handlers/IBosonDisputeHandler.sol#L193


 - [ ] ID-1006
Variable [DisputeHandlerFacet.getDispute(uint256)._exchangeId](contracts/protocol/facets/DisputeHandlerFacet.sol#L468) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/protocol/facets/DisputeHandlerFacet.sol#L468


 - [ ] ID-1007
Variable [ExchangeHandlerFacet.revokeVoucher(uint256)._exchangeId](contracts/protocol/facets/ExchangeHandlerFacet.sol#L309) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/protocol/facets/ExchangeHandlerFacet.sol#L309


 - [ ] ID-1008
Variable [MockExchangeHandlerFacet.cancelVoucher(uint256)._exchangeId](contracts/mock/MockExchangeHandlerFacet.sol#L167) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/mock/MockExchangeHandlerFacet.sol#L167


 - [ ] ID-1009
Variable [IBosonExchangeHandler.getExchangeState(uint256)._exchangeId](contracts/interfaces/handlers/IBosonExchangeHandler.sol#L239) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/interfaces/handlers/IBosonExchangeHandler.sol#L239


 - [ ] ID-1010
Variable [IBosonDisputeHandler.resolveDispute(uint256,uint256,bytes32,bytes32,uint8)._exchangeId](contracts/interfaces/handlers/IBosonDisputeHandler.sol#L125) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/interfaces/handlers/IBosonDisputeHandler.sol#L125


 - [ ] ID-1011
Variable [IBosonDisputeHandler.escalateDispute(uint256)._exchangeId](contracts/interfaces/handlers/IBosonDisputeHandler.sol#L157) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/interfaces/handlers/IBosonDisputeHandler.sol#L157


 - [ ] ID-1012
Variable [IBosonExchangeHandler.isExchangeFinalized(uint256)._exchangeId](contracts/interfaces/handlers/IBosonExchangeHandler.sol#L213) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/interfaces/handlers/IBosonExchangeHandler.sol#L213


 - [ ] ID-1013
Variable [ProtocolBase.fetchConditionByExchange(uint256)._exchangeId](contracts/protocol/bases/ProtocolBase.sol#L722) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/protocol/bases/ProtocolBase.sol#L722


 - [ ] ID-1014
Variable [DisputeHandlerFacet.getDisputeState(uint256)._exchangeId](contracts/protocol/facets/DisputeHandlerFacet.sol#L488) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/protocol/facets/DisputeHandlerFacet.sol#L488


 - [ ] ID-1015
Variable [ExchangeHandlerFacet.getExchange(uint256)._exchangeId](contracts/protocol/facets/ExchangeHandlerFacet.sol#L579) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/protocol/facets/ExchangeHandlerFacet.sol#L579


 - [ ] ID-1016
Variable [ProtocolBase.fetchTwinReceipts(uint256)._exchangeId](contracts/protocol/bases/ProtocolBase.sol#L703) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/protocol/bases/ProtocolBase.sol#L703


 - [ ] ID-1017
Variable [IBosonExchangeHandler.getExchange(uint256)._exchangeId](contracts/interfaces/handlers/IBosonExchangeHandler.sol#L223) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/interfaces/handlers/IBosonExchangeHandler.sol#L223


 - [ ] ID-1018
Variable [ExchangeHandlerFacet.completeExchange(uint256)._exchangeId](contracts/protocol/facets/ExchangeHandlerFacet.sol#L240) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/protocol/facets/ExchangeHandlerFacet.sol#L240


 - [ ] ID-1019
Variable [IBosonDisputeHandler.retractDispute(uint256)._exchangeId](contracts/interfaces/handlers/IBosonDisputeHandler.sol#L45) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/interfaces/handlers/IBosonDisputeHandler.sol#L45


 - [ ] ID-1020
Variable [DisputeHandlerFacet.expireDispute(uint256)._exchangeId](contracts/protocol/facets/DisputeHandlerFacet.sol#L166) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/protocol/facets/DisputeHandlerFacet.sol#L166


 - [ ] ID-1021
Variable [ProtocolBase.fetchDispute(uint256)._exchangeId](contracts/protocol/bases/ProtocolBase.sol#L486) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/protocol/bases/ProtocolBase.sol#L486


 - [ ] ID-1022
Variable [DisputeHandlerFacet.hashResolution(uint256,uint256)._exchangeId](contracts/protocol/facets/DisputeHandlerFacet.sol#L583) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/protocol/facets/DisputeHandlerFacet.sol#L583


 - [ ] ID-1023
Variable [MockExchangeHandlerFacet.revokeVoucher(uint256)._exchangeId](contracts/mock/MockExchangeHandlerFacet.sol#L134) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/mock/MockExchangeHandlerFacet.sol#L134


 - [ ] ID-1024
Variable [IBosonDisputeHandler.expireDispute(uint256)._exchangeId](contracts/interfaces/handlers/IBosonDisputeHandler.sol#L81) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/interfaces/handlers/IBosonDisputeHandler.sol#L81


 - [ ] ID-1025
Variable [IBosonDisputeHandler.raiseDispute(uint256)._exchangeId](contracts/interfaces/handlers/IBosonDisputeHandler.sol#L28) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/interfaces/handlers/IBosonDisputeHandler.sol#L28


 - [ ] ID-1026
Variable [OrchestrationHandlerFacet2.raiseAndEscalateDispute(uint256)._exchangeId](contracts/protocol/facets/OrchestrationHandlerFacet2.sol#L48) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/protocol/facets/OrchestrationHandlerFacet2.sol#L48


 - [ ] ID-1027
Variable [ExchangeHandlerFacet.redeemVoucher(uint256)._exchangeId](contracts/protocol/facets/ExchangeHandlerFacet.sol#L446) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/protocol/facets/ExchangeHandlerFacet.sol#L446


 - [ ] ID-1028
Variable [MockExchangeHandlerFacet.completeExchange(uint256)._exchangeId](contracts/mock/MockExchangeHandlerFacet.sol#L65) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/mock/MockExchangeHandlerFacet.sol#L65


 - [ ] ID-1029
Variable [IBosonExchangeHandler.getReceipt(uint256)._exchangeId](contracts/interfaces/handlers/IBosonExchangeHandler.sol#L260) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/interfaces/handlers/IBosonExchangeHandler.sol#L260


 - [ ] ID-1030
Variable [ExchangeHandlerFacet.extendVoucher(uint256,uint256)._exchangeId](contracts/protocol/facets/ExchangeHandlerFacet.sol#L401) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/protocol/facets/ExchangeHandlerFacet.sol#L401


 - [ ] ID-1031
Variable [JewelerLib.addReplaceRemoveFacetSelectors(uint256,bytes32,address,IDiamondCut.FacetCutAction,bytes4[]).selector_scope_1](contracts/diamond/JewelerLib.sol#L163) is too similar to [JewelerLib.addReplaceRemoveFacetSelectors(uint256,bytes32,address,IDiamondCut.FacetCutAction,bytes4[]).selector_scope_4](contracts/diamond/JewelerLib.sol#L206)

contracts/diamond/JewelerLib.sol#L163


 - [ ] ID-1032
Variable [ExchangeHandlerFacet.commitToPreMintedOffer(address,uint256,uint256)._exchangeId](contracts/protocol/facets/ExchangeHandlerFacet.sol#L108) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/protocol/facets/ExchangeHandlerFacet.sol#L108


 - [ ] ID-1033
Variable [ExchangeHandlerFacet.expireVoucher(uint256)._exchangeId](contracts/protocol/facets/ExchangeHandlerFacet.sol#L369) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/protocol/facets/ExchangeHandlerFacet.sol#L369


 - [ ] ID-1034
Variable [IBosonDisputeHandler.getDispute(uint256)._exchangeId](contracts/interfaces/handlers/IBosonDisputeHandler.sol#L219) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/interfaces/handlers/IBosonDisputeHandler.sol#L219


 - [ ] ID-1035
Variable [DisputeHandlerFacet.expireEscalatedDispute(uint256)._exchangeId](contracts/protocol/facets/DisputeHandlerFacet.sol#L403) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/protocol/facets/DisputeHandlerFacet.sol#L403


 - [ ] ID-1036
Variable [DisputeHandlerFacet.raiseDispute(uint256)._exchangeId](contracts/protocol/facets/DisputeHandlerFacet.sol#L41) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/protocol/facets/DisputeHandlerFacet.sol#L41


 - [ ] ID-1037
Variable [ExchangeHandlerFacet.getExchangeState(uint256)._exchangeId](contracts/protocol/facets/ExchangeHandlerFacet.sol#L600) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/protocol/facets/ExchangeHandlerFacet.sol#L600


 - [ ] ID-1038
Variable [IBosonDisputeHandler.extendDisputeTimeout(uint256,uint256)._exchangeId](contracts/interfaces/handlers/IBosonDisputeHandler.sol#L65) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/interfaces/handlers/IBosonDisputeHandler.sol#L65


 - [ ] ID-1039
Variable [ProtocolBase.fetchVoucher(uint256)._exchangeId](contracts/protocol/bases/ProtocolBase.sol#L474) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/protocol/bases/ProtocolBase.sol#L474


 - [ ] ID-1040
Variable [DisputeHandlerFacet.isDisputeFinalized(uint256)._exchangeId](contracts/protocol/facets/DisputeHandlerFacet.sol#L517) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/protocol/facets/DisputeHandlerFacet.sol#L517


 - [ ] ID-1041
Variable [ExchangeHandlerFacet.getReceipt(uint256)._exchangeId](contracts/protocol/facets/ExchangeHandlerFacet.sol#L961) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/protocol/facets/ExchangeHandlerFacet.sol#L961


 - [ ] ID-1042
Variable [MockExchangeHandlerFacetWithDefect.cancelVoucher(uint256)._exchangeId](contracts/mock/MockExchangeHandlerFacet.sol#L512) is too similar to [ProtocolBase.getExchangeIdsByOffer(uint256).exchangeIds](contracts/protocol/bases/ProtocolBase.sol#L608)

contracts/mock/MockExchangeHandlerFacet.sol#L512


## too-many-digits
Impact: Informational
Confidence: Medium
 - [ ] ID-1043
[SellerBase.cloneBosonVoucher(uint256,address,BosonTypes.VoucherInitValues)](contracts/protocol/bases/SellerBase.sol#L159-L182) uses literals with too many digits:
	- [mstore(uint256,uint256)(clone_cloneBosonVoucher_asm_0,0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000000000000000000000)](contracts/protocol/bases/SellerBase.sol#L173)

contracts/protocol/bases/SellerBase.sol#L159-L182


 - [ ] ID-1044
[SellerBase.cloneBosonVoucher(uint256,address,BosonTypes.VoucherInitValues)](contracts/protocol/bases/SellerBase.sol#L159-L182) uses literals with too many digits:
	- [mstore(uint256,uint256)(clone_cloneBosonVoucher_asm_0 + 0x28,0x5af43d82803e903d91602b57fd5bf30000000000000000000000000000000000)](contracts/protocol/bases/SellerBase.sol#L175)

contracts/protocol/bases/SellerBase.sol#L159-L182


 - [ ] ID-1045
[BosonVoucherBase.getERC721UpgradeableStorage()](contracts/protocol/clients/voucher/BosonVoucher.sol#L735-L739) uses literals with too many digits:
	- [ps = 0x0000000000000000000000000000000000000000000000000000000000000099](contracts/protocol/clients/voucher/BosonVoucher.sol#L737)

contracts/protocol/clients/voucher/BosonVoucher.sol#L735-L739


## unused-state
Impact: Informational
Confidence: High
 - [ ] ID-1046
[BosonVoucher.__gap](contracts/protocol/clients/voucher/BosonVoucher.sol#L781) is never used in [BosonVoucher](contracts/protocol/clients/voucher/BosonVoucher.sol#L752-L782)

contracts/protocol/clients/voucher/BosonVoucher.sol#L781


## immutable-states
Impact: Optimization
Confidence: High
 - [ ] ID-1047
[Foreign20Malicious.owner](contracts/mock/Foreign20.sol#L86) should be immutable 

contracts/mock/Foreign20.sol#L86


 - [ ] ID-1048
[Foreign20Malicious2.owner](contracts/mock/Foreign20.sol#L119) should be immutable 

contracts/mock/Foreign20.sol#L119


 - [ ] ID-1049
[SnapshotGate.protocol](contracts/example/SnapshotGate/SnapshotGate.sol#L81) should be immutable 

contracts/example/SnapshotGate/SnapshotGate.sol#L81


 - [ ] ID-1050
[SnapshotGate.sellerId](contracts/example/SnapshotGate/SnapshotGate.sol#L84) should be immutable 

contracts/example/SnapshotGate/SnapshotGate.sol#L84


 - [ ] ID-1051
[TestProtocolFunctions.protocol](contracts/mock/TestProtocolFunctions.sol#L13) should be immutable 

contracts/mock/TestProtocolFunctions.sol#L13


