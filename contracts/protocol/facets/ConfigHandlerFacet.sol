// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import { IBosonConfigHandler } from  "../../interfaces/IBosonConfigHandler.sol";
import { DiamondLib } from  "../../diamond/DiamondLib.sol";
import { ProtocolBase } from  "../ProtocolBase.sol";
import { ProtocolLib } from  "../ProtocolLib.sol";

/**
 * @title ConfigHandlerFacet
 *
 * @notice Handles management of various protocol-related settings.
 */
contract ConfigHandlerFacet is IBosonConfigHandler, ProtocolBase {

    /**
     * @notice Facet Initializer
     *
     * @param _tokenAddress - address of Boson Token (ERC-20) contract
     * @param _treasuryAddress - address of Boson Protocol DAO multi-sig wallet
     * @param _voucherAddress - address of Boson Protocol Voucher NFT contract
     * @param _protocolFeePercentage - percentage that will be taken as a fee from the net of a Boson Protocol exchange (after royalties)
     * @param _maxOffersPerGroup - the maximum number of offers that a group can contain
     */
    function initialize(
        address payable _tokenAddress,
        address payable _treasuryAddress,
        address _voucherAddress,
        uint16 _protocolFeePercentage,
        uint16 _maxOffersPerGroup
    )
    public
    onlyUnInitialized(type(IBosonConfigHandler).interfaceId)
    {
        // Register supported interfaces
        DiamondLib.addSupportedInterface(type(IBosonConfigHandler).interfaceId);

        // Initialize protocol config params
        ProtocolLib.ProtocolStorage storage ps = protocolStorage();
        ps.tokenAddress = _tokenAddress;
        ps.treasuryAddress = _treasuryAddress;
        ps.voucherAddress = _voucherAddress;
        ps.protocolFeePercentage = _protocolFeePercentage;
        ps.maxOffersPerGroup = _maxOffersPerGroup;


        // Initialize protocol counters
        ProtocolLib.ProtocolCounters storage pc = protocolCounters();
        pc.nextAccountId = 1;
        pc.nextBundleId = 1;
        pc.nextExchangeId = 1;
        pc.nextGroupId = 1;
        pc.nextOfferId = 1;
        pc.nextTwinId = 1;

    }

    /**
     * @notice Sets the address of the Boson Protocol token contract.
     *
     * Emits a TokenAddressChanged event.
     *
     * @param _tokenAddress - the address of the token contract
     */
    function setTokenAddress(address payable _tokenAddress)
    external
    override
    onlyRole(ADMIN)
    {
        protocolStorage().tokenAddress = _tokenAddress;
        emit TokenAddressChanged(_tokenAddress, msg.sender);
    }

    /**
     * @notice The tokenAddress getter
     */
    function getTokenAddress()
    external
    override
    view
    returns (address payable)
    {
        return protocolStorage().tokenAddress;
    }

    /**
     * @notice Sets the address of the Boson Protocol multi-sig wallet.
     *
     * Emits a TreasuryAddressChanged event.
     *
     * @param _treasuryAddress - the address of the multi-sig wallet
     */
    function setTreasuryAddress(address payable _treasuryAddress)
    external
    override
    onlyRole(ADMIN)
    {
        protocolStorage().treasuryAddress = _treasuryAddress;
        emit TreasuryAddressChanged(_treasuryAddress, msg.sender);
    }

    /**
     * @notice The treasuryAddress getter
     */
    function getTreasuryAddress()
    external
    override
    view
    returns (address payable)
    {
        return protocolStorage().treasuryAddress;
    }

    /**
     * @notice Sets the address of the Boson Protocol Voucher NFT contract (proxy)
     *
     * Emits a VoucherAddressChanged event.
     *
     * @param _voucherAddress - the address of the nft contract (proxy)
     */
    function setVoucherAddress(address _voucherAddress)
    external
    override
    onlyRole(ADMIN)
    {
        protocolStorage().voucherAddress = _voucherAddress;
        emit VoucherAddressChanged(_voucherAddress, msg.sender);
    }

    /**
     * @notice The Boson Protocol Voucher NFT contract (proxy) getter
     */
    function getVoucherAddress()
    external
    override
    view
    returns (address)
    {
        return protocolStorage().voucherAddress;
    }

    /**
     * @notice Sets the protocol fee percentage.
     * Emits a FeePercentageChanged event.
     *
     * @param _protocolFeePercentage - the percentage that will be taken as a fee from the net of a Boson Protocol sale or auction (after royalties)
     *
     * N.B. Represent percentage value as an unsigned int by multiplying the percentage by 100:
     * e.g, 1.75% = 175, 100% = 10000
     */
    function setProtocolFeePercentage(uint16 _protocolFeePercentage)
    external
    override
    onlyRole(ADMIN)
    {
        // Make sure percentage is between 1 - 10000
        require(_protocolFeePercentage > 0 && _protocolFeePercentage <= 10000,
            "Percentage representation must be between 1 and 10000");

        // Store fee percentage
        protocolStorage().protocolFeePercentage = _protocolFeePercentage;

        // Notify watchers of state change
        emit ProtocolFeePercentageChanged(_protocolFeePercentage, msg.sender);
    }

    /**
     * @notice Get the protocol fee percentage
     */
    function getProtocolFeePercentage()
    external
    override
    view
    returns (uint16)
    {
        return protocolStorage().protocolFeePercentage;
    }


     /**
     * @notice Sets the maximum numbers of offers that can be added to a group in a single transaction
     *
     * Emits a MaxOffersPerGroupChanged event.
     *
     * @param _maxOffersPerGroup - the maximum length of {BosonTypes.Group.offerIds}
     */
    function setMaxOffersPerGroup(uint16 _maxOffersPerGroup)
    external
    override
    onlyRole(ADMIN)
    {
        protocolStorage().maxOffersPerGroup = _maxOffersPerGroup;
        emit MaxOffersPerGroupChanged(_maxOffersPerGroup, msg.sender);
    }

    /**
     * @notice Get the maximum offers per group
     */
    function getMaxOffersPerGroup()
    external
    override
    view
    returns (uint16)
    {
        return protocolStorage().maxOffersPerGroup;
    }

}