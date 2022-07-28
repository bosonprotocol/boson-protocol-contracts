// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import "../../../domain/BosonConstants.sol";
import { ERC721Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import { ERC721RoyaltyUpgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721RoyaltyUpgradeable.sol";
import { IERC721MetadataUpgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/IERC721MetadataUpgradeable.sol";
import { IERC165Upgradeable } from "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165Upgradeable.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";

import { IBosonVoucher } from "../../../interfaces/clients/IBosonVoucher.sol";
import { BeaconClientBase } from "../../bases/BeaconClientBase.sol";

/**
 * @title BosonVoucher
 * @notice This is the Boson Protocol ERC-721 NFT Voucher contract.
 *
 * Key features:
 * - Only PROTOCOL-roled addresses can issue vouchers, i.e., the ProtocolDiamond or an EOA for testing
 * - Newly minted voucher NFTs are automatically transferred to the buyer
 */
contract BosonVoucher is IBosonVoucher, BeaconClientBase, OwnableUpgradeable, ERC721RoyaltyUpgradeable {
    string private _contractURI;

    /**
     * @notice Initializer
     */
    function initializeVoucher(
        uint256 _sellerId,
        address _newOwner,
        string calldata _newContractURI
    ) public initializer {
        string memory sellerId = Strings.toString(_sellerId);
        // TODO: When we move to solidity 0.8.12 or greater, change this to use string.concat()
        string memory voucherName = string(abi.encodePacked(VOUCHER_NAME, " ", sellerId));
        string memory voucherSymbol = string(abi.encodePacked(VOUCHER_SYMBOL, "_", sellerId));

        __ERC721_init_unchained(voucherName, voucherSymbol);

        // we dont call init on ownable, but rather just set the ownership to correct owner
        _transferOwnership(_newOwner);

        _setContractURI(_newContractURI);
    }

    /**
     * @notice Issue a voucher to a buyer
     *
     * Minted voucher supply is sent to the buyer.
     * Caller must have PROTOCOL role.
     *
     * @param _exchangeId - the id of the exchange (corresponds to the ERC-721 token id)
     * @param _buyer - the buyer of the vouchers
     */
    function issueVoucher(uint256 _exchangeId, Buyer calldata _buyer) external override onlyRole(PROTOCOL) {
        // Mint the voucher, sending it to the buyer
        _mint(_buyer.wallet, _exchangeId);
    }

    /**
     * @notice Burn a voucher
     *
     * Caller must have PROTOCOL role.
     *
     * @param _exchangeId - the id of the exchange (corresponds to the ERC-721 token id)
     */
    function burnVoucher(uint256 _exchangeId) external override onlyRole(PROTOCOL) {
        _burn(_exchangeId);
    }

    /**
     * @notice Implementation of the {IERC165} interface.
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
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721RoyaltyUpgradeable, IERC165Upgradeable)
        returns (bool)
    {
        return (interfaceId == type(IBosonVoucher).interfaceId || super.supportsInterface(interfaceId));
    }

    /**
     * @notice Get the Voucher metadata URI
     *
     * This method is overrides the Open Zeppelin version, returning
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
     * @dev Update buyer on transfer
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
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId
    ) internal override {
        // Only act when transferring, not minting or burning
        if (from != address(0) && to != address(0)) {
            onVoucherTransferred(tokenId, payable(to));
        }
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Can only be called by the protocol. Change is done by calling `updateSeller` on the protocol
     */
    function transferOwnership(address newOwner) public override(IBosonVoucher, OwnableUpgradeable) onlyRole(PROTOCOL) {
        require(newOwner != address(0), "Ownable: new owner is the zero address");
        _transferOwnership(newOwner);
    }

    /**
     * @notice Returns storefront-level metadata used by OpenSea
     *
     * @return Contract metadata URI
     */
    function contractURI() external view override returns (string memory) {
        return _contractURI;
    }

    /**
     * @notice Sets new contract URI
     * Can only be called by the owner or during the initialization
     *
     * @param _newContractURI new contract metadata URI
     */
    function setContractURI(string calldata _newContractURI) external override onlyOwner {
        _setContractURI(_newContractURI);
    }

    /**
     * @notice Sets new contract URI
     * Can only be called by the owner or during the initialization
     *
     * @param _newContractURI new contract metadata URI
     */
    function _setContractURI(string calldata _newContractURI) internal {
        _contractURI = _newContractURI;

        emit ContractURIChanged(_newContractURI);
    }

    /**
     * @notice Sets the default royalty information that all ids in this contract will default to.
     * Can only be called by the owner or during the initialization
     *
     * @param _receiver address of the receiver.
     * @param _value value in percentage. e.g. 500 = 5%
     */
    function setDefaultRoyalty(address _receiver, uint96 _value) external override onlyOwner {
        _setDefaultRoyalty(_receiver, _value);
    }

    /**
     * @notice Removes default royalty information.
     * Can only be called by the owner
     */
    function deleteDefaultRoyalty() external override onlyOwner {
        _deleteDefaultRoyalty();
    }

    /**
     * @notice Sets the royalty information for a specific token id, overriding the global default.
     * Can only be called by the owner
     *
     * @param _exchangeId - the id of the exchange (corresponds to the ERC-721 token id)
     * @param _receiver address of the receiver.
     * @param _value value in percentage. e.g. 500 = 5%
     */
    function setTokenRoyalty(
        uint256 _exchangeId,
        address _receiver,
        uint96 _value
    ) external override onlyOwner {
        _setTokenRoyalty(_exchangeId, _receiver, _value);
    }

    /**
     * @notice Resets royalty information for the token id back to the global default.
     *
     * @param _exchangeId - the id of the exchange (corresponds to the ERC-721 token id)
     */
    function resetTokenRoyalty(uint256 _exchangeId) external override onlyOwner {
        _resetTokenRoyalty(_exchangeId);
    }
}
