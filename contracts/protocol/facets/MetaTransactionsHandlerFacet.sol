// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.9;

import "../../domain/BosonConstants.sol";
import { IBosonMetaTransactionsHandler } from "../../interfaces/handlers/IBosonMetaTransactionsHandler.sol";
import { IBosonDisputeHandler } from "../../interfaces/handlers/IBosonDisputeHandler.sol";
import { IBosonExchangeHandler } from "../../interfaces/handlers/IBosonExchangeHandler.sol";
import { IBosonFundsHandler } from "../../interfaces/handlers/IBosonFundsHandler.sol";
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
     */
    function initialize() public onlyUnInitialized(type(IBosonMetaTransactionsHandler).interfaceId) {
        DiamondLib.addSupportedInterface(type(IBosonMetaTransactionsHandler).interfaceId);

        // Set types for special metatxs
        ProtocolLib.ProtocolMetaTxInfo storage pmti = protocolMetaTxInfo();

        // Set input type for the function name
        pmti.inputType[COMMIT_TO_OFFER] = MetaTxInputType.CommitToOffer;
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
        pmti.hashInfo[MetaTxInputType.Funds] = HashInfo(META_TX_FUNDS_TYPEHASH, hashFundDetails);
        pmti.hashInfo[MetaTxInputType.Exchange] = HashInfo(META_TX_EXCHANGE_TYPEHASH, hashExchangeDetails);
        pmti.hashInfo[MetaTxInputType.ResolveDispute] = HashInfo(
            META_TX_DISPUTE_RESOLUTIONS_TYPEHASH,
            hashDisputeResolutionDetails
        );
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
        (uint256 exchangeId, uint256 buyerPercent, bytes32 sigR, bytes32 sigS, uint8 sigV) = abi.decode(
            _disputeResolutionDetails,
            (uint256, uint256, bytes32, bytes32, uint8)
        );
        return keccak256(abi.encode(DISPUTE_RESOLUTION_DETAILS_TYPEHASH, exchangeId, buyerPercent, sigR, sigS, sigV));
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
     * - Function is not whitelisted to be called using metatransactions
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
        require(!pmti.usedNonce[_userAddress][_nonce], NONCE_USED_ALREADY);

        // Function must be whitelisted
        require(pmti.isWhitelisted[_functionName], FUNCTION_NOT_WHITELISTED);

        // Function name must correspond to selector
        bytes4 destinationFunctionSig = convertBytesToBytes4(_functionSignature);
        bytes4 functionNameSig = bytes4(keccak256(abi.encodePacked(_functionName)));
        require(destinationFunctionSig == functionNameSig, INVALID_FUNCTION_NAME);
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
     * @notice Sets the current transaction sender.
     *
     * @param _signerAddress - Address of the transaction signer
     */
    function setCurrentSenderAddress(address _signerAddress) internal {
        protocolMetaTxInfo().currentSenderAddress = _signerAddress;
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

        // Set the current transaction signer and transaction type.
        setCurrentSenderAddress(_userAddress);
        metaTxInfo.isMetaTransaction = true;

        // Invoke local function with an external call
        (bool success, bytes memory returnData) = address(this).call{ value: msg.value }(_functionSignature);

        // If error, return error message
        string memory errorMessage = (returnData.length == 0) ? FUNCTION_CALL_NOT_SUCCESSFUL : (string(returnData));
        require(success, errorMessage);

        // Reset current transaction signer and transaction type.
        setCurrentSenderAddress(address(0));
        metaTxInfo.isMetaTransaction = false;

        emit MetaTransactionExecuted(_userAddress, msg.sender, _functionName, _nonce);
        return returnData;
    }

    /**
     * @notice Handles the incoming meta transaction.
     *
     * Reverts if:
     * - The meta-transactions region of protocol is paused
     * - Nonce is already used by the msg.sender for another transaction
     * - Function is not whitelisted to be called using metatransactions
     * - Function name does not match the bytes4 version of the function signature
     * - sender does not match the recovered signer
     * - Any code executed in the signed transaction reverts
     * - Signature is invalid
     *
     * @param _userAddress - the sender of the transaction
     * @param _functionName - the name of the function to be executed
     * @param _functionSignature - the function signature
     * @param _nonce - the nonce value of the transaction
     * @param _sigR - r part of the signer's signature
     * @param _sigS - s part of the signer's signature
     * @param _sigV - v part of the signer's signature
     */
    function executeMetaTransaction(
        address _userAddress,
        string calldata _functionName,
        bytes calldata _functionSignature,
        uint256 _nonce,
        bytes32 _sigR,
        bytes32 _sigS,
        uint8 _sigV
    ) external payable override metaTransactionsNotPaused returns (bytes memory) {
        // Make sure that protocol is not reentered through meta transactions
        // Cannot use modifier `nonReentrant` since it also changes reentrancyStatus to `ENTERED`,
        // but that then breaks meta transaction functionality
        require(protocolStatus().reentrancyStatus != ENTERED, REENTRANCY_GUARD);

        validateTx(_functionName, _functionSignature, _nonce, _userAddress);

        MetaTransaction memory metaTx;
        metaTx.nonce = _nonce;
        metaTx.from = _userAddress;
        metaTx.contractAddress = address(this);
        metaTx.functionName = _functionName;
        metaTx.functionSignature = isSpecialFunction(_functionName)
            ? bytes(_functionSignature[4:])
            : _functionSignature;

        require(
            EIP712Lib.verify(_userAddress, hashMetaTransaction(metaTx), _sigR, _sigS, _sigV),
            SIGNER_AND_SIGNATURE_DO_NOT_MATCH
        );

        return executeTx(_userAddress, _functionName, _functionSignature, _nonce);
    }

    /**
     * @notice Manages allow list of functions that can be executed using metatransactions.
     *
     * Emits a FunctionsWhitelisted event if successful.
     *
     * Reverts if:
     * - Caller is not a protocol admin
     *
     * @param _functionNames - the list of function names
     * @param _isWhitelisted - new whitelist status
     */
    function setWhitelistedFunctions(string[] calldata _functionNames, bool _isWhitelisted)
        external
        override
        onlyRole(ADMIN)
    {
        ProtocolLib.ProtocolMetaTxInfo storage pmti = protocolMetaTxInfo();

        // set new values
        for (uint256 i = 0; i < _functionNames.length; i++) {
            pmti.isWhitelisted[_functionNames[i]] = _isWhitelisted;
        }

        // Notify external observers
        emit FunctionsWhitelisted(_functionNames, _isWhitelisted, msgSender());
    }

    /**
     * @notice Tells if function can be executed as meta transaction or not.
     *
     * @param _functionName - the function name
     * @return isWhitelisted - whitelist status
     */
    function isFunctionWhitelisted(string calldata _functionName) external view override returns (bool isWhitelisted) {
        return protocolMetaTxInfo().isWhitelisted[_functionName];
    }
}
