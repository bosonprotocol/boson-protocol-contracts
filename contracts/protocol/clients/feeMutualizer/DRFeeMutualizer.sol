// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.9;
import "../../../domain/BosonConstants.sol";
import { IDRFeeMutualizer } from "../../../interfaces/clients/IDRFeeMutualizer.sol";
import { IDRFeeMutualizerClient } from "../../../interfaces/clients/IDRFeeMutualizerClient.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ERC165 } from "@openzeppelin/contracts/utils/introspection/ERC165.sol";

/**
 * @title DRFeeMutualizer
 * @notice This is a reference implementation of Dispute resolver fee mutualizer.
 *
 */
contract DRFeeMutualizer is IDRFeeMutualizerClient, Ownable, ERC165 {
    using SafeERC20 for IERC20;

    address private immutable protocolAddress;

    Agreement[] private agreements;
    mapping(address => mapping(address => uint256)) private agreementBySellerAndToken;
    mapping(uint256 => AgreementStatus) private agreementStatus;

    mapping(uint256 => uint256) private agreementByUuid;
    uint256 private uuidCounter;

    constructor(address _protocolAddress) {
        protocolAddress = _protocolAddress;
        Agreement memory emptyAgreement;
        agreements.push(emptyAgreement); // add empty agreement to fill index 0, otherwise we need to manipulate indices otherwise
    }

    /**
     * @notice Tells if mutualizer will cover the fee amount for a given seller and requrested by a given address.
     *
     * It checks if agreement is valid, but not if the mutualizer has enough funds to cover the fee.
     *
     * @param _sellerAddress - the seller address
     * @param _token - the token address (use 0x0 for ETH)
     * @param _feeAmount - amount to cover
     * @param _feeRequester - address of the requester
     * @param /_context - additional data, describing the context
     */
    function isSellerCovered(
        address _sellerAddress,
        address _token,
        uint256 _feeAmount,
        address _feeRequester,
        bytes calldata /*_context*/
    ) external view returns (bool) {
        uint256 agreementId = agreementBySellerAndToken[_sellerAddress][_token];
        if (agreementId == 0 || agreementId >= agreements.length) {
            return false;
        }

        Agreement storage agreement = agreements[agreementId];
        AgreementStatus storage status = agreementStatus[agreementId];

        return (_feeRequester == protocolAddress &&
            agreement.startTimestamp <= block.timestamp &&
            agreement.endTimestamp >= block.timestamp &&
            !status.voided &&
            agreement.maxMutualizedAmountPerTransaction >= _feeAmount &&
            agreement.maxTotalMutualizedAmount >= status.totalMutualizedAmount + _feeAmount);
    }

    /**
     * @notice Request the mutualizer to cover the fee amount.
     *
     * @dev Verify that seller is covered and send the fee amount to the msg.sender.
     * Returned uuid can be used to track the status of the request.
     *
     * Emits DRFeeSent event if successful.
     *
     * Reverts if:
     * - caller is not the protocol
     * - agreement does not exist
     * - agreement is not confirmed yet
     * - agreement is voided
     * - agreement has not started yet
     * - agreement expired
     * - fee amount exceeds max mutualized amount per transaction
     * - fee amount exceeds max total mutualized amount
     * - amount exceeds available balance
     * - token is native and transfer fails
     * - token is ERC20 and transferFrom fails
     *
     * @param _sellerAddress - the seller address
     * @param _token - the token address (use 0x0 for ETH)
     * @param _feeAmount - amount to cover
     * @param /_context - additional data, describing the context
     * @return isCovered - true if the seller is covered
     * @return uuid - unique identifier of the request
     */
    function requestDRFee(
        address _sellerAddress,
        address _token,
        uint256 _feeAmount,
        bytes calldata /*_context*/
    ) external onlyProtocol returns (bool isCovered, uint256 uuid) {
        // Make sure agreement is valid
        uint256 agreementId = agreementBySellerAndToken[_sellerAddress][_token];
        (Agreement storage agreement, AgreementStatus storage status) = getValidAgreement(agreementId);
        require(agreement.startTimestamp <= block.timestamp, AGREEMENT_NOT_STARTED);
        require(agreement.maxMutualizedAmountPerTransaction >= _feeAmount, EXCEEDED_SINGLE_FEE);

        // Increase total mutualized amount
        status.totalMutualizedAmount += _feeAmount;
        require(agreement.maxTotalMutualizedAmount >= status.totalMutualizedAmount, EXCEEDED_TOTAL_FEE);

        // Increase number of exchanges
        status.outstandingExchanges++;

        agreementByUuid[++uuidCounter] = agreementId;

        address token = agreement.token;
        transferFundsFromMutualizer(token, _feeAmount);

        emit DRFeeSent(msg.sender, token, _feeAmount, uuidCounter);

        return (true, uuidCounter);
    }

    /**
     * @notice Return fee to the mutualizer.
     *
     * @dev Returned amount can be between 0 and _feeAmount that was requested for the given uuid.
     *
     * Reverts if:
     * - caller is not the protocol
     * - uuid does not exist
     * - same uuid is used twice
     * - token is native and sent value is not equal to _feeAmount
     * - token is ERC20, but some native value is sent
     * - token is ERC20 and sent value is not equal to _feeAmount
     * - token is ERC20 and transferFrom fails
     *
     * @param _uuid - unique identifier of the request
     * @param _feeAmount - returned amount
     * @param _context - additional data, describing the context
     */
    function returnDRFee(uint256 _uuid, uint256 _feeAmount, bytes calldata _context) external payable onlyProtocol {
        uint256 agreementId = agreementByUuid[_uuid];
        require(agreementId != 0, INVALID_UUID);

        AgreementStatus storage status = agreementStatus[agreementId];
        Agreement storage agreement = agreements[agreementId];
        address token = agreement.token;
        if (_feeAmount > 0) {
            transferFundsToMutualizer(token, _feeAmount);

            // Protocol should not return more than it has received, but we handle this case if behavior changes in the future
            if (_feeAmount < status.totalMutualizedAmount) {
                status.totalMutualizedAmount -= _feeAmount;
            } else {
                status.totalMutualizedAmount = 0;
            }
        }

        status.outstandingExchanges--;

        delete agreementByUuid[_uuid]; // prevent using the same uuid twice

        emit DRFeeReturned(_uuid, token, _feeAmount, _context);
    }

    /**
     * @notice Stores a new agreement between mutualizer and seller. Only contract owner can submint an agreement,
     * however it becomes valid only after seller confirms it by calling payPremium.
     *
     * Emits AgreementCreated event if successful.
     *
     * Reverts if:
     * - caller is not the contract owner
     * - max mutualized amount per transaction is greater than max total mutualized amount
     * - max mutualized amount per transaction is 0
     * - end timestamp is not greater than start timestamp
     * - end timestamp is not greater than current block timestamp
     *
     * @param _agreement - a fully populated agreement object
     */
    function newAgreement(Agreement calldata _agreement) external onlyOwner {
        require(_agreement.maxMutualizedAmountPerTransaction <= _agreement.maxTotalMutualizedAmount, INVALID_AGREEMENT);
        require(_agreement.maxMutualizedAmountPerTransaction > 0, INVALID_AGREEMENT);
        require(_agreement.endTimestamp > _agreement.startTimestamp, INVALID_AGREEMENT);
        require(_agreement.endTimestamp > block.timestamp, INVALID_AGREEMENT);

        agreements.push(_agreement);
        uint256 agreementId = agreements.length - 1;

        emit AgreementCreated(_agreement.sellerAddress, agreementId, _agreement);
    }

    /**
     * @notice Pay the premium for the agreement and confirm it.
     *
     * Emits AgreementConfirmed event if successful.
     *
     * Reverts if:
     * - agreement does not exist
     * - agreement is already confirmed
     * - agreement is voided
     * - agreement expired
     * - token is native and sent value is not equal to the agreement premium
     * - token is ERC20, but some native value is sent
     * - token is ERC20 and sent value is not equal to the agreement premium
     * - token is ERC20 and transferFrom fails
     *
     * @param _agreementId - a unique identifier of the agreement
     */
    function payPremium(uint256 _agreementId) external payable {
        (Agreement storage agreement, AgreementStatus storage status) = getValidAgreement(_agreementId);

        require(!status.confirmed, AGREEMENT_ALREADY_CONFIRMED);

        transferFundsToMutualizer(agreement.token, agreement.premium);

        // even if agreementBySellerAndToken[_agreement.sellerAddress][_agreement.token] exists, seller can overwrite it
        agreementBySellerAndToken[agreement.sellerAddress][agreement.token] = _agreementId;
        status.confirmed = true;

        emit AgreementConfirmed(agreement.sellerAddress, _agreementId);
    }

    /**
     * @notice Void the agreement.
     *
     * Emits AgreementVoided event if successful.
     *
     * Reverts if:
     * - agreement does not exist
     * - caller is not the contract owner or the seller
     * - agreement is voided already
     * - agreement expired
     *
     * @param _agreementId - a unique identifier of the agreement
     */
    function voidAgreement(uint256 _agreementId) external {
        (Agreement storage agreement, AgreementStatus storage status) = getValidAgreement(_agreementId);

        require(msg.sender == owner() || msg.sender == agreement.sellerAddress, NOT_OWNER_OR_SELLER);

        status.voided = true;

        if (agreement.refundOnCancel) {
            // calculate unused premium
            // ToDo: what is the business logic here?
            // what with the outstanding requests?
            // uint256 unusedPremium = agreement.premium*(agreement.endTimestamp-block.timestamp)/(agreement.endTimestamp-agreement.startTimestamp); // potential overflow
        }

        emit AgreementVoided(agreement.sellerAddress, _agreementId);
    }

    /**
     * @notice Deposit funds to the mutualizer. Funds are used to cover the DR fees.
     *
     * Emits FundsDeposited event if successful.
     *
     * Reverts if:
     * - token is native and sent value is not equal to _amount
     * - token is ERC20, but some native value is sent
     * - token is ERC20 and sent value is not equal to _amount
     * - token is ERC20 and transferFrom fails
     *
     * @param _tokenAddress - the token address (use 0x0 for native token)
     * @param _amount - amount to transfer
     */
    function deposit(address _tokenAddress, uint256 _amount) external payable {
        transferFundsToMutualizer(_tokenAddress, _amount);
        emit FundsDeposited(_tokenAddress, _amount, msg.sender);
    }

    /**
     * @notice Withdraw funds from the mutualizer.
     *
     * Emits FundsWithdrawn event if successful.
     *
     * Reverts if:
     * - caller is not the mutualizer owner
     * - amount exceeds available balance
     * - token is native and transfer fails
     * - token is ERC20 and transferFrom fails
     *
     * @param _tokenAddress - the token address (use 0x0 for native token)
     * @param _amount - amount to transfer
     */
    function withdraw(address _tokenAddress, uint256 _amount) external onlyOwner {
        transferFundsFromMutualizer(_tokenAddress, _amount); // msg.sender is mutualizer owner

        emit FundsWithdrawn(_tokenAddress, _amount);
    }

    /**
     * @dev Returns true if this contract implements the interface defined by
     * `interfaceId`. See the corresponding
     * https://eips.ethereum.org/EIPS/eip-165#how-interfaces-are-identified[EIP section]
     * to learn more about how these ids are created.
     *
     * This function call must use less than 30 000 gas.
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return
            (interfaceId == type(IDRFeeMutualizer).interfaceId) ||
            (interfaceId == type(IDRFeeMutualizerClient).interfaceId) ||
            super.supportsInterface(interfaceId);
    }

    /**
     * @notice Returns agreement details and status for a given agreement id.
     *
     * Reverts if:
     * - agreement does not exist
     *
     * @param _agreementId - a unique identifier of the agreement
     * @return agreement - agreement details
     * @return status - agreement status
     */
    function getAgreement(
        uint256 _agreementId
    ) public view returns (Agreement memory agreement, AgreementStatus memory status) {
        require(_agreementId > 0 && _agreementId < agreements.length, INVALID_AGREEMENT);

        agreement = agreements[_agreementId];
        status = agreementStatus[_agreementId];
    }

    /**
     * @notice Returns agreement id, agreement details and status for given seller and token.
     *
     * Reverts if:
     * - agreement does not exist
     * - agreement is not confirmed yet
     *
     * @param _seller - the seller address
     * @param _token - the token address (use 0x0 for native token)
     * @return agreementId - a unique identifier of the agreement
     * @return agreement - agreement details
     * @return status - agreement status
     */
    function getConfirmedAgreementBySellerAndToken(
        address _seller,
        address _token
    ) external view returns (uint256 agreementId, Agreement memory agreement, AgreementStatus memory status) {
        agreementId = agreementBySellerAndToken[_seller][_token];
        (agreement, status) = getAgreement(agreementId);
    }

    /**
     * @notice Internal function to handle incoming funds.
     *
     * Reverts if:
     * - token is native and sent value is not equal to _amount
     * - token is ERC20, but some native value is sent
     * - token is ERC20 and sent value is not equal to _amount
     * - token is ERC20 and transferFrom fails
     *
     * @param _tokenAddress - the token address (use 0x0 for native token)
     * @param _amount - amount to transfer
     */
    function transferFundsToMutualizer(address _tokenAddress, uint256 _amount) internal {
        if (_tokenAddress == address(0)) {
            require(msg.value == _amount, INSUFFICIENT_VALUE_RECEIVED);
        } else {
            require(msg.value == 0, NATIVE_NOT_ALLOWED);
            IERC20 token = IERC20(_tokenAddress);
            uint256 balanceBefore = token.balanceOf(address(this));
            token.safeTransferFrom(msg.sender, address(this), _amount);
            uint256 balanceAfter = token.balanceOf(address(this));
            require(balanceAfter - balanceBefore == _amount, INSUFFICIENT_VALUE_RECEIVED);
        }
    }

    /**
     * @notice Internal function to handle outcoming funds.
     * It always sends them to msg.sender, which is either the mutualizer owner or the protocol.
     *
     * Reverts if:
     * - amount exceeds available balance
     * - token is native and transfer fails
     * - token is ERC20 and transferFrom fails
     *
     * @param _tokenAddress - the token address (use 0x0 for native token)
     * @param _amount - amount to transfer
     */
    function transferFundsFromMutualizer(address _tokenAddress, uint256 _amount) internal {
        uint256 mutualizerBalance = _tokenAddress == address(0)
            ? address(this).balance
            : IERC20(_tokenAddress).balanceOf(address(this));

        require(mutualizerBalance >= _amount, INSUFFICIENT_AVAILABLE_FUNDS);

        if (_tokenAddress == address(0)) {
            (bool success, ) = msg.sender.call{ value: _amount }("");
            require(success, TOKEN_TRANSFER_FAILED);
        } else {
            IERC20 token = IERC20(_tokenAddress);
            token.safeTransfer(msg.sender, _amount);
        }
    }

    /**
     * @notice Gets the agreement from the storage and verifies that it is valid.
     *
     * Reverts if:
     * - agreement does not exist
     * - agreement is voided
     * - agreement expired
     *
     * @param _agreementId - a unique identifier of the agreement
     */
    function getValidAgreement(
        uint256 _agreementId
    ) internal view returns (Agreement storage agreement, AgreementStatus storage status) {
        require(_agreementId > 0 && _agreementId < agreements.length, INVALID_AGREEMENT);

        status = agreementStatus[_agreementId];
        require(!status.voided, AGREEMENT_VOIDED);

        agreement = agreements[_agreementId];
        require(agreement.endTimestamp > block.timestamp, AGREEMENT_EXPIRED);
    }

    modifier onlyProtocol() {
        require(msg.sender == protocolAddress, ONLY_PROTOCOL);
        _;
    }
}
