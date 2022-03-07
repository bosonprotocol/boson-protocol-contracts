// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import "../../interfaces/IBosonConfigHandler.sol";
import "../../diamond/DiamondLib.sol";
import "../ProtocolBase.sol";
import "../ProtocolLib.sol";

/**
 * @title ConfigHandlerFacet
 *
 * @notice Handles management of various protocol-related settings.
 */
contract ConfigHandlerFacet is IBosonConfigHandler, ProtocolBase {

    /**
     * @dev Modifier to protect initializer function from being invoked twice.
     */
    modifier onlyUnInitialized()
    {
        ProtocolLib.ProtocolInitializers storage pi = ProtocolLib.protocolInitializers();
        require(!pi.configFacet, ALREADY_INITIALIZED);
        pi.configFacet = true;
        _;
    }

    /**
     * @notice Facet Initializer
     *
     * @param _tokenAddress - address of Boson Token (ERC-20) contract
     * @param _multisigAddress - address of Boson Protocol DAO multi-sig wallet
     * @param _feePercentage - percentage that will be taken as a fee from the net of a Boson Protocol exchange (after royalties)
     */
    function initialize(
        address payable _tokenAddress,
        address payable _multisigAddress,
        uint16 _feePercentage
    )
    public
    onlyUnInitialized
    {
        // Register supported interfaces
        DiamondLib.addSupportedInterface(type(IBosonConfigHandler).interfaceId);

        // Initialize protocol config params
        ProtocolLib.ProtocolStorage storage ps = ProtocolLib.protocolStorage();
        ps.tokenAddress = _tokenAddress;
        ps.multisigAddress = _multisigAddress;
        ps.feePercentage = _feePercentage;
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
        emit TokenAddressChanged(_tokenAddress);
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
     * Emits a MultisigAddressChanged event.
     *
     * @param _multisigAddress - the address of the multi-sig wallet
     */
    function setMultisigAddress(address payable _multisigAddress)
    external
    override
    onlyRole(ADMIN)
    {
        protocolStorage().multisigAddress = _multisigAddress;
        emit MultisigAddressChanged(_multisigAddress);
    }

    /**
     * @notice The multisigAddress getter
     */
    function getMultisigAddress()
    external
    override
    view
    returns (address payable)
    {
        return protocolStorage().multisigAddress;
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
        emit VoucherAddressChanged(_voucherAddress);
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
     * @param _feePercentage - the percentage that will be taken as a fee from the net of a Boson Protocol sale or auction (after royalties)
     *
     * N.B. Represent percentage value as an unsigned int by multiplying the percentage by 100:
     * e.g, 1.75% = 175, 100% = 10000
     */
    function setFeePercentage(uint16 _feePercentage)
    external
    override
    onlyRole(ADMIN)
    {
        require(_feePercentage > 0 && _feePercentage <= 10000,
            "Percentage representation must be between 1 and 10000");
        protocolStorage().feePercentage = _feePercentage;
        emit FeePercentageChanged(_feePercentage);
    }

    /**
     * @notice The feePercentage getter
     */
    function getFeePercentage()
    external
    override
    view
    returns (uint16)
    {
        return protocolStorage().feePercentage;
    }

}