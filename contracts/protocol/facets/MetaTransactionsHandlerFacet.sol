// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import "../../domain/BosonConstants.sol";
import { IBosonMetaTransactionsHandler } from "../../interfaces/handlers/IBosonMetaTransactionsHandler.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { ProtocolLib } from "../libs/ProtocolLib.sol";
import { ProtocolBase } from "../bases/ProtocolBase.sol";
import { EIP712Lib } from "../libs/EIP712Lib.sol";

/**
 * @title MetaTransactionsHandlerFacet
 *
 * @notice Handles meta-transaction requests.
 */
contract MetaTransactionsHandlerFacet is IBosonMetaTransactionsHandler, ProtocolBase {
    /**
     * @notice Initializes Facet.
     * This function is callable only once.
     *
     */
    function initialize(
        bytes32[] calldata _functionNameHashes
    ) public onlyUninitialized(type(IBosonMetaTransactionsHandler).interfaceId) {
        DiamondLib.addSupportedInterface(type(IBosonMetaTransactionsHandler).interfaceId);

        // Set types for special metatxs
        ProtocolLib.ProtocolMetaTxInfo storage pmti = protocolMetaTxInfo();

        // Set input type for the function name
        pmti.inputType[COMMIT_TO_OFFER] = MetaTxInputType.CommitToOffer;
        pmti.inputType[COMMIT_TO_CONDITIONAL_OFFER] = MetaTxInputType.CommitToConditionalOffer;
        pmti.inputType[WITHDRAW_FUNDS] = MetaTxInputType.Funds;
        pmti.inputType[RESOLVE_DISPUTE] = MetaTxInputType.ResolveDispute;
        pmti.inputType[CANCEL_VOUCHER] = MetaTxInputType.Exchange;
        pmti.inputType[REDEEM_VOUCHER] = MetaTxInputType.Exchange;
        pmti.inputType[COMPLETE_EXCHANGE] = MetaTxInputType.Exchange;
        pmti.inputType[RETRACT_DISPUTE] = MetaTxInputType.Exchange;
        pmti.inputType[ESCALATE_DISPUTE] = MetaTxInputType.Exchange;
        pmti.inputType[RAISE_DISPUTE] = MetaTxInputType.Exchange;

        // Set the hash info to the input type
        pmti.hashInfo[MetaTxInputType.Generic] = HashInfo(META_TRANSACTION_TYPEHASH, hashGenericDetails);
        pmti.hashInfo[MetaTxInputType.CommitToOffer] = HashInfo(META_TX_COMMIT_TO_OFFER_TYPEHASH, hashOfferDetails);
        pmti.hashInfo[MetaTxInputType.CommitToConditionalOffer] = HashInfo(
            META_TX_COMMIT_TO_CONDITIONAL_OFFER_TYPEHASH,
            hashConditionalOfferDetails
        );
        pmti.hashInfo[MetaTxInputType.Funds] = HashInfo(META_TX_FUNDS_TYPEHASH, hashFundDetails);
        pmti.hashInfo[MetaTxInputType.Exchange] = HashInfo(META_TX_EXCHANGE_TYPEHASH, hashExchangeDetails);
        pmti.hashInfo[MetaTxInputType.ResolveDispute] = HashInfo(
            META_TX_DISPUTE_RESOLUTIONS_TYPEHASH,
            hashDisputeResolutionDetails
        );

        setAllowlistedFunctionsInternal(_functionNameHashes, true);
    }

    /**
     * @notice Converts the given bytes to bytes4.
     *
     * @param _inBytes - the incoming bytes
     * @return _outBytes4 -  The outgoing bytes4
     */
    function convertBytesToBytes4(bytes memory _inBytes) internal pure returns (bytes4 _outBytes4) {
        assembly {
            _outBytes4 := mload(add(_inBytes, 32))
        }
    }

    /**
     * @notice Returns hashed meta transaction.
     *
     * @param _metaTx - the meta-transaction struct.
     * @return the hash of the meta-transaction details
     */
    function hashMetaTransaction(MetaTransaction memory _metaTx) internal view returns (bytes32) {
        // Cache protocol meta-tx info for reference
        ProtocolLib.ProtocolMetaTxInfo storage metaTxInfo = protocolMetaTxInfo();

        MetaTxInputType inputType = metaTxInfo.inputType[_metaTx.functionName];
        HashInfo memory hi = metaTxInfo.hashInfo[inputType];
        return
            keccak256(
                abi.encode(
                    hi.typeHash,
                    _metaTx.nonce,
                    _metaTx.from,
                    _metaTx.contractAddress,
                    keccak256(bytes(_metaTx.functionName)),
                    hi.hashFunction(_metaTx.functionSignature)
                )
            );
    }

    /**
     * @notice Returns hashed representation of the generic function signature.
     *
     * @param _functionSignature - the generic function signature
     * @return the hashed generic function signature
     */
    function hashGenericDetails(bytes memory _functionSignature) internal pure returns (bytes32) {
        return keccak256(_functionSignature);
    }

    /**
     * @notice Returns hashed representation of the offer details struct.
     *
     * @param _offerDetails - the offer details
     * @return the hashed representation of the offer details struct
     */
    function hashOfferDetails(bytes memory _offerDetails) internal pure returns (bytes32) {
        (address buyer, uint256 offerId) = abi.decode(_offerDetails, (address, uint256));
        return keccak256(abi.encode(OFFER_DETAILS_TYPEHASH, buyer, offerId));
    }

    /**
     * @notice Returns hashed representation of the conditional offer details struct.
     *
     * @param _offerDetails - the conditional offer details
     * @return the hashed representation of the conditional offer details struct
     */
    function hashConditionalOfferDetails(bytes memory _offerDetails) internal pure returns (bytes32) {
        (address buyer, uint256 offerId, uint256 tokenId) = abi.decode(_offerDetails, (address, uint256, uint256));
        return keccak256(abi.encode(CONDITIONAL_OFFER_DETAILS_TYPEHASH, buyer, offerId, tokenId));
    }

    /**
     * @notice Returns hashed representation of the exchange details struct.
     *
     * @param _exchangeDetails - the exchange details
     * @return the hashed representation of the exchange details struct
     */
    function hashExchangeDetails(bytes memory _exchangeDetails) internal pure returns (bytes32) {
        uint256 exchangeId = abi.decode(_exchangeDetails, (uint256));
        return keccak256(abi.encode(EXCHANGE_DETAILS_TYPEHASH, exchangeId));
    }

    /**
     * @notice Returns hashed representation of the fund details struct.
     *
     * @param _fundDetails - the fund details
     * @return the hashed representation of the fund details struct
     */
    function hashFundDetails(bytes memory _fundDetails) internal pure returns (bytes32) {
        (uint256 entityId, address[] memory tokenList, uint256[] memory tokenAmounts) = abi.decode(
            _fundDetails,
            (uint256, address[], uint256[])
        );
        return
            keccak256(
                abi.encode(
                    FUND_DETAILS_TYPEHASH,
                    entityId,
                    keccak256(abi.encodePacked(tokenList)),
                    keccak256(abi.encodePacked(tokenAmounts))
                )
            );
    }

    /**
     * @notice Returns hashed representation of the dispute resolution details struct.
     *
     * @param _disputeResolutionDetails - the dispute resolution details
     * @return the hashed representation of the dispute resolution details struct
     */
    function hashDisputeResolutionDetails(bytes memory _disputeResolutionDetails) internal pure returns (bytes32) {
        (uint256 exchangeId, uint256 buyerPercent, bytes memory signature) = abi.decode(
            _disputeResolutionDetails,
            (uint256, uint256, bytes)
        );
        return
            keccak256(abi.encode(DISPUTE_RESOLUTION_DETAILS_TYPEHASH, exchangeId, buyerPercent, keccak256(signature)));
    }

    /**
     * @notice Checks nonce and returns true if used already for a specific address.
     *
     * @param _associatedAddress the address for which the nonce should be checked
     * @param _nonce - the nonce that we want to check.
     * @return true if nonce has already been used
     */
    function isUsedNonce(address _associatedAddress, uint256 _nonce) external view override returns (bool) {
        return protocolMetaTxInfo().usedNonce[_associatedAddress][_nonce];
    }

    /**
     * @notice Validates the nonce and function signature.
     *
     * Reverts if:
     * - Nonce is already used by the msg.sender for another transaction
     * - Function is not allowlisted to be called using metatransactions
     * - Function name does not match the bytes4 version of the function signature
     *
     * @param _functionName - the function name that we want to execute
     * @param _functionSignature - the function signature
     * @param _nonce - the nonce value of the transaction
     */
    function validateTx(
        string calldata _functionName,
        bytes calldata _functionSignature,
        uint256 _nonce,
        address _userAddress
    ) internal view {
        ProtocolLib.ProtocolMetaTxInfo storage pmti = protocolMetaTxInfo();

        // Nonce should be unused
        if (pmti.usedNonce[_userAddress][_nonce]) revert NonceUsedAlready();

        // Function must be allowlisted
        bytes32 functionNameHash = keccak256(abi.encodePacked(_functionName));
        if (!pmti.isAllowlisted[functionNameHash]) revert FunctionNotAllowlisted();

        // Function name must correspond to selector
        bytes4 destinationFunctionSig = convertBytesToBytes4(_functionSignature);
        bytes4 functionNameSig = bytes4(functionNameHash);
        if (destinationFunctionSig != functionNameSig) revert InvalidFunctionName();
    }

    /**
     * @notice Checks if function name is a special function or a generic function.
     *
     * @param _functionName - the function name that we want to execute
     * @return true - if the function name is a special function (not the generic meta transaction function)
     */
    function isSpecialFunction(string calldata _functionName) internal view returns (bool) {
        return protocolMetaTxInfo().inputType[_functionName] != MetaTxInputType.Generic;
    }

    /**
     * @notice Executes the meta transaction.
     *
     * Reverts if:
     * - Any code executed in the signed transaction reverts
     *
     * @param _userAddress - the sender of the transaction
     * @param _functionName - the name of the function to be executed
     * @param _functionSignature - the function signature
     * @param _nonce - the nonce value of the transaction
     */
    function executeTx(
        address _userAddress,
        string calldata _functionName,
        bytes calldata _functionSignature,
        uint256 _nonce
    ) internal returns (bytes memory) {
        // Cache protocol meta-tx info for reference
        ProtocolLib.ProtocolMetaTxInfo storage metaTxInfo = protocolMetaTxInfo();

        // Store the nonce provided to avoid playback of the same tx
        metaTxInfo.usedNonce[_userAddress][_nonce] = true;

        // Invoke local function with an external call
        (bool success, bytes memory returnData) = address(this).call{ value: msg.value }(
            abi.encodePacked(_functionSignature, _userAddress)
        );

        // If error, return error message
        if (!success) {
            if (returnData.length > 0) {
                // bubble up the error
                assembly {
                    revert(add(32, returnData), mload(returnData))
                }
            } else {
                // Reverts with default message
                revert(FUNCTION_CALL_NOT_SUCCESSFUL);
            }
        }

        emit MetaTransactionExecuted(_userAddress, msg.sender, _functionName, _nonce);
        return returnData;
    }

    /**
     * @notice Handles the incoming meta transaction.
     *
     * Reverts if:
     * - The meta-transactions region of protocol is paused
     * - Nonce is already used by the msg.sender for another transaction
     * - Function is not allowlisted to be called using metatransactions
     * - Function name does not match the bytes4 version of the function signature
     * - sender does not match the recovered signer
     * - Any code executed in the signed transaction reverts
     * - Signature is invalid
     *
     * @param _userAddress - the sender of the transaction
     * @param _functionName - the name of the function to be executed
     * @param _functionSignature - the function signature
     * @param _nonce - the nonce value of the transaction
     * @param _signature - meta transaction signature. If the signer is EOA, it must be ECDSA signature in the format of (r,s,v) struct, otherwise, it must be a valid ERC1271 signature.
     */
    function executeMetaTransaction(
        address _userAddress,
        string calldata _functionName,
        bytes calldata _functionSignature,
        uint256 _nonce,
        bytes calldata _signature
    ) external payable override metaTransactionsNotPaused returns (bytes memory) {
        // Make sure that protocol is not reentered through meta transactions
        // Cannot use modifier `nonReentrant` since it also changes reentrancyStatus to `ENTERED`,
        // but that then breaks meta transaction functionality
        if (protocolStatus().reentrancyStatus == ENTERED) revert ReentrancyGuard();

        validateTx(_functionName, _functionSignature, _nonce, _userAddress);

        MetaTransaction memory metaTx;
        metaTx.nonce = _nonce;
        metaTx.from = _userAddress;
        metaTx.contractAddress = address(this);
        metaTx.functionName = _functionName;
        metaTx.functionSignature = isSpecialFunction(_functionName)
            ? bytes(_functionSignature[4:])
            : _functionSignature;

        EIP712Lib.verify(_userAddress, hashMetaTransaction(metaTx), _signature);

        return executeTx(_userAddress, _functionName, _functionSignature, _nonce);
    }

    /**
     * @notice Manages allow list of functions that can be executed using metatransactions.
     *
     * Emits a FunctionsAllowlisted event if successful.
     *
     * Reverts if:
     * - Caller is not a protocol admin
     *
     * @param _functionNameHashes - a list of hashed function names (keccak256)
     * @param _isAllowlisted - new allowlist status
     */
    function setAllowlistedFunctions(
        bytes32[] calldata _functionNameHashes,
        bool _isAllowlisted
    ) public override onlyRole(ADMIN) nonReentrant {
        setAllowlistedFunctionsInternal(_functionNameHashes, _isAllowlisted);
    }

    /**
     * @notice Tells if function can be executed as meta transaction or not.
     *
     * @param _functionNameHash - hashed function name (keccak256)
     * @return isAllowlisted - allowlist status
     */
    function isFunctionAllowlisted(bytes32 _functionNameHash) external view override returns (bool isAllowlisted) {
        return protocolMetaTxInfo().isAllowlisted[_functionNameHash];
    }

    /**
     * @notice Tells if function can be executed as meta transaction or not.
     *
     * @param _functionName - function name
     * @return isAllowlisted - allowlist status
     */
    function isFunctionAllowlisted(string calldata _functionName) external view override returns (bool isAllowlisted) {
        return protocolMetaTxInfo().isAllowlisted[keccak256(abi.encodePacked(_functionName))];
    }

    /**
     * @notice Internal function that manages allow list of functions that can be executed using metatransactions.
     *
     * Emits a FunctionsAllowlisted event if successful.
     *
     * @param _functionNameHashes - a list of hashed function names (keccak256)
     * @param _isAllowlisted - new allowlist status
     */
    function setAllowlistedFunctionsInternal(bytes32[] calldata _functionNameHashes, bool _isAllowlisted) private {
        ProtocolLib.ProtocolMetaTxInfo storage pmti = protocolMetaTxInfo();

        // set new values
        for (uint256 i = 0; i < _functionNameHashes.length; ) {
            pmti.isAllowlisted[_functionNameHashes[i]] = _isAllowlisted;

            unchecked {
                i++;
            }
        }

        // Notify external observers
        emit FunctionsAllowlisted(_functionNameHashes, _isAllowlisted, msgSender());
    }
}
