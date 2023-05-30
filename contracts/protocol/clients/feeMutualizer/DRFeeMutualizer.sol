// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.9;
import "../../../domain/BosonConstants.sol";
import { IDRFeeMutualizerClient } from "../../../interfaces/clients/IDRFeeMutualizer.sol";
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
    mapping(uint256 => uint256) private outstandingExchaganes;
    mapping(uint256 => uint256) private totalMutualizedAmount;
    mapping(uint256 => uint256) private agreementByUuid;
    uint256 private agreementCounter;

    constructor(address _protocolAddress) {
        protocolAddress = _protocolAddress;
        Agreement memory emptyAgreement;
        agreements.push(emptyAgreement); // add empty agreement to fill index 0, otherwise we need to manipulate indices otherwise
    }

    /**
     * @notice Tells if mutualizer will cover the fee amount for a given seller and requrested by a given address.
     *
     * @param _sellerAddress - the seller address
     * @param _token - the token address (use 0x0 for ETH)
     * @param _feeAmount - amount to cover
     * @param _feeRequester - address of the requester
     * @param _context - additional data, describing the context
     */
    function isSellerCovered(
        address _sellerAddress,
        address _token,
        uint256 _feeAmount,
        address _feeRequester,
        bytes calldata _context
    ) external view returns (bool) {
        uint256 agreementId = agreementBySellerAndToken[_sellerAddress][_token];
        Agreement storage agreement = agreements[agreementId];

        return (msg.sender == protocolAddress &&
            agreement.startTimestamp <= block.timestamp &&
            agreement.endTimestamp >= block.timestamp &&
            !agreement.voided &&
            agreement.maxMutualizedAmountPerTransaction >= _feeAmount &&
            agreement.maxTotalMutualizedAmount + _feeAmount >= totalMutualizedAmount[agreementId]);
    }

    /**
     * @notice Request the mutualizer to cover the fee amount.
     *
     * @dev Verify that seller is covered and send the fee amount to the msg.sender.
     * Returned uuid can be used to track the status of the request.
     *
     * @param _sellerAddress - the seller address
     * @param _token - the token address (use 0x0 for ETH)
     * @param _feeAmount - amount to cover
     * @param _context - additional data, describing the context
     * @return isCovered - true if the seller is covered
     * @return uuid - unique identifier of the request
     */
    function requestDRFee(
        address _sellerAddress,
        address _token,
        uint256 _feeAmount,
        bytes calldata _context
    ) external returns (bool isCovered, uint256 uuid) {
        require(msg.sender == protocolAddress, ONLY_PROTOCOL);
        uint256 agreementId = agreementBySellerAndToken[_sellerAddress][_token];
        Agreement storage agreement = agreements[agreementId];

        require(agreement.startTimestamp <= block.timestamp, AGREEMENT_NOT_STARTED);
        require(agreement.endTimestamp >= block.timestamp, AGREEMENT_EXPIRED);
        require(!agreement.voided, AGREEMENT_VOIDED);
        require(agreement.maxMutualizedAmountPerTransaction >= _feeAmount, EXCEEDED_SINGLE_FEE);

        totalMutualizedAmount[agreementId] += _feeAmount;
        require(agreement.maxTotalMutualizedAmount >= totalMutualizedAmount[agreementId], EXCEEDED_TOTAL_FEE);

        outstandingExchaganes[agreementId]++;

        agreementByUuid[++agreementCounter] = agreementId;
        if (agreement.token == address(0)) {
            payable(msg.sender).transfer(_feeAmount);
        } else {
            IERC20 token = IERC20(agreement.token);
            token.safeTransfer(msg.sender, _feeAmount);
        }

        return (true, agreementCounter);
    }

    /**
     * @notice Return fee to the mutualizer.
     *
     * @dev Returned amount can be between 0 and _feeAmount that was requested for the given uuid.
     *
     * @param _uuid - unique identifier of the request
     * @param _feeAmount - returned amount
     * @param _context - additional data, describing the context
     */
    function returnDRFee(uint256 _uuid, uint256 _feeAmount, bytes calldata _context) external payable {
        uint256 agreementId = agreementByUuid[_uuid];
        require(agreementId != 0, INVALID_UUID);
        if (_feeAmount > 0) {
            Agreement storage agreement = agreements[agreementId];

            transferFundsToMutualizer(agreement.token, _feeAmount);

            if (_feeAmount < totalMutualizedAmount[agreementId]) {
                // not necessary if we restrict call to the protocol only
                totalMutualizedAmount[agreementId] -= _feeAmount;
            } else {
                totalMutualizedAmount[agreementId] = 0;
            }
        }

        outstandingExchaganes[agreementId]--;
        delete agreementByUuid[_uuid]; // prevent using the same uuid twice
        emit DRFeeReturned(_uuid, _feeAmount, _context);
    }

    /**
     * @notice Stores a new agreement between mutualizer and seller. Only contract owner can submint an agreement,
     * however it becomes valid only after seller confirms it by calling payPremium.
     *
     * Emits AgreementCreated event if successful.
     *
     * Reverts if:
     * - caller is not the contract owner
     * - parameter "voided" is set to true
     * - max mutualized amount per transaction is greater than max total mutualized amount
     * - max mutualized amount per transaction is 0
     * - end timestamp is not greater than start timestamp
     * - end timestamp is not greater than current block timestamp
     *
     * @param _agreement - a fully populated agreement object
     */
    function newAgreement(Agreement calldata _agreement) external onlyOwner {
        require(!_agreement.voided, INVALID_AGREEMENT);
        require(_agreement.maxMutualizedAmountPerTransaction <= _agreement.maxTotalMutualizedAmount, INVALID_AGREEMENT);
        require(_agreement.maxMutualizedAmountPerTransaction > 0, INVALID_AGREEMENT);
        require(_agreement.endTimestamp > _agreement.startTimestamp, INVALID_AGREEMENT);
        require(_agreement.endTimestamp > block.timestamp, INVALID_AGREEMENT);

        agreements.push(_agreement);
        uint256 agreementId = agreements.length - 1;

        emit AgreementCreated(_agreement.sellerAddress, agreementId, _agreement);
    }

    function payPremium(uint256 _agreementId) external payable {
        Agreement storage agreement = agreements[_agreementId];

        require(agreement.sellerAddress == msg.sender, INVALID_SELLER_ADDRESS);
        require(!agreement.voided, AGREEMENT_VOIDED);

        transferFundsToMutualizer(agreement.token, agreement.premium);

        // even if agreementBySellerAndToken[_agreement.sellerAddress][_agreement.token] exists, seller can overwrite it
        agreementBySellerAndToken[agreement.sellerAddress][agreement.token] = _agreementId;

        emit AgreementConfirmed(agreement.sellerAddress, _agreementId);
    }

    function voidAgreement(uint256 _agreementId) external {
        Agreement storage agreement = agreements[_agreementId];

        require(msg.sender == owner() || msg.sender == agreement.sellerAddress, INVALID_SELLER_ADDRESS);

        agreement.voided = true;

        if (agreement.refundOnCancel) {
            // calculate unused premium
            // what with the outstanding requests?
        }
    }

    function deposit(address _tokenAddress, uint256 _amount) external payable {
        transferFundsToMutualizer(_tokenAddress, _amount);
    }

    function withdraw(address _tokenAddress, uint256 _amount) external onlyOwner {
        if (_tokenAddress == address(0)) {
            payable(owner()).transfer(_amount);
        } else {
            IERC20 token = IERC20(_tokenAddress);
            token.safeTransfer(owner(), _amount);
        }
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
        return interfaceId == type(IDRFeeMutualizerClient).interfaceId || super.supportsInterface(interfaceId);
    }

    function getAgreement(uint256 _agreementId) external view returns (Agreement memory) {
        return agreements[_agreementId];
    }

    function transferFundsToMutualizer(address _tokenAddress, uint256 _amount) internal {
        if (_tokenAddress == address(0)) {
            require(msg.value == _amount, INSUFFICIENT_VALUE_RECEIVED);
        } else {
            require(msg.value == 0, INSUFFICIENT_VALUE_RECEIVED);
            IERC20 token = IERC20(_tokenAddress);
            uint256 balanceBefore = token.balanceOf(address(this));
            token.safeTransferFrom(msg.sender, address(this), _amount);
            uint256 balanceAfter = token.balanceOf(address(this));
            require(balanceAfter - balanceBefore == _amount, INSUFFICIENT_VALUE_RECEIVED);
        }
    }
}
