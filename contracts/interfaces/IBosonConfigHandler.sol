// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import "../domain/BosonTypes.sol";

/**
 * @title IBosonConfigHandler
 *
 * @notice Handles management of various protocol-related settings.
 *
 * The ERC-165 identifier for this interface is: 0x1753a1ce
 */
interface IBosonConfigHandler {

    /// Events
    event VoucherAddressChanged(address indexed voucher, address indexed changedBy);
    event TokenAddressChanged(address indexed tokenAddress, address indexed changedBy);
    event TreasuryAddressChanged(address indexed treasuryAddress, address indexed changedBy);
    event ProtocolFeePercentageChanged(uint16 indexed feePercentage, address indexed changedBy);

    /**
     * @notice Sets the address of the Boson Token (ERC-20) contract.
     *
     * Emits a TokenAddressChanged event.
     *
     * @param _token - the address of the token contract
     */
    function setTokenAddress(address payable _token)
    external;

    /**
     * @notice The tokenAddress getter
     */
    function getTokenAddress()
    external
    view
    returns (address payable);

    /**
     * @notice Sets the address of the Boson Protocol treasury.
     *
     * Emits a TreasuryAddressChanged event.
     *
     * @param _treasuryAddress - the address of the treasury
     */
    function setTreasuryAddress(address payable _treasuryAddress)
    external;

    /**
     * @notice The treasuryAddress getter
     */
    function getTreasuryAddress()
    external
    view
    returns (address payable);

    /**
     * @notice Sets the address of the Voucher NFT address (proxy)
     *
     * Emits a VoucherAddressChanged event.
     *
     * @param _voucher - the address of the nft contract
     */
    function setVoucherAddress(address _voucher)
    external;

    /**
     * @notice The Voucher address getter
     */
    function getVoucherAddress()
    external
    view
    returns (address);

    /**
     * @notice Sets the protocol fee percentage.
     *
     * Emits a ProtocolFeePercentageChanged event.
     *
     * Represent percentage value as an unsigned int by multiplying the percentage by 100:
     * e.g, 1.75% = 175, 100% = 10000
     *
     * @param _feePercentage - the percentage that will be taken as a fee from the net of a Boson Protocol exchange
     */
    function setProtocolFeePercentage(uint16 _feePercentage)
    external;

    /**
     * @notice Get the protocol fee percentage
     */
    function getProtocolFeePercentage()
    external
    view
    returns (uint16);

}