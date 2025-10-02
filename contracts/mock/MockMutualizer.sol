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
import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/**
 * @title MaliciousMutualizer
 *
 * @notice Contract that acts as a malicious DR fee mutualizer
 */
contract MaliciousMutualizer is Ownable, FundsBase {
    using SafeERC20 for IERC20;

    uint256 public sellerId;
    address internal immutable BOSON_PROTOCOL;

    constructor(uint256 _sellerId, address _bosonProtocol) {
        sellerId = _sellerId;
        BOSON_PROTOCOL = _bosonProtocol;
    }

    function isSellerCovered(uint256 _sellerId, uint256, address, uint256) external view returns (bool) {
        return _sellerId == sellerId;
    }

    // attack via deposit funds
    function requestDRFee(
        uint256 _sellerId,
        uint256 _feeAmount,
        address _tokenAddress,
        uint256 _exchangeId,
        uint256 _disputeResolverId
    ) external virtual returns (bool success) {
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

contract MaliciousMutualizer2 is MaliciousMutualizer {
    uint256 premintedVoucherId;
    address premintedVoucherContract;
    uint256 callCount;

    constructor(uint256 _sellerId, address _bosonProtocol) MaliciousMutualizer(_sellerId, _bosonProtocol) {}

    function setPremintedVoucherId(uint256 _premintedVoucherId) external {
        premintedVoucherId = _premintedVoucherId;
    }

    function setPremintedVoucherData(address _premintedVoucherContract, uint256 _premintedVoucherId) external {
        premintedVoucherId = _premintedVoucherId;
        premintedVoucherContract = _premintedVoucherContract;
    }

    // when it's invoked the 1st, transfer another preminted voucher, which will trigger onVoucherTransferred again.
    // in 2nd invocation, send the fee as expected.
    // N.B. the test is done for 2 vouchers, but it can be extended to more.
    function requestDRFee(
        uint256 _sellerId,
        uint256 _feeAmount,
        address _tokenAddress,
        uint256 _exchangeId,
        uint256 _disputeResolverId
    ) external override returns (bool success) {
        if (_sellerId != sellerId) {
            return false;
        }

        if (callCount == 0) {
            callCount++;
            // transfer the preminted voucher to the buyer, which will trigger onVoucherTransferred again.
            IERC721(premintedVoucherContract).transferFrom(owner(), owner(), premintedVoucherId);
            return true;
        } else {
            // send the fee as expected
            transferFundsOut(_tokenAddress, payable(BOSON_PROTOCOL), _feeAmount);
            return true;
        }
    }

    function onERC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes calldata data
    ) external returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}
