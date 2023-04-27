// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.9;
import { IDRFeeMutualizer } from "../../../interfaces/clients/IDRFeeMutualizer.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// import { ClientBase } from "../../bases/ClientBase.sol";

/**
 * @title DRFeeMutualizer
 * @notice This is a reference implementation of Dispute resolver fee mutualizer.
 *
 */
contract DRFeeMutualizer is IDRFeeMutualizer, Ownable {
    using SafeERC20 for IERC20;

    address private immutable protocolAddress;

    struct Agreement {
        address sellerAddress;
        address token;
        uint256 maxMutualizedAmountPerTransaction;
        uint256 maxTotalMutualizedAmount;
        uint256 premium;
        uint128 startTimestamp;
        uint128 endTimestamp;
        bool refundOnCancel;
        bool voided;
    }

    Agreement[] private agreements;
    mapping(address => mapping(address => uint256)) private agreementBySellerAndToken;
    mapping(uint256 => uint256) private outstandingExchaganes;
    mapping(uint256 => uint256) private totalMutualizedAmount;
    mapping(uint256 => uint256) private agreementByUuid;
    uint256 private agreementCounter;

    event AgreementCreated(address indexed sellerAddress, uint256 indexed agreementId, Agreement agreement);
    event AgreementConfirmed(address indexed sellerAddress, uint256 indexed agreementId);
    event DRFeeReturned(uint256 indexed uuid, uint256 feeAmount, bytes context);

    constructor(address _protocolAddress) {
        protocolAddress = _protocolAddress;
        Agreement memory emptyAgreement;
        agreements.push(emptyAgreement); // add empty agreement to fill index 0, otherwise we need to manipulate indices otherwise
    }

    /**
     * @notice Tells if mutualizer will covert fee amount for a given seller and requrested by a given address.
     *
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

        // instead of returning, we could also revert with a reason
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
        require(msg.sender == protocolAddress, "Only protocol can call this function");
        uint256 agreementId = agreementBySellerAndToken[_sellerAddress][_token];
        Agreement storage agreement = agreements[agreementId];

        require(agreement.startTimestamp <= block.timestamp, "Agreement not started yet");
        require(agreement.endTimestamp >= block.timestamp, "Agreement expired");
        require(!agreement.voided, "Agreement voided");
        require(
            agreement.maxMutualizedAmountPerTransaction >= _feeAmount,
            "Fee amount exceeds max mutualized amount per transaction"
        );

        totalMutualizedAmount[agreementId] += _feeAmount;
        require(
            agreement.maxTotalMutualizedAmount >= totalMutualizedAmount[agreementId],
            "Fee amount exceeds max total mutualized amount"
        );

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
        require(agreementId != 0, "Invalid uuid");
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

    function newAgreement(Agreement calldata _agreement) external onlyOwner {
        agreements.push(_agreement);
        uint256 agreementId = agreements.length - 1;

        emit AgreementCreated(_agreement.sellerAddress, agreementId, _agreement);
    }

    function payPremium(uint256 _agreementId) external payable {
        Agreement storage agreement = agreements[_agreementId];

        require(agreement.sellerAddress == msg.sender, "Invalid seller address");
        require(!agreement.voided, "Agreement voided");

        transferFundsToMutualizer(agreement.token, agreement.premium);

        // even if agreementBySellerAndToken[_agreement.sellerAddress][_agreement.token] exists, seller can overwrite it
        agreementBySellerAndToken[agreement.sellerAddress][agreement.token] = _agreementId;

        emit AgreementConfirmed(agreement.sellerAddress, _agreementId);
    }

    function getAgreement(uint256 _agreementId) external view returns (Agreement memory) {
        return agreements[_agreementId];
    }

    function voidAgreement(uint256 _agreementId) external {
        Agreement storage agreement = agreements[_agreementId];

        require(msg.sender == owner() || msg.sender == agreement.sellerAddress, "Invalid sender address");

        agreement.voided = true;

        if (agreement.refundOnCancel) {
            // calculate unused premium
            // what with the outstanding requests?
        }
    }

    function transferFundsToMutualizer(address _tokenAddress, uint256 _amount) internal {
        if (_tokenAddress == address(0)) {
            require(msg.value == _amount, "Invalid incoming amount");
        } else {
            require(msg.value == 0, "Invalid incoming amount");
            IERC20 token = IERC20(_tokenAddress);
            uint256 balanceBefore = token.balanceOf(address(this));
            token.safeTransferFrom(msg.sender, address(this), _amount);
            uint256 balanceAfter = token.balanceOf(address(this));
            require(balanceAfter - balanceBefore == _amount, "Invalid incoming amount");
        }
    }
}
