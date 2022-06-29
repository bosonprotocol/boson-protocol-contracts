// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import { IBosonMetaTransactionsHandler } from "../../interfaces/handlers/IBosonMetaTransactionsHandler.sol";
import { IBosonDisputeHandler } from "../../interfaces/handlers/IBosonDisputeHandler.sol";
import { IBosonExchangeHandler } from "../../interfaces/handlers/IBosonExchangeHandler.sol";
import { IBosonFundsHandler } from "../../interfaces/handlers/IBosonFundsHandler.sol";
import { DiamondLib } from "../../diamond/DiamondLib.sol";
import { ProtocolLib } from  "../libs/ProtocolLib.sol";
import { ProtocolBase } from "../bases/ProtocolBase.sol";
import { EIP712Lib } from "../libs/EIP712Lib.sol";

/**
 * @title MetaTransactionsHandlerFacet
 *
 * @notice Manages incoming meta-transactions in the protocol.
 */
contract MetaTransactionsHandlerFacet is IBosonMetaTransactionsHandler, ProtocolBase {
    // Structs
    bytes32 private constant META_TRANSACTION_TYPEHASH = keccak256(bytes("MetaTransaction(uint256 nonce,address from,address contractAddress,string functionName,bytes functionSignature)"));
    bytes32 private constant OFFER_DETAILS_TYPEHASH = keccak256("MetaTxOfferDetails(address buyer,uint256 offerId)");
    bytes32 private constant META_TX_COMMIT_TO_OFFER_TYPEHASH = keccak256("MetaTxCommitToOffer(uint256 nonce,address from,address contractAddress,string functionName,MetaTxOfferDetails offerDetails)MetaTxOfferDetails(address buyer,uint256 offerId)");
    bytes32 private constant EXCHANGE_DETAILS_TYPEHASH = keccak256("MetaTxExchangeDetails(uint256 exchangeId)");
    bytes32 private constant META_TX_EXCHANGE_TYPEHASH = keccak256("MetaTxExchange(uint256 nonce,address from,address contractAddress,string functionName,MetaTxExchangeDetails exchangeDetails)MetaTxExchangeDetails(uint256 exchangeId)");
    bytes32 private constant FUND_DETAILS_TYPEHASH = keccak256("MetaTxFundDetails(uint256 entityId,address[] tokenList,uint256[] tokenAmounts)");
    bytes32 private constant META_TX_FUNDS_TYPEHASH = keccak256("MetaTxFund(uint256 nonce,address from,address contractAddress,string functionName,MetaTxFundDetails fundDetails)MetaTxFundDetails(uint256 entityId,address[] tokenList,uint256[] tokenAmounts)");
    bytes32 private constant DISPUTE_DETAILS_TYPEHASH = keccak256("MetaTxDisputeDetails(uint256 exchangeId,string complaint)");
    bytes32 private constant META_TX_DISPUTES_TYPEHASH = keccak256("MetaTxDispute(uint256 nonce,address from,address contractAddress,string functionName,MetaTxDisputeDetails disputeDetails)MetaTxDisputeDetails(uint256 exchangeId,string complaint)");
    bytes32 private constant DISPUTE_RESOLUTION_DETAILS_TYPEHASH = keccak256("MetaTxDisputeResolutionDetails(uint256 exchangeId,uint256 buyerPercent,bytes32 sigR,bytes32 sigS,uint8 sigV)");
    bytes32 private constant META_TX_DISPUTE_RESOLUTIONS_TYPEHASH = keccak256("MetaTxDisputeResolution(uint256 nonce,address from,address contractAddress,string functionName,MetaTxDisputeResolutionDetails disputeResolutionDetails)MetaTxDisputeResolutionDetails(uint256 exchangeId,uint256 buyerPercent,bytes32 sigR,bytes32 sigS,uint8 sigV)");
    // Function names
    string private constant COMMIT_TO_OFFER = "commitToOffer(address,uint256)";
    string private constant CANCEL_VOUCHER = "cancelVoucher(uint256)";
    string private constant REDEEM_VOUCHER = "redeemVoucher(uint256)";
    string private constant COMPLETE_EXCHANGE = "completeExchange(uint256)";
    string private constant WITHDRAW_FUNDS = "withdrawFunds(uint256,address[],uint256[])";
    string private constant RETRACT_DISPUTE = "retractDispute(uint256)";
    string private constant RAISE_DISPUTE = "raiseDispute(uint256,string)";
    string private constant ESCALATE_DISPUTE = "escalateDispute(uint256)";
    string private constant RESOLVE_DISPUTE = "resolveDispute(uint256,uint256,bytes32,bytes32,uint8)";

    /**
     * @notice Facet Initializer
     */
    function initialize() public onlyUnInitialized(type(IBosonMetaTransactionsHandler).interfaceId) {
        DiamondLib.addSupportedInterface(type(IBosonMetaTransactionsHandler).interfaceId);

        // set types for special metatxs
        ProtocolLib.ProtocolMetaTxInfo storage pmti = protocolMetaTxInfo();

        // set input type for the function name
        pmti.inputType[COMMIT_TO_OFFER] = MetaTxInputType.CommitToOffer;
        pmti.inputType[WITHDRAW_FUNDS] = MetaTxInputType.Funds;
        pmti.inputType[RESOLVE_DISPUTE] = MetaTxInputType.ResolveDispute;
        pmti.inputType[CANCEL_VOUCHER] = MetaTxInputType.Exchange;
        pmti.inputType[REDEEM_VOUCHER] = MetaTxInputType.Exchange;
        pmti.inputType[COMPLETE_EXCHANGE] = MetaTxInputType.Exchange;
        pmti.inputType[RETRACT_DISPUTE] = MetaTxInputType.Exchange;
        pmti.inputType[ESCALATE_DISPUTE] = MetaTxInputType.Exchange;
        pmti.inputType[RAISE_DISPUTE] = MetaTxInputType.RaiseDispute;

        // set the hash info to the input type
        pmti.hashInfo[MetaTxInputType.CommitToOffer] = HashInfo(META_TX_COMMIT_TO_OFFER_TYPEHASH, hashOfferDetails);
        pmti.hashInfo[MetaTxInputType.Funds] = HashInfo(META_TX_FUNDS_TYPEHASH, hashFundDetails);
        pmti.hashInfo[MetaTxInputType.Exchange] = HashInfo(META_TX_EXCHANGE_TYPEHASH, hashExchangeDetails);
        pmti.hashInfo[MetaTxInputType.RaiseDispute] = HashInfo(META_TX_DISPUTES_TYPEHASH, hashDisputeDetails);
        pmti.hashInfo[MetaTxInputType.ResolveDispute] = HashInfo(META_TX_DISPUTE_RESOLUTIONS_TYPEHASH, hashDisputeResolutionDetails);
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
     * @notice Returns hashed meta transaction
     *
     * @param _metaTx - the meta-transaction struct.
     */
    function hashMetaTransaction(MetaTransaction memory _metaTx) internal view returns (bytes32) {
        if (!isSpecialFunction(_metaTx.functionName)) {
            return
                keccak256(
                    abi.encode(
                        META_TRANSACTION_TYPEHASH,
                        _metaTx.nonce,
                        _metaTx.from,
                        _metaTx.contractAddress,
                        keccak256(bytes(_metaTx.functionName)),
                        keccak256(_metaTx.functionSignature)
                    )
                );
        } else {
            MetaTxInputType inputType = protocolMetaTxInfo().inputType[_metaTx.functionName];
            HashInfo memory hi = protocolMetaTxInfo().hashInfo[inputType];
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
    }

    /**
     * @notice Returns hashed representation of the offer details struct.
     *
     * @param _offerDetails - the offer details
     */
    function hashOfferDetails(bytes memory _offerDetails) internal pure returns (bytes32) {
        (address buyer, uint256 offerId) = abi.decode(_offerDetails, (address, uint256));
        return
            keccak256(
                abi.encode(OFFER_DETAILS_TYPEHASH, buyer, offerId)
            );
    }

    /**
     * @notice Returns hashed representation of the exchange details struct.
     *
     * @param _exchangeDetails - the exchange details
     */
    function hashExchangeDetails(bytes memory _exchangeDetails) internal pure returns (bytes32) {
        (uint256 exchangeId) = abi.decode(_exchangeDetails, (uint256));
        return
            keccak256(
                abi.encode(EXCHANGE_DETAILS_TYPEHASH, exchangeId)
            );
    }

    /**
     * @notice Returns hashed representation of the fund details struct.
     *
     * @param _fundDetails - the fund details
     */
    function hashFundDetails(bytes memory _fundDetails) internal pure returns (bytes32) {
        (uint256 entityId, address[] memory tokenList, uint256[] memory tokenAmounts) = abi.decode(_fundDetails, (uint256, address[], uint256[]));
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
     * @notice Returns hashed representation of the dispute details struct.
     *
     * @param _disputeDetails - the dispute details
     */
    function hashDisputeDetails(bytes memory _disputeDetails) internal pure returns (bytes32) {
        (uint256 exchangeId, string memory complaint) = abi.decode(_disputeDetails, (uint256, string));
        return
            keccak256(
                abi.encode(
                    DISPUTE_DETAILS_TYPEHASH,
                    exchangeId,
                    keccak256(bytes(complaint))
                )
            );
    }

    /**
     * @notice Returns hashed representation of the dispute resolution details struct.
     *
     * @param _disputeResolutionDetails - the dispute resolution details
     */
    function hashDisputeResolutionDetails(bytes memory _disputeResolutionDetails) internal pure returns (bytes32) {
        (uint256 exchangeId, uint256 buyerPercent, bytes32 sigR, bytes32 sigS, uint8 sigV) = abi.decode(_disputeResolutionDetails, (uint256, uint256, bytes32, bytes32, uint8));
        return
            keccak256(
                abi.encode(
                    DISPUTE_RESOLUTION_DETAILS_TYPEHASH,
                    exchangeId,
                    buyerPercent,
                    sigR,
                    sigS,
                    sigV
                )
            );
    }

    /**
     * @notice Checks nonce and returns true if used already.
     *
     * @param _nonce - the nonce that we want to check.
     */
    function isUsedNonce(uint256 _nonce) external view override returns (bool) {
        return protocolMetaTxInfo().usedNonce[_nonce];
    }

    /**
     * @notice Validates the nonce and function signature.
     *
     * Reverts if:
     * - nonce is already used by another transaction.
     * - function signature matches to Meta Transaction function.
     * - function name does not match with bytes 4 version of the function signature.
     *
     * @param _functionName - the function name that we want to execute.
     * @param _functionSignature - the function signature.
     * @param _nonce - the nonce value of the transaction.
     */
    function validateTx(
        string memory _functionName,
        bytes memory _functionSignature,
        uint256 _nonce
    ) internal view {
        require(!protocolMetaTxInfo().usedNonce[_nonce], NONCE_USED_ALREADY);

        bytes4 destinationFunctionSig = convertBytesToBytes4(_functionSignature);
        require(destinationFunctionSig != msg.sig, INVALID_FUNCTION_SIGNATURE);

        bytes4 functionNameSig = bytes4(keccak256(abi.encodePacked(_functionName)));
        require(destinationFunctionSig == functionNameSig, INVALID_FUNCTION_NAME);
    }

    /**
     * @notice Checks if function name is a special function or a generic function.
     *
     * @param _functionName - the function name that we want to execute.
     */
    function isSpecialFunction(
        string memory _functionName
    ) internal view returns (bool){
        return protocolMetaTxInfo().inputType[_functionName] != MetaTxInputType.Generic;
    }

    /**
     * @notice Sets the current transaction sender.
     *
     * @param _signerAddress - Address of the transaction signer.
     */
    function setCurrentSenderAddress(address _signerAddress) internal {
        protocolMetaTxInfo().currentSenderAddress = _signerAddress;
    }

    /**
     * @notice Executes the transaction
     *
     * Reverts if:
     * - any code executed in the signed transaction reverts.
     *
     * @param _userAddress - the sender of the transaction.
     * @param _functionName - the function name that we want to execute.
     * @param _functionSignature - the function signature.
     * @param _nonce - the nonce value of the transaction.
     */
    function executeTx(
        address _userAddress,
        string memory _functionName,
        bytes memory _functionSignature,
        uint256 _nonce
    ) internal returns (bytes memory) {
        // Store the nonce provided to avoid playback of the same tx
        protocolMetaTxInfo().usedNonce[_nonce] = true;

        // Set the current transaction signer and transaction type.
        setCurrentSenderAddress(_userAddress);
        protocolMetaTxInfo().isMetaTransaction = true;

        // invoke local function with an external call
        (bool success, bytes memory returnData) = address(this).call{ value: msg.value }(_functionSignature);

        // If error, return error message
        string memory errorMessage = (returnData.length == 0) ? FUNCTION_CALL_NOT_SUCCESSFUL : (string(returnData));
        require(success, errorMessage);

        // Reset current transaction signer and transaction type.
        setCurrentSenderAddress(address(0));
        protocolMetaTxInfo().isMetaTransaction = false;

        emit MetaTransactionExecuted(_userAddress, msg.sender, _functionName, _nonce);
        return returnData;
    }

    /**
     * @notice Handles the incoming meta transaction.
     *
     * Reverts if:
     * - nonce is already used by another transaction.
     * - function signature matches to executeMetaTransaction.
     * - function name does not match with bytes 4 version of the function signature.
     * - sender does not match the recovered signer.
     * - any code executed in the signed transaction reverts.
     *
     * @param _userAddress - the sender of the transaction.
     * @param _functionName - the function name that we want to execute.
     * @param _functionSignature - the function signature.
     * @param _nonce - the nonce value of the transaction.
     * @param _sigR - r part of the signer's signature.
     * @param _sigS - s part of the signer's signature.
     * @param _sigV - v part of the signer's signature.
     */
    function executeMetaTransaction(
        address _userAddress,
        string memory _functionName,
        bytes calldata _functionSignature,
        uint256 _nonce,
        bytes32 _sigR,
        bytes32 _sigS,
        uint8 _sigV
    ) public payable override returns (bytes memory) {
        validateTx(_functionName, _functionSignature, _nonce);

        MetaTransaction memory metaTx;
        if (!isSpecialFunction(_functionName)) {
            metaTx = MetaTransaction({
                nonce: _nonce,
                from: _userAddress,
                contractAddress: address(this),
                functionName: _functionName,
                functionSignature: _functionSignature
            });
        } else {
            metaTx = MetaTransaction({
                nonce: _nonce,
                from: _userAddress,
                contractAddress: address(this),
                functionName: _functionName,
                functionSignature: bytes(_functionSignature[4:])
            });
        }

        require(
            EIP712Lib.verify(_userAddress, hashMetaTransaction(metaTx), _sigR, _sigS, _sigV),
            SIGNER_AND_SIGNATURE_DO_NOT_MATCH
        );

        return executeTx(_userAddress, _functionName, _functionSignature, _nonce);
    }
}
