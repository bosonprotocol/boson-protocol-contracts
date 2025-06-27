// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ERC165 } from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import { IWrappedNative } from "../../../interfaces/IWrappedNative.sol";
import { IBosonVoucher } from "../../../interfaces/clients/IBosonVoucher.sol";
import { IBosonPriceDiscovery } from "../../../interfaces/clients/IBosonPriceDiscovery.sol";
import { IERC721Receiver } from "../../../interfaces/IERC721Receiver.sol";
import { FundsLib } from "../../libs/FundsLib.sol";
import { Address } from "@openzeppelin/contracts/utils/Address.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { BosonTypes } from "../../../domain/BosonTypes.sol";
import { BosonErrors } from "../../../domain/BosonErrors.sol";

/**
 * @title BosonPriceDiscovery
 *
 * @dev Boson Price Discovery is an external contract that is used to determine the price of an exchange.
 */
contract BosonPriceDiscovery is ERC165, FundsLib, IBosonPriceDiscovery, BosonErrors {
    using Address for address;
    using SafeERC20 for IERC20;

    IWrappedNative internal immutable wNative;

    address private incomingTokenAddress;

    address private immutable bosonProtocolAddress;

    /**
     * @notice
     * For offers with native exchange token, it is expected that the price discovery contracts will
     * operate with wrapped native token. Set the address of the wrapped native token in the constructor.
     *
     * @param _wNative - the address of the wrapped native token
     */
    //solhint-disable-next-line
    constructor(address _wNative, address _bosonProtocolAddress) {
        if (_wNative == address(0) || _bosonProtocolAddress == address(0)) revert InvalidAddress();
        wNative = IWrappedNative(_wNative);
        bosonProtocolAddress = _bosonProtocolAddress;
    }

    /**
     * @notice Fulfils an ask order on external contract.
     *
     * Reverts if:
     * - Call to price discovery contract fails
     * - The implied price is negative
     * - Any external calls to erc20 contract fail
     *
     * @param _exchangeToken - the address of the exchange contract
     * @param _priceDiscovery - the fully populated BosonTypes.PriceDiscovery struct
     * @param _bosonVoucher - the boson voucher contract
     * @param _msgSender - the address of the caller, as seen in boson protocol
     * @return actualPrice - the actual price of the order
     */
    function fulfilAskOrder(
        address _exchangeToken,
        BosonTypes.PriceDiscovery calldata _priceDiscovery,
        IBosonVoucher _bosonVoucher,
        address payable _msgSender
    ) external onlyProtocol returns (uint256 actualPrice) {
        // Boson protocol (the caller) is trusted, so it can be assumed that all funds were forwarded to this contract
        // If token is ERC20, approve price discovery contract to transfer the funds
        if (_exchangeToken != address(0) && _priceDiscovery.price > 0) {
            IERC20(_exchangeToken).forceApprove(_priceDiscovery.conduit, _priceDiscovery.price);
        }

        incomingTokenAddress = address(_bosonVoucher);
        (uint256 thisBalanceBefore, uint256 thisBalanceAfter) = callPriceDiscoveryAndTrackBalances(
            _priceDiscovery,
            _exchangeToken,
            _msgSender,
            0
        );

        if (thisBalanceBefore < thisBalanceAfter) revert NegativePriceNotAllowed();
        unchecked {
            actualPrice = thisBalanceBefore - thisBalanceAfter;
        }

        // If token is ERC20, reset approval
        if (_exchangeToken != address(0) && _priceDiscovery.price > 0) {
            IERC20(_exchangeToken).forceApprove(address(_priceDiscovery.conduit), 0);
        }

        uint256 overchargedAmount = _priceDiscovery.price - actualPrice;

        if (overchargedAmount > 0) {
            // Return the surplus to caller
            transferFundsFromProtocol(_exchangeToken, _msgSender, overchargedAmount);
        }

        // sometimes tokenId is unknow, so we approve all. Since protocol is trusted, this is ok.
        if (!_bosonVoucher.isApprovedForAll(address(this), bosonProtocolAddress)) {
            _bosonVoucher.setApprovalForAll(bosonProtocolAddress, true); // approve protocol
        }

        // In ask order, the this client does not receive the proceeds of the sale.
        // Boson protocol handles the encumbering of the proceeds.
    }

    /**
     * @notice Fulfils a bid order on external contract.
     *
     * Reverts if:
     * - Call to price discovery contract fails
     * - Protocol balance change after price discovery call is lower than the expected price
     * - This contract is still owner of the voucher
     * - Token id sent to buyer and token id set by the caller don't match
     * - The implied price is negative
     * - Any external calls to erc20 contract fail
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
    ) external payable onlyProtocol returns (uint256 actualPrice) {
        // Approve conduit to transfer voucher. There is no need to reset approval afterwards, since protocol is not the voucher owner anymore
        _bosonVoucher.approve(_priceDiscovery.conduit, _tokenId);
        if (_exchangeToken == address(0)) _exchangeToken = address(wNative);

        (uint256 thisBalanceBefore, uint256 thisBalanceAfter) = callPriceDiscoveryAndTrackBalances(
            _priceDiscovery,
            _exchangeToken,
            _seller,
            msg.value
        );

        // Calculate actual price
        if (thisBalanceAfter < thisBalanceBefore) revert NegativePriceNotAllowed();
        unchecked {
            actualPrice = thisBalanceAfter - thisBalanceBefore;
        }

        // Make sure that balance change is at least the expected price
        if (actualPrice < _priceDiscovery.price) revert InsufficientValueReceived();

        // Make sure the voucher was transferred
        if (_bosonVoucher.ownerOf(_tokenId) == address(this)) {
            revert VoucherNotTransferred();
        }

        // Send the actual price back to the protocol
        if (actualPrice > 0) {
            transferFundsFromProtocol(_exchangeToken, payable(bosonProtocolAddress), actualPrice);
        }
    }

    /**
     * @notice Call `unwrap` (or equivalent) function on the price discovery contract.
     *
     * Reverts if:
     * - Protocol balance doesn't increase by the expected amount.
     * - Token id sent to buyer and token id set by the caller don't match
     * - The wrapper contract sends back the native currency
     * - The implied price is negative
     *
     * @param _exchangeToken - the address of the exchange contract
     * @param _priceDiscovery - the fully populated BosonTypes.PriceDiscovery struct
     * @return actualPrice - the actual price of the order
     */
    function handleWrapper(
        address _exchangeToken,
        BosonTypes.PriceDiscovery calldata _priceDiscovery
    ) external payable onlyProtocol returns (uint256 actualPrice) {
        // Check balance before calling wrapper
        bool isNative = _exchangeToken == address(0);
        if (isNative) _exchangeToken = address(wNative);

        (uint256 thisBalanceBefore, uint256 thisBalanceAfter) = callPriceDiscoveryAndTrackBalances(
            _priceDiscovery,
            _exchangeToken,
            address(0),
            msg.value
        );

        // Verify that actual price is within the expected range
        if (thisBalanceAfter < thisBalanceBefore) revert NegativePriceNotAllowed();
        unchecked {
            actualPrice = thisBalanceAfter - thisBalanceBefore;
        }
        // when working with wrappers, price is already known, so the caller should set it exactly
        // If protocol receive more than expected, it does not return the surplus to the caller
        if (actualPrice != _priceDiscovery.price) revert PriceMismatch();

        // Verify that token id provided by caller matches the token id that the price discovery contract has sent to buyer
        // getAndVerifyTokenId(_tokenId);
        // Send the actual price back to the protocol
        if (actualPrice > 0) {
            transferFundsFromProtocol(_exchangeToken, payable(bosonProtocolAddress), actualPrice);
        }
    }

    /**
     * @notice Call price discovery method and track balances
     *
     * Reverts if:
     * - Call to price discovery reverts
     *
     * @param _priceDiscovery - the fully populated BosonTypes.PriceDiscovery struct
     * @param _exchangeToken - the address of the exchange contract
     * @param _msgSender - the address of the caller, as seen in boson protocol
     * @param _msgValue - the value sent with the call
     */
    function callPriceDiscoveryAndTrackBalances(
        BosonTypes.PriceDiscovery calldata _priceDiscovery,
        address _exchangeToken,
        address _msgSender,
        uint256 _msgValue
    ) internal returns (uint256 thisBalanceBefore, uint256 thisBalanceAfter) {
        // Track native balance just in case if the sender sends some native currency or price discovery contract does
        // This is the balance that protocol had, before commit to offer was called
        uint256 thisNativeBalanceBefore = getBalance(address(0)) - _msgValue;

        // Get protocol balance before calling price discovery contract
        thisBalanceBefore = getBalance(_exchangeToken);

        // Call the price discovery contract
        _priceDiscovery.priceDiscoveryContract.functionCallWithValue(_priceDiscovery.priceDiscoveryData, _msgValue);

        // Get protocol balance after calling price discovery contract
        thisBalanceAfter = getBalance(_exchangeToken);

        // Check the native balance and return the surplus to the sender
        uint256 thisNativeBalanceAfter = getBalance(address(0));
        if (thisNativeBalanceAfter > thisNativeBalanceBefore) {
            // _msgSender==address(0) represents the wrapper, where it's not allowed to return the surplus
            if (_msgSender == address(0)) revert NativeNotAllowed();

            unchecked {
                // Return the surplus to the sender
                transferFundsFromProtocol(
                    address(0),
                    payable(_msgSender),
                    thisNativeBalanceAfter - thisNativeBalanceBefore
                );
            }
        }
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
    function onERC721Received(address, address, uint256, bytes calldata) external virtual override returns (bytes4) {
        if (incomingTokenAddress != msg.sender) revert UnexpectedERC721Received();

        delete incomingTokenAddress;

        return this.onERC721Received.selector;
    }

    /**
     * @notice Implements the {IERC165} interface.
     *
     */
    function supportsInterface(bytes4 _interfaceId) public view override returns (bool) {
        return (_interfaceId == type(IBosonPriceDiscovery).interfaceId ||
            _interfaceId == type(IERC721Receiver).interfaceId ||
            super.supportsInterface(_interfaceId));
    }

    modifier onlyProtocol() {
        if (msg.sender != bosonProtocolAddress) revert AccessDenied();
        _;
    }

    receive() external payable {
        // This is needed to receive native currency
    }
}
