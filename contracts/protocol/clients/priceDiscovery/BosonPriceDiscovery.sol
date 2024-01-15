// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IWrappedNative } from "../../../interfaces/IWrappedNative.sol";
import { IBosonVoucher } from "../../../interfaces/clients/IBosonVoucher.sol";
import { FundsLib } from "../../libs/FundsLib.sol";
import { Address } from "@openzeppelin/contracts/utils/Address.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC721Receiver } from "../../../interfaces/IERC721Receiver.sol";
import { BosonTypes } from "../../../domain/BosonTypes.sol";
import { BosonErrors } from "../../../domain/BosonErrors.sol";

/**
 * @title BosonPriceDiscovery
 *
 * @dev Boson Price Discovery is a external contract that is used to determine the price of an exchange.
 */
contract BosonPriceDiscovery is IERC721Receiver, BosonErrors {
    using Address for address;
    using SafeERC20 for IERC20;

    IWrappedNative internal immutable wNative;

    bool private voucherExpected;
    uint256 private incomingTokenId;

    /**
     * @notice
     * For offers with native exchange token, it is expected the the price discovery contracts will
     * operate with wrapped native token. Set the address of the wrapped native token in the constructor.
     *
     * @param _wNative - the address of the wrapped native token
     */
    //solhint-disable-next-line
    constructor(address _wNative) {
        wNative = IWrappedNative(_wNative);
    }

    /**
     * @notice Fulfils an ask order on external contract.
     *
     * Reverts if:
     * - Offer price is in native token and caller does not send enough
     * - Offer price is in some ERC20 token and caller also sends native currency
     * - Calling transferFrom on token fails for some reason (e.g. the Boson Price Discovery Client is not approved to transfer)
     * - Call to price discovery contract fails
     * - Received amount is greater from price set in price discovery
     * - Boson Price Discovery Client does not receive the voucher
     * - Transfer of voucher to the buyer fails for some reason (e.g. buyer is contract that doesn't accept voucher)
     * - New voucher owner is not buyer wallet
     * - Token id sent to buyer and token id set by the caller don't match (if caller has provided token id)
     *
     * @param _tokenId - the id of the token
     * @param _exchangeToken - the address of the exchange contract
     * @param _priceDiscovery - the fully populated BosonTypes.PriceDiscovery struct
     * @param _buyer - the buyer's address (caller can commit on behalf of a buyer)
     * @param _bosonVoucher - the boson voucher contract
     * @param _msgSender - the address of the caller, as seen in boson protocol
     * @return actualPrice - the actual price of the order
     */
    function fulfilAskOrder(
        uint256 _tokenId,
        address _exchangeToken,
        BosonTypes.PriceDiscovery calldata _priceDiscovery,
        address _buyer,
        IBosonVoucher _bosonVoucher,
        address payable _msgSender
    ) external returns (uint256 actualPrice) {
        // ToDo: allow only protocol calls

        // Boson protocol (the caller) is trusted, so it can be assumed that all funds were forwarded to this contract

        // If token is ERC20, approve price discovery contract to transfer protocol funds
        if (_exchangeToken != address(0)) {
            IERC20(_exchangeToken).forceApprove(_priceDiscovery.conduit, _priceDiscovery.price);
        }

        uint256 thisBalanceBefore = getBalance(_exchangeToken);

        // Call the price discovery contract
        voucherExpected = true;
        _priceDiscovery.priceDiscoveryContract.functionCallWithValue(
            _priceDiscovery.priceDiscoveryData,
            _priceDiscovery.price
        );

        uint256 thisBalanceAfter = getBalance(_exchangeToken);
        if (thisBalanceBefore < thisBalanceAfter) revert NegativePriceNotAllowed();
        actualPrice = thisBalanceBefore - thisBalanceAfter;

        // If token is ERC20, reset approval
        if (_exchangeToken != address(0)) {
            IERC20(_exchangeToken).forceApprove(address(_priceDiscovery.conduit), 0);
        }

        // This is true, assuming the price discvery contract used safeTransferFrom
        // If it used transferFrom, then this contract might own it, even if the incomingTokenId == 0
        // Currenltly, we don't support transferFrom. Might be added in the future, but it requires additional call to the Boson protocol
        if (incomingTokenId == 0) revert VoucherNotReceived();

        // Incoming token id must match the expected token id
        if (_tokenId == 0) {
            _tokenId = incomingTokenId;
        } else {
            if (_tokenId != incomingTokenId) revert TokenIdMismatch();
        }

        // Transfer voucher to buyer
        _bosonVoucher.safeTransferFrom(address(this), _buyer, _tokenId);

        uint256 overchargedAmount = _priceDiscovery.price - actualPrice;

        if (overchargedAmount > 0) {
            // Return the surplus to caller
            FundsLib.transferFundsFromProtocol(_exchangeToken, _msgSender, overchargedAmount);
        }

        delete incomingTokenId;
        delete voucherExpected;

        // Send the actual price back to the protocol
        // if (actualPrice>0) {
        // FundsLib.transferFundsFromProtocol(_exchangeToken, payable(msg.sender), actualPrice);
        // }
    }

    /**
     * @notice Fulfils a bid order on external contract.
     *
     * Reverts if:
     * - Token id not set by the caller
     * - Calling transferFrom on token fails for some reason (e.g. protocol is not approved to transfer)
     * - Transfer of voucher to the buyer fails for some reason (e.g. buyer is contract that doesn't accept voucher)
     * - Received ERC20 token amount differs from the expected value
     * - Call to price discovery contract fails
     * - Protocol balance change after price discovery call is lower than the expected price
     * - Reseller did not approve protocol to transfer exchange token in escrow
     * - New voucher owner is not buyer wallet
     * - Token id sent to buyer and token id set by the caller don't match
     *
     * @param _tokenId - the id of the token
     * @param _exchangeToken - the address of the exchange token
     * @param _priceDiscovery - the fully populated BosonTypes.PriceDiscovery struct
     * @param _seller - the seller's address
     * @param _bosonVoucher - the boson voucher contract
     * @return actualPrice - the actual price of the order
     */
    function fulfilBidOrder(
        uint256 _tokenId,
        address _exchangeToken,
        BosonTypes.PriceDiscovery calldata _priceDiscovery,
        address _seller,
        IBosonVoucher _bosonVoucher
    ) external payable returns (uint256 actualPrice) {
        // ToDo: allow only protocol calls

        // Transfer seller's voucher to protocol
        // Don't need to use safe transfer from, since that protocol can handle the voucher
        _bosonVoucher.transferFrom(_seller, address(this), _tokenId);

        // Approve conduit to transfer voucher. There is no need to reset approval afterwards, since protocol is not the voucher owner anymore
        _bosonVoucher.approve(_priceDiscovery.conduit, _tokenId);
        if (_exchangeToken == address(0)) _exchangeToken = address(wNative);

        // Track native balance just in case if seller sends some native currency or price discovery contract does
        // This is the balance that protocol had, before commit to offer was called
        uint256 thisNativeBalanceBefore = getBalance(address(0)) - msg.value;

        // Get protocol balance before calling price discovery contract
        uint256 thisBalanceBefore = getBalance(_exchangeToken);

        // Call the price discovery contract
        _priceDiscovery.priceDiscoveryContract.functionCallWithValue(_priceDiscovery.priceDiscoveryData, msg.value);

        // Get protocol balance after calling price discovery contract
        uint256 thisBalanceAfter = getBalance(_exchangeToken);

        // Check the native balance and return the surplus to seller
        uint256 thisNativeBalanceAfter = getBalance(address(0));
        if (thisNativeBalanceAfter > thisNativeBalanceBefore) {
            // Return the surplus to seller
            FundsLib.transferFundsFromProtocol(
                address(0),
                payable(_seller),
                thisNativeBalanceAfter - thisNativeBalanceBefore
            );
        }

        // Calculate actual price
        if (thisBalanceAfter < thisBalanceBefore) revert NegativePriceNotAllowed();
        actualPrice = thisBalanceAfter - thisBalanceBefore;

        // Make sure that balance change is at least the expected price
        if (actualPrice < _priceDiscovery.price) revert InsufficientValueReceived();

        // Verify that token id provided by caller matches the token id that the price discovery contract has sent to buyer

        // ? what about that
        // getAndVerifyTokenId(_tokenId);
        if (_bosonVoucher.ownerOf(_tokenId) == address(this)) {
            revert VoucherNotTransferred();
        }

        // Send the actual price back to the protocol
        if (actualPrice > 0) {
            FundsLib.transferFundsFromProtocol(_exchangeToken, payable(msg.sender), actualPrice);
        }

        delete incomingTokenId;
        delete voucherExpected;
    }

    /*
     * @notice Call `unwrap` (or equivalent) function on the price discovery contract.
     *
     * Reverts if:
     * - Token id not set by the caller
     * - Protocol balance doesn't increase by the expected amount.
     *   Balance change must be equal to the price set by the caller
     * - Token id sent to buyer and token id set by the caller don't match
     *
     * @param _exchangeToken - the address of the exchange contract
     * @param _priceDiscovery - the fully populated BosonTypes.PriceDiscovery struct
     * @return actualPrice - the actual price of the order
     */
    function handleWrapper(
        address _exchangeToken,
        BosonTypes.PriceDiscovery calldata _priceDiscovery
    ) external payable returns (uint256 actualPrice) {
        // ToDo: allow only protocol calls

        // Check balance before calling wrapper
        bool isNative = _exchangeToken == address(0);
        if (isNative) _exchangeToken = address(wNative);
        uint256 thisBalanceBefore = getBalance(_exchangeToken);

        // Track native balance just in case if seller sends some native currency.
        // All native currency is forwarded to the wrapper, which should not return any back.
        // If it does, we revert later in the code.
        uint256 thisNativeBalanceBefore = getBalance(address(0)) - msg.value;

        // Call the price discovery contract
        _priceDiscovery.priceDiscoveryContract.functionCallWithValue(_priceDiscovery.priceDiscoveryData, msg.value);

        // Check the native balance and revert if there is a surplus
        uint256 thisNativeBalanceAfter = getBalance(address(0));
        if (thisNativeBalanceAfter != thisNativeBalanceBefore) revert NativeNotAllowed();

        // Check balance after the price discovery call
        uint256 thisBalanceAfter = getBalance(_exchangeToken);

        // Verify that actual price is within the expected range
        if (thisBalanceAfter < thisBalanceBefore) revert NegativePriceNotAllowed();
        actualPrice = thisBalanceAfter - thisBalanceBefore;

        // when working with wrappers, price is already known, so the caller should set it exactly
        // If protocol receive more than expected, it does not return the surplus to the caller
        if (actualPrice != _priceDiscovery.price) revert PriceTooLow();

        // Verify that token id provided by caller matches the token id that the price discovery contract has sent to buyer
        // getAndVerifyTokenId(_tokenId);
        // Send the actual price back to the protocol
        if (actualPrice > 0) {
            FundsLib.transferFundsFromProtocol(_exchangeToken, payable(msg.sender), actualPrice);
        }

        delete incomingTokenId;
        delete voucherExpected;
    }

    /**
     * @notice Returns the balance of the protocol for the given token address
     *
     * @param _tokenAddress - the address of the token to check the balance for
     * @return balance - the balance of the protocol for the given token address
     */
    function getBalance(address _tokenAddress) internal view returns (uint256) {
        return _tokenAddress == address(0) ? address(this).balance : IERC20(_tokenAddress).balanceOf(address(this));
    }

    /**
     * @dev See {IERC721Receiver-onERC721Received}.
     *
     * Always returns `IERC721Receiver.onERC721Received.selector`.
     */
    function onERC721Received(
        address,
        address,
        uint256 _tokenId,
        bytes calldata
    ) external virtual override returns (bytes4) {
        if (!voucherExpected) revert UnexpectedERC721Received();

        incomingTokenId = _tokenId;

        return this.onERC721Received.selector;
    }

    receive() external payable {
        // This is needed to receive native currency
    }
}
