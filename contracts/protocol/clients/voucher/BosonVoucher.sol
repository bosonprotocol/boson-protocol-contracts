// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import "../../../domain/BosonConstants.sol";
import { ERC721Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import { IERC721MetadataUpgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/IERC721MetadataUpgradeable.sol";
import { IERC2981Upgradeable } from "@openzeppelin/contracts-upgradeable/interfaces/IERC2981Upgradeable.sol";
import { IERC165Upgradeable } from "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165Upgradeable.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";

import { IBosonVoucher } from "../../../interfaces/clients/IBosonVoucher.sol";
import { BeaconClientBase } from "../../bases/BeaconClientBase.sol";
import { BeaconClientLib } from "../../libs/BeaconClientLib.sol";
import { IClientExternalAddresses } from "../../../interfaces/clients/IClientExternalAddresses.sol";
import { IBosonConfigHandler } from "../../../interfaces/handlers/IBosonConfigHandler.sol";

/**
 * @title BosonVoucher
 * @notice This is the Boson Protocol ERC-721 NFT Voucher contract.
 *
 * Key features:
 * - Only PROTOCOL-roled addresses can issue vouchers, i.e., the ProtocolDiamond or an EOA for testing
 * - Minted to the buyer when the buyer commits to an offer
 * - Burned when the buyer redeems the voucher NFT
 */
contract BosonVoucher is IBosonVoucher, BeaconClientBase, OwnableUpgradeable, ERC721Upgradeable {
    string private _contractURI;
    uint96 private _royaltyPercentage;

    /**
     * @notice Initializes the voucher.
     * This function is callable only once.
     */
    function initializeVoucher(
        uint256 _sellerId,
        address _newOwner,
        VoucherInitValues calldata voucherInitValues
    ) public initializer {
        string memory sellerId = Strings.toString(_sellerId);
        string memory voucherName = string(abi.encodePacked(VOUCHER_NAME, " ", sellerId));
        string memory voucherSymbol = string(abi.encodePacked(VOUCHER_SYMBOL, "_", sellerId));

        __ERC721_init_unchained(voucherName, voucherSymbol);

        // we dont call init on ownable, but rather just set the ownership to correct owner
        _transferOwnership(_newOwner);

        _setContractURI(voucherInitValues.contractURI);

        _setRoyaltyPercentage(voucherInitValues.royaltyPercentage);
    }

    /**
     * @notice Issues a voucher to a buyer.
     *
     * Minted voucher supply is sent to the buyer.
     * Caller must have PROTOCOL role.
     *
     * @param _exchangeId - the id of the exchange (corresponds to the ERC-721 token id)
     * @param _buyer - the buyer address
     */
    function issueVoucher(uint256 _exchangeId, address _buyer) external override onlyRole(PROTOCOL) {
        // Mint the voucher, sending it to the buyer address
        _mint(_buyer, _exchangeId);
    }

    /**
     * @notice Burns a voucher.
     *
     * Caller must have PROTOCOL role.
     *
     * @param _exchangeId - the id of the exchange (corresponds to the ERC-721 token id)
     */
    function burnVoucher(uint256 _exchangeId) external override onlyRole(PROTOCOL) {
        _burn(_exchangeId);
    }

    /**
     * @notice Implements the {IERC165} interface.
     *
     * N.B. This method is inherited from several parents and
     * the compiler cannot decide which to use. Thus, they must
     * be overridden here.
     *
     * If you just call super.supportsInterface, it chooses
     * 'the most derived contract'. But that's not good for this
     * particular function because you may inherit from several
     * IERC165 contracts, and all concrete ones need to be allowed
     * to respond.
     *
     * 0x2a55205a representes ERC2981 interface id
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721Upgradeable, IERC165Upgradeable)
        returns (bool)
    {
        return (interfaceId == type(IBosonVoucher).interfaceId ||
            interfaceId == type(IERC2981Upgradeable).interfaceId ||
            super.supportsInterface(interfaceId));
    }

    /**
     * @notice Gets the Voucher metadata URI.
     *
     * This method overrides the Open Zeppelin version, returning
     * a unique stored metadata URI for each token rather than a
     * replaceable baseURI template, since the latter is not compatible
     * with IPFS hashes.
     *
     * @param _exchangeId - id of the voucher's associated exchange
     * @return the uri for the associated offer's off-chain metadata (blank if not found)
     */
    function tokenURI(uint256 _exchangeId)
        public
        view
        override(ERC721Upgradeable, IERC721MetadataUpgradeable)
        returns (string memory)
    {
        (bool exists, Offer memory offer) = getBosonOffer(_exchangeId);
        return exists ? offer.metadataUri : "";
    }

    /**
     * @notice Updates buyer on transfer.
     *
     * When an issued voucher is subsequently transferred,
     * either on the secondary market or just between wallets,
     * the protocol needs to be alerted to the change of buyer
     * address.
     *
     * The buyer account associated with the exchange will be
     * replaced. If the new voucher holder already has a
     * Boson Protocol buyer account, it will be used. Otherwise,
     * a new buyer account will be created and associated with
     * the exchange.
     *
     * @param from - the address from which the voucher is being transferred
     * @param to - the address to which the voucher is being transferred
     * @param tokenId - the tokenId of the voucher that is being transferred
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId
    ) internal override {
        // Only act when transferring, not minting or burning
        if (from != address(0) && to != address(0) && from != to) {
            onVoucherTransferred(tokenId, payable(to));
        }
    }

    /**
     * @notice Transfers ownership of the contract to a new account (`newOwner`).
     * Can only be called by the protocol. Change is done by calling `updateSeller` on the protocol.
     *
     * @param newOwner - the address to which ownsership of the voucher contract will be transferred
     */
    function transferOwnership(address newOwner) public override(IBosonVoucher, OwnableUpgradeable) onlyRole(PROTOCOL) {
        require(newOwner != address(0), "Ownable: new owner is the zero address");
        _transferOwnership(newOwner);
    }

    /**
     * @notice Returns storefront-level metadata used by OpenSea.
     *
     * @return Contract metadata URI
     */
    function contractURI() external view override returns (string memory) {
        return _contractURI;
    }

    /**
     * @notice Sets new contract URI.
     * Can only be called by the owner or during the initialization.
     *
     * @param _newContractURI - new contract metadata URI
     */
    function setContractURI(string calldata _newContractURI) external override onlyOwner {
        _setContractURI(_newContractURI);
    }

    /**
     * @notice Sets new contract URI.
     * Can only be called by the owner or during the initialization.
     *
     * @param _newContractURI new contract metadata URI
     */
    function _setContractURI(string calldata _newContractURI) internal {
        _contractURI = _newContractURI;

        emit ContractURIChanged(_newContractURI);
    }

    /**
     * @notice Provides royalty info.
     * Called with the sale price to determine how much royalty is owed and to whom.
     *
     * @param _tokenId - the NFT asset queried for royalty information
     * @param _salePrice - the sale price of the NFT asset specified by _tokenId
     *
     * @return receiver - address of who should be sent the royalty payment
     * @return royaltyAmount - the royalty payment amount for the given sale price
     */
    function royaltyInfo(uint256 _tokenId, uint256 _salePrice)
        external
        view
        override
        returns (address receiver, uint256 royaltyAmount)
    {
        // get offer
        (bool offerExists, Offer memory offer) = getBosonOffer(_tokenId);

        if (offerExists) {
            (, Seller memory seller) = getBosonSeller(offer.sellerId);
            // get receiver
            receiver = seller.treasury;
            // Calculate royalty amount
            royaltyAmount = (_salePrice * _royaltyPercentage) / 10000;
        }
    }

    /**
     * @notice Sets the royalty percentage.
     * Can only be called by the owner or during the initialization
     *
     * Emits RoyaltyPercentageChanged if succesful.
     *
     * Reverts if:
     * - Caller is not the owner.
     * - `_newRoyaltyPercentage` is greater than max royalty percentage defined in the protocol
     *
     * @param _newRoyaltyPercentage fee in percentage. e.g. 500 = 5%
     */
    function setRoyaltyPercentage(uint96 _newRoyaltyPercentage) external override onlyOwner {
        _setRoyaltyPercentage(_newRoyaltyPercentage);
    }

    /**
     * @notice Sets royalty percentage.
     * Can only be called by the owner or during the initialization.
     *
     * Emits RoyaltyPercentageChanged if succesful.
     *
     * @param _newRoyaltyPercentage - new royalty percentage
     */
    function _setRoyaltyPercentage(uint96 _newRoyaltyPercentage) internal {
        // get max royalty percentage from the protocol
        address protocolDiamond = IClientExternalAddresses(BeaconClientLib._beacon()).getProtocolAddress();
        uint16 maxRoyaltyPecentage = IBosonConfigHandler(protocolDiamond).getMaxRoyaltyPecentage();

        // make sure that new royalty percentage does not exceed the max value set in the protocol
        require(_newRoyaltyPercentage <= maxRoyaltyPecentage, "ERC2981: royalty fee exceeds protocol limit");

        _royaltyPercentage = _newRoyaltyPercentage;

        emit RoyaltyPercentageChanged(_newRoyaltyPercentage);
    }
}
