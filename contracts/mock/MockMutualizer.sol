// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import { IBosonFundsHandler } from "../interfaces/handlers/IBosonFundsHandler.sol";
import { IDRFeeMutualizer } from "../interfaces/clients/IDRFeeMutualizer.sol";
import { IERC165 } from "../interfaces/IERC165.sol";
import { FundsBase } from "../protocol/bases/FundsBase.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { BosonErrors } from "../domain/BosonErrors.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title MaliciousMutualizer
 *
 * @notice Contract that acts as a buyer for testing purposes
 */
contract MaliciousMutualizer is Ownable, FundsBase {
    using SafeERC20 for IERC20;

    uint256 public sellerId;
    address private immutable BOSON_PROTOCOL;

    constructor(uint256 _sellerId, address _bosonProtocol) {
        sellerId = _sellerId;
        BOSON_PROTOCOL = _bosonProtocol;
    }

    function isSellerCovered(uint256 _sellerId, uint256, address, uint256) external view returns (bool) {
        return _sellerId == sellerId;
    }

    // attack via deposit funds; toDo attack via multiple transfers
    function requestDRFee(
        uint256 _sellerId,
        uint256 _feeAmount,
        address _tokenAddress,
        uint256 _exchangeId,
        uint256 _disputeResolverId
    ) external returns (bool success) {
        if (_sellerId != sellerId) {
            return false;
        }
        // instead of just sending the fee, deposit it to the seller's account.
        // the seller can then withdraw it from the protocol, while the mutualizer will also receive it after the
        // successful finalization of the exchange
        if (_tokenAddress != address(0)) {
            IERC20(_tokenAddress).safeApprove(BOSON_PROTOCOL, _feeAmount);
            IBosonFundsHandler(BOSON_PROTOCOL).depositFunds(_sellerId, _tokenAddress, _feeAmount);
        } else {
            IBosonFundsHandler(BOSON_PROTOCOL).depositFunds{ value: _feeAmount }(_sellerId, _tokenAddress, _feeAmount);
        }

        return true;
    }

    function returnDRFee(uint256 _exchangeId, uint256 _feeAmount) external payable {
        // do nothing
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IDRFeeMutualizer).interfaceId || interfaceId == type(IERC165).interfaceId;
    }

    function deposit(address _tokenAddress, uint256 _amount) external payable {
        address msgSender = _msgSender();

        if (_tokenAddress == address(0)) {
            if (msg.value != _amount) revert BosonErrors.InsufficientValueReceived();
        } else {
            if (msg.value != 0) revert BosonErrors.NativeNotAllowed();
            transferFundsIn(_tokenAddress, msgSender, _amount);
        }
    }

    function withdraw(address _tokenAddress, uint256 _amount, address payable _to) external onlyOwner {
        transferFundsOut(_tokenAddress, _to, _amount);
    }
}
