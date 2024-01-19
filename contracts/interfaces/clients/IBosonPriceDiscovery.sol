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
 * The ERC-165 identifier for this interface is: 0x8bcce417
 */
interface IBosonPriceDiscovery is IERC721Receiver {
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
    ) external returns (uint256 actualPrice);

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
    ) external payable returns (uint256 actualPrice);

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
    ) external payable returns (uint256 actualPrice);
}
