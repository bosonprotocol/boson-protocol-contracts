// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.9;

import { IERC721Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import { IERC721MetadataUpgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/IERC721MetadataUpgradeable.sol";
import { BosonTypes } from "../../domain/BosonTypes.sol";

/**
 * @title IBosonVoucher
 *
 * @notice This is the interface for the Boson Protocol ERC-721 Voucher NFT contract.
 *
 * The ERC-165 identifier for this interface is: 0x2249ca21
 */
interface IBosonVoucher is IERC721Upgradeable, IERC721MetadataUpgradeable {
    event ContractURIChanged(string contractURI);
    event RoyaltyPercentageChanged(uint256 royaltyPercentage);
    event VoucherInitialized(uint256 indexed sellerId, uint256 indexed royaltyPercentage, string indexed contractURI);

    /**
     * @notice Issues a voucher to a buyer.
     *
     * Minted voucher supply is sent to the buyer.
     * Caller must have PROTOCOL role.
     *
     * @param _exchangeId - the id of the exchange (corresponds to the ERC-721 token id)
     * @param _buyer - the buyer address
     */
    function issueVoucher(uint256 _exchangeId, address _buyer) external;

    /**
     * @notice Burns a voucher.
     *
     * Caller must have PROTOCOL role.
     *
     * @param _exchangeId - the id of the exchange (corresponds to the ERC-721 token id)
     */
    function burnVoucher(uint256 _exchangeId) external;

    /**
     * @notice Gets the seller id.
     *
     * @return the id for the Voucher seller
     */
    function getSellerId() external view returns (uint256);

    /**
     * @notice Transfers ownership of the contract to a new account (`newOwner`).
     * Can only be called by the protocol. Change is done by calling `updateSeller` on the protocol.
     *
     * @param newOwner - the address to which ownership of the voucher contract will be transferred
     */
    function transferOwnership(address newOwner) external;

    /**
     * @notice Returns storefront-level metadata used by OpenSea.
     *
     * @return Contract metadata URI
     */
    function contractURI() external view returns (string memory);

    /**
     * @notice Sets new contract URI.
     * Can only be called by the owner or during the initialization.
     *
     * @param _newContractURI - new contract metadata URI
     */
    function setContractURI(string calldata _newContractURI) external;

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
        returns (address receiver, uint256 royaltyAmount);

    /**
     * @notice Sets the royalty percentage.
     * Can only be called by the owner or during the initialization
     *
     * Emits RoyaltyPercentageChanged if successful.
     *
     * Reverts if:
     * - Caller is not the owner.
     * - `_newRoyaltyPercentage` is greater than max royalty percentage defined in the protocol
     *
     * @param _newRoyaltyPercentage fee in percentage. e.g. 500 = 5%
     */
    function setRoyaltyPercentage(uint256 _newRoyaltyPercentage) external;

    /**
     * @notice Gets the royalty percentage.
     *
     * @return royalty percentage
     */
    function getRoyaltyPercentage() external view returns (uint256);
}
