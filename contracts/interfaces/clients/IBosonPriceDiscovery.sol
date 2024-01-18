// SPDX-License-Identifier: MIT
pragma solidity 0.8.22;

import { IBosonVoucher } from "./IBosonVoucher.sol";
import { IERC721Receiver } from "../IERC721Receiver.sol";
import { BosonTypes } from "../../domain/BosonTypes.sol";

/**
 * @title BosonPriceDiscovery
 *
 * @notice This is the interface for the Boson Price Discovery contract.
 *
 * The ERC-165 identifier for this interface is: 0x9ec79e15
 */
interface IBosonPriceDiscovery is IERC721Receiver {
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
    ) external returns (uint256 actualPrice);

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
    ) external payable returns (uint256 actualPrice);

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
    ) external payable returns (uint256 actualPrice);
}
