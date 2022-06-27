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

        pmti.inputType[COMMIT_TO_OFFER] = MetaTxInputType.CommitToOffer;
        pmti.inputType[WITHDRAW_FUNDS] = MetaTxInputType.Funds;

        pmti.hashInfo[MetaTxInputType.CommitToOffer] = HashInfo(META_TX_COMMIT_TO_OFFER_TYPEHASH, hashOfferDetailsUni);
        pmti.hashInfo[MetaTxInputType.Funds] = HashInfo(META_TX_FUNDS_TYPEHASH, hashFundDetails);
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
     * @param _metaTx  - the meta-transaction struct.
     */
    function hashMetaTransactionUni(MetaTransaction memory _metaTx) internal view returns (bytes32) {
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

    /**
     * @notice Returns hashed meta transaction
     *
     * @param _metaTx  - the meta-transaction struct.
     */
    function hashMetaTransaction(MetaTransaction memory _metaTx) internal pure returns (bytes32) {
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
    }

    /**
     * @notice Returns hashed meta transaction for commit to offer
     *
     * @param _metaTx  - the meta-transaction struct for commit to offer.
     */
    function hashMetaTxCommitToOffer(MetaTxCommitToOffer memory _metaTx) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    META_TX_COMMIT_TO_OFFER_TYPEHASH,
                    _metaTx.nonce,
                    _metaTx.from,
                    _metaTx.contractAddress,
                    keccak256(bytes(_metaTx.functionName)),
                    hashOfferDetails(_metaTx.offerDetails)
                )
            );
    }

    /**
     * @notice Returns hashed meta transaction for Exchange handler functions with just one argument as exchangeId.
     *
     * @param _metaTx  - BosonTypes.MetaTxExchange struct.
     */
    function hashMetaTxExchangeDetails(MetaTxExchange memory _metaTx) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    META_TX_EXCHANGE_TYPEHASH,
                    _metaTx.nonce,
                    _metaTx.from,
                    _metaTx.contractAddress,
                    keccak256(bytes(_metaTx.functionName)),
                    hashExchangeDetails(_metaTx.exchangeDetails)
                )
            );
    }

    /**
     * @notice Returns hashed meta transaction for dispute details.
     *
     * @param _metaTx  - BosonTypes.MetaTxDispute struct.
     */
    function hashMetaTxDisputeDetails(MetaTxDispute memory _metaTx) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    META_TX_DISPUTES_TYPEHASH,
                    _metaTx.nonce,
                    _metaTx.from,
                    _metaTx.contractAddress,
                    keccak256(bytes(_metaTx.functionName)),
                    hashDisputeDetails(_metaTx.disputeDetails)
                )
            );
    }

    /**
     * @notice Returns hashed meta transaction for dispute resolution details.
     *
     * @param _metaTx - BosonTypes.MetaTxDisputeResolution struct.
     */
    function hashMetaTxDisputeResolutionDetails(MetaTxDisputeResolution memory _metaTx) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    META_TX_DISPUTE_RESOLUTIONS_TYPEHASH,
                    _metaTx.nonce,
                    _metaTx.from,
                    _metaTx.contractAddress,
                    keccak256(bytes(_metaTx.functionName)),
                    hashDisputeResolutionDetails(_metaTx.disputeResolutionDetails)
                )
            );
    }

    /**
     * @notice Returns hashed representation of the offer struct.
     *
     * @param _offerDetails - the BosonTypes.MetaTxOfferDetails struct.
     */
    function hashOfferDetails(MetaTxOfferDetails memory _offerDetails) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(OFFER_DETAILS_TYPEHASH, _offerDetails.buyer, _offerDetails.offerId)
            );
    }

    /**
     * @notice Returns hashed representation of the offer struct.
     *
     * @param _offerDetails - the BosonTypes.MetaTxOfferDetails struct.
     */
    function hashOfferDetailsUni(bytes memory _offerDetails) internal pure returns (bytes32) {
        MetaTxOfferDetails memory offerDetails = abi.decode(_offerDetails, (MetaTxOfferDetails));
        return
            keccak256(
                abi.encode(OFFER_DETAILS_TYPEHASH, offerDetails.buyer, offerDetails.offerId)
            );
    }

    /**
     * @notice Returns hashed representation of the exchange details struct.
     *
     * @param _exchangeDetails - the BosonTypes.MetaTxExchangeDetails struct.
     */
    function hashExchangeDetails(MetaTxExchangeDetails memory _exchangeDetails) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(EXCHANGE_DETAILS_TYPEHASH, _exchangeDetails.exchangeId)
            );
    }

    /**
     * @notice Returns hashed representation of the fund details struct.
     *
     * @param _fundDetails - the BosonTypes.MetaTxFundDetails struct.
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
     * @param _disputeDetails - the BosonTypes.MetaTxDisputeDetails struct.
     */
    function hashDisputeDetails(MetaTxDisputeDetails memory _disputeDetails) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    DISPUTE_DETAILS_TYPEHASH,
                    _disputeDetails.exchangeId,
                    keccak256(bytes(_disputeDetails.complaint))
                )
            );
    }

    /**
     * @notice Returns hashed representation of the dispute resolution details struct.
     *
     * @param _disputeResolutionDetails - the BosonTypes.MetaTxDisputeResolutionDetails struct.
     */
    function hashDisputeResolutionDetails(MetaTxDisputeResolutionDetails memory _disputeResolutionDetails) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    DISPUTE_RESOLUTION_DETAILS_TYPEHASH,
                    _disputeResolutionDetails.exchangeId,
                    _disputeResolutionDetails.buyerPercent,
                    _disputeResolutionDetails.sigR,
                    _disputeResolutionDetails.sigS,
                    _disputeResolutionDetails.sigV
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
        bytes memory _functionSignature,
        uint256 _nonce,
        bytes32 _sigR,
        bytes32 _sigS,
        uint8 _sigV
    ) public payable override returns (bytes memory) {
        validateTx(_functionName, _functionSignature, _nonce);

        MetaTransaction memory metaTx = MetaTransaction({
            nonce: _nonce,
            from: _userAddress,
            contractAddress: address(this),
            functionName: _functionName,
            functionSignature: _functionSignature
        });
        require(
            EIP712Lib.verify(_userAddress, hashMetaTransaction(metaTx), _sigR, _sigS, _sigV),
            SIGNER_AND_SIGNATURE_DO_NOT_MATCH
        );

        return executeTx(_userAddress, _functionName, _functionSignature, _nonce);
    }

    /**
     * @notice Handles the incoming meta transaction for commit to offer.
     *
     * Reverts if:
     * - nonce is already used by another transaction.
     * - sender does not match the recovered signer.
     * - any code executed in the signed transaction reverts.
     *
     * @param _userAddress - the sender of the transaction.
     * @param _offerDetails - the fully populated BosonTypes.MetaTxOfferDetails struct.
     * @param _nonce - the nonce value of the transaction.
     * @param _sigR - r part of the signer's signature.
     * @param _sigS - s part of the signer's signature.
     * @param _sigV - v part of the signer's signature.
     */
    function executeMetaTxCommitToOffer(
        address _userAddress,
        MetaTxOfferDetails calldata _offerDetails,
        uint256 _nonce,
        bytes32 _sigR,
        bytes32 _sigS,
        uint8 _sigV
    ) public payable override returns (bytes memory) {
        bytes4 functionSelector = IBosonExchangeHandler.commitToOffer.selector;
        bytes memory functionSignature = abi.encodeWithSelector(
            functionSelector,
            _offerDetails.buyer,
            _offerDetails.offerId
        );
        validateTx(COMMIT_TO_OFFER, functionSignature, _nonce);

        MetaTxCommitToOffer memory metaTx = MetaTxCommitToOffer({
            nonce: _nonce,
            from: _userAddress,
            contractAddress: address(this),
            functionName: COMMIT_TO_OFFER,
            offerDetails: _offerDetails
        });
        require(
            EIP712Lib.verify(_userAddress, hashMetaTxCommitToOffer(metaTx), _sigR, _sigS, _sigV),
            SIGNER_AND_SIGNATURE_DO_NOT_MATCH
        );

        return executeTx(_userAddress, COMMIT_TO_OFFER, functionSignature, _nonce);
    }

    /**
     * @notice Handles the incoming meta transaction for cancel Voucher.
     *
     * Reverts if:
     * - nonce is already used by another transaction.
     * - sender does not match the recovered signer.
     * - any code executed in the signed transaction reverts.
     *
     * @param _userAddress - the sender of the transaction.
     * @param _exchangeDetails - the fully populated BosonTypes.MetaTxExchangeDetails struct.
     * @param _nonce - the nonce value of the transaction.
     * @param _sigR - r part of the signer's signature.
     * @param _sigS - s part of the signer's signature.
     * @param _sigV - v part of the signer's signature.
     */
    function executeMetaTxCancelVoucher(
        address _userAddress,
        MetaTxExchangeDetails calldata _exchangeDetails,
        uint256 _nonce,
        bytes32 _sigR,
        bytes32 _sigS,
        uint8 _sigV
    ) public override returns (bytes memory) {
        bytes4 functionSelector = IBosonExchangeHandler.cancelVoucher.selector;
        bytes memory functionSignature = abi.encodeWithSelector(
            functionSelector,
            _exchangeDetails.exchangeId
        );
        validateTx(CANCEL_VOUCHER, functionSignature, _nonce);

        MetaTxExchange memory metaTx = MetaTxExchange({
            nonce: _nonce,
            from: _userAddress,
            contractAddress: address(this),
            functionName: CANCEL_VOUCHER,
            exchangeDetails: _exchangeDetails
        });
        require(
            EIP712Lib.verify(_userAddress, hashMetaTxExchangeDetails(metaTx), _sigR, _sigS, _sigV),
            SIGNER_AND_SIGNATURE_DO_NOT_MATCH
        );

        return executeTx(_userAddress, CANCEL_VOUCHER, functionSignature, _nonce);
    }

    /**
     * @notice Handles the incoming meta transaction for Redeem Voucher.
     *
     * Reverts if:
     * - nonce is already used by another transaction.
     * - sender does not match the recovered signer.
     * - any code executed in the signed transaction reverts.
     *
     * @param _userAddress - the sender of the transaction.
     * @param _exchangeDetails - the fully populated BosonTypes.MetaTxExchangeDetails struct.
     * @param _nonce - the nonce value of the transaction.
     * @param _sigR - r part of the signer's signature.
     * @param _sigS - s part of the signer's signature.
     * @param _sigV - v part of the signer's signature.
     */
    function executeMetaTxRedeemVoucher(
        address _userAddress,
        MetaTxExchangeDetails calldata _exchangeDetails,
        uint256 _nonce,
        bytes32 _sigR,
        bytes32 _sigS,
        uint8 _sigV
    ) public override returns (bytes memory) {
        bytes4 functionSelector = IBosonExchangeHandler.redeemVoucher.selector;
        bytes memory functionSignature = abi.encodeWithSelector(
            functionSelector,
            _exchangeDetails.exchangeId
        );
        validateTx(REDEEM_VOUCHER, functionSignature, _nonce);

        MetaTxExchange memory metaTx = MetaTxExchange({
            nonce: _nonce,
            from: _userAddress,
            contractAddress: address(this),
            functionName: REDEEM_VOUCHER,
            exchangeDetails: _exchangeDetails
        });
        require(
            EIP712Lib.verify(_userAddress, hashMetaTxExchangeDetails(metaTx), _sigR, _sigS, _sigV),
            SIGNER_AND_SIGNATURE_DO_NOT_MATCH
        );

        return executeTx(_userAddress, REDEEM_VOUCHER, functionSignature, _nonce);
    }

    /**
     * @notice Handles the incoming meta transaction for Complete Exchange.
     *
     * Reverts if:
     * - nonce is already used by another transaction.
     * - sender does not match the recovered signer.
     * - any code executed in the signed transaction reverts.
     *
     * @param _userAddress - the sender of the transaction.
     * @param _exchangeDetails - the fully populated BosonTypes.MetaTxExchangeDetails struct.
     * @param _nonce - the nonce value of the transaction.
     * @param _sigR - r part of the signer's signature.
     * @param _sigS - s part of the signer's signature.
     * @param _sigV - v part of the signer's signature.
     */
    function executeMetaTxCompleteExchange(
        address _userAddress,
        MetaTxExchangeDetails calldata _exchangeDetails,
        uint256 _nonce,
        bytes32 _sigR,
        bytes32 _sigS,
        uint8 _sigV
    ) public override returns (bytes memory) {
        bytes4 functionSelector = IBosonExchangeHandler.completeExchange.selector;
        bytes memory functionSignature = abi.encodeWithSelector(
            functionSelector,
            _exchangeDetails.exchangeId
        );
        validateTx(COMPLETE_EXCHANGE, functionSignature, _nonce);

        MetaTxExchange memory metaTx = MetaTxExchange({
            nonce: _nonce,
            from: _userAddress,
            contractAddress: address(this),
            functionName: COMPLETE_EXCHANGE,
            exchangeDetails: _exchangeDetails
        });
        require(
            EIP712Lib.verify(_userAddress, hashMetaTxExchangeDetails(metaTx), _sigR, _sigS, _sigV),
            SIGNER_AND_SIGNATURE_DO_NOT_MATCH
        );

        return executeTx(_userAddress, COMPLETE_EXCHANGE, functionSignature, _nonce);
    }

    /**
     * @notice Handles the incoming meta transaction for Retract Dispute.
     *
     * Reverts if:
     * - nonce is already used by another transaction.
     * - sender does not match the recovered signer.
     * - any code executed in the signed transaction reverts.
     *
     * @param _userAddress - the sender of the transaction.
     * @param _exchangeDetails - the fully populated BosonTypes.MetaTxExchangeDetails struct.
     * @param _nonce - the nonce value of the transaction.
     * @param _sigR - r part of the signer's signature.
     * @param _sigS - s part of the signer's signature.
     * @param _sigV - v part of the signer's signature.
     */
    function executeMetaTxRetractDispute(
        address _userAddress,
        MetaTxExchangeDetails calldata _exchangeDetails,
        uint256 _nonce,
        bytes32 _sigR,
        bytes32 _sigS,
        uint8 _sigV
    ) public override returns (bytes memory) {
        bytes4 functionSelector = IBosonDisputeHandler.retractDispute.selector;
        bytes memory functionSignature = abi.encodeWithSelector(
            functionSelector,
            _exchangeDetails.exchangeId
        );
        validateTx(RETRACT_DISPUTE, functionSignature, _nonce);

        MetaTxExchange memory metaTx = MetaTxExchange({
            nonce: _nonce,
            from: _userAddress,
            contractAddress: address(this),
            functionName: RETRACT_DISPUTE,
            exchangeDetails: _exchangeDetails
        });
        require(
            EIP712Lib.verify(_userAddress, hashMetaTxExchangeDetails(metaTx), _sigR, _sigS, _sigV),
            SIGNER_AND_SIGNATURE_DO_NOT_MATCH
        );

        return executeTx(_userAddress, RETRACT_DISPUTE, functionSignature, _nonce);
    }

    /**
     * @notice Handles the incoming meta transaction for Raise Dispute.
     *
     * Reverts if:
     * - nonce is already used by another transaction.
     * - sender does not match the recovered signer.
     * - any code executed in the signed transaction reverts.
     *
     * @param _userAddress - the sender of the transaction.
     * @param _disputeDetails - the fully populated BosonTypes.MetaTxDisputeDetails struct.
     * @param _nonce - the nonce value of the transaction.
     * @param _sigR - r part of the signer's signature.
     * @param _sigS - s part of the signer's signature.
     * @param _sigV - v part of the signer's signature.
     */
    function executeMetaTxRaiseDispute(
        address _userAddress,
        MetaTxDisputeDetails calldata _disputeDetails,
        uint256 _nonce,
        bytes32 _sigR,
        bytes32 _sigS,
        uint8 _sigV
    ) public override returns (bytes memory) {
        bytes4 functionSelector = IBosonDisputeHandler.raiseDispute.selector;
        bytes memory functionSignature = abi.encodeWithSelector(
            functionSelector,
            _disputeDetails.exchangeId,
            _disputeDetails.complaint
        );
        validateTx(RAISE_DISPUTE, functionSignature, _nonce);

        MetaTxDispute memory metaTx = MetaTxDispute({
            nonce: _nonce,
            from: _userAddress,
            contractAddress: address(this),
            functionName: RAISE_DISPUTE,
            disputeDetails: _disputeDetails
        });
        require(
            EIP712Lib.verify(_userAddress, hashMetaTxDisputeDetails(metaTx), _sigR, _sigS, _sigV),
            SIGNER_AND_SIGNATURE_DO_NOT_MATCH
        );

        return executeTx(_userAddress, RAISE_DISPUTE, functionSignature, _nonce);
    }

    /**
     * @notice Handles the incoming meta transaction for Escalate Dispute.
     *
     * Reverts if:
     * - nonce is already used by another transaction.
     * - sender does not match the recovered signer.
     * - any code executed in the signed transaction reverts.
     *
     * @param _userAddress - the sender of the transaction.
     * @param _exchangeDetails - the fully populated BosonTypes.MetaTxExchangeDetails struct.
     * @param _nonce - the nonce value of the transaction.
     * @param _sigR - r part of the signer's signature.
     * @param _sigS - s part of the signer's signature.
     * @param _sigV - v part of the signer's signature.
     */
    function executeMetaTxEscalateDispute(
        address _userAddress,
        MetaTxExchangeDetails calldata _exchangeDetails,
        uint256 _nonce,
        bytes32 _sigR,
        bytes32 _sigS,
        uint8 _sigV
    ) public override returns (bytes memory) {
        bytes4 functionSelector = IBosonDisputeHandler.escalateDispute.selector;
        bytes memory functionSignature = abi.encodeWithSelector(
            functionSelector,
            _exchangeDetails.exchangeId
        );
        validateTx(ESCALATE_DISPUTE, functionSignature, _nonce);

        MetaTxExchange memory metaTx = MetaTxExchange({
            nonce: _nonce,
            from: _userAddress,
            contractAddress: address(this),
            functionName: ESCALATE_DISPUTE,
            exchangeDetails: _exchangeDetails
        });
        require(
            EIP712Lib.verify(_userAddress, hashMetaTxExchangeDetails(metaTx), _sigR, _sigS, _sigV),
            SIGNER_AND_SIGNATURE_DO_NOT_MATCH
        );

        return executeTx(_userAddress, ESCALATE_DISPUTE, functionSignature, _nonce);
    }

    /**
     * @notice Handles the incoming meta transaction for Resolve Dispute.
     *
     * Reverts if:
     * - nonce is already used by another transaction.
     * - sender does not match the recovered signer.
     * - any code executed in the signed transaction reverts.
     *
     * @param _userAddress - the sender of the transaction.
     * @param _disputeResolutionDetails - the fully populated BosonTypes.MetaTxDisputeResolutionDetails struct.
     * @param _nonce - the nonce value of the transaction.
     * @param _sigR - r part of the signer's signature.
     * @param _sigS - s part of the signer's signature.
     * @param _sigV - v part of the signer's signature.
     */
    function executeMetaTxResolveDispute(
        address _userAddress,
        MetaTxDisputeResolutionDetails calldata _disputeResolutionDetails,
        uint256 _nonce,
        bytes32 _sigR,
        bytes32 _sigS,
        uint8 _sigV
    ) public override returns (bytes memory) {
        bytes4 functionSelector = IBosonDisputeHandler.resolveDispute.selector;
        bytes memory functionSignature = abi.encodeWithSelector(
            functionSelector,
            _disputeResolutionDetails.exchangeId,
            _disputeResolutionDetails.buyerPercent,
            _disputeResolutionDetails.sigR,
            _disputeResolutionDetails.sigS,
            _disputeResolutionDetails.sigV
        );
        validateTx(RESOLVE_DISPUTE, functionSignature, _nonce);

        MetaTxDisputeResolution memory metaTx = MetaTxDisputeResolution({
            nonce: _nonce,
            from: _userAddress,
            contractAddress: address(this),
            functionName: RESOLVE_DISPUTE,
            disputeResolutionDetails: _disputeResolutionDetails
        });
        require(
            EIP712Lib.verify(_userAddress, hashMetaTxDisputeResolutionDetails(metaTx), _sigR, _sigS, _sigV),
            SIGNER_AND_SIGNATURE_DO_NOT_MATCH
        );

        return executeTx(_userAddress, RESOLVE_DISPUTE, functionSignature, _nonce);
    }

    function executeMetaTransactionUni(
        address _userAddress,
        string memory _functionName,
        bytes calldata _functionSignature,
        uint256 _nonce,
        bytes32 _sigR,
        bytes32 _sigS,
        uint8 _sigV
    ) public payable override returns (bytes memory) {
        validateTx(_functionName, _functionSignature, _nonce);

        MetaTransaction memory metaTx = MetaTransaction({
            nonce: _nonce,
            from: _userAddress,
            contractAddress: address(this),
            functionName: _functionName,
            functionSignature: bytes(_functionSignature[4:])
        });

        require(
            EIP712Lib.verify(_userAddress, hashMetaTransactionUni(metaTx), _sigR, _sigS, _sigV),
            SIGNER_AND_SIGNATURE_DO_NOT_MATCH
        );

        return executeTx(_userAddress, _functionName, _functionSignature, _nonce);
    }
}
