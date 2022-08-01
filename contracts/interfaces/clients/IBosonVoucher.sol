// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import { IERC721MetadataUpgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/IERC721MetadataUpgradeable.sol";
import { BosonTypes } from "../../domain/BosonTypes.sol";

/**
 * @title IBosonVoucher
 *
 * @notice This is the interface for the Boson Protocol ERC-721 Voucher NFT contract.
 *
 * The ERC-165 identifier for this interface is: 0x17c286ab
 */
interface IBosonVoucher is IERC721MetadataUpgradeable {
    event ContractURIChanged(string contractURI);

    /**
     * @notice Issue a voucher to a buyer
     *
     * Minted voucher supply is sent to the buyer.
     * Caller must have PROTOCOL role.
     *
     * @param _exchangeId - the id of the exchange (corresponds to the ERC-721 token id)
     * @param _buyer - the buyer of the vouchers
     */
    function issueVoucher(uint256 _exchangeId, BosonTypes.Buyer calldata _buyer) external;

    /**
     * @notice Burn a voucher
     *
     * Caller must have PROTOCOL role.
     *
     * @param _exchangeId - the id of the exchange (corresponds to the ERC-721 token id)
     */
    function burnVoucher(uint256 _exchangeId) external;

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Can only be called by the protocol. Change is done by calling `updateSeller` on the protocol
     */
    function transferOwnership(address newOwner) external;

    /**
     * @notice Returns storefront-level metadata used by OpenSea
     *
     * @return Contract metadata URI
     */
    function contractURI() external view returns (string memory);

    /**
     * @notice Sets new contract URI
     * Can only be called by the owner or during the initialization
     *
     * @param _newContractURI new contract metadata URI
     */
    function setContractURI(string calldata _newContractURI) external;

    /**
     * @notice Get royalty info for a token
     *
     * For a given token id and sale price, how much should be sent to whom as royalty
     *
     * @param _exchangeId - the NFT asset queried for royalty information
     * @param _offerPrice - the sale price of the NFT asset specified by _exchangeId
     *
     * @return receiver - address of who should be sent the royalty payment
     * @return royaltyAmount - the royalty payment amount for _value sale price
     */
    function royaltyInfo(uint256 _exchangeId, uint256 _offerPrice) external returns (address, uint256);

    /**
     * @notice Sets the default royalty information that all ids in this contract will default to.
     * Can only be called by the owner or during the initialization
     *
     * Reverts if:
     * - caller is not the owner.
     * - `receiver` is a zero address.
     * - `feeNumerator` is greater than the fee denominator i.e. greater than 100%.
     *
     * @param _receiver address of the receiver.
     * @param _feeNumerator fee in percentage. e.g. 500 = 5%
     */
    function setDefaultRoyalty(address _receiver, uint96 _feeNumerator) external;

    /**
     * @notice Removes default royalty information.
     * Can only be called by the owner
     *
     * Reverts if:
     * - caller is not the owner.
     *
     */
    function deleteDefaultRoyalty() external;

    /**
     * @notice Sets the royalty information for a specific token id, overriding the global default.
     * Can only be called by the owner
     *
     * - caller is not the owner.
     * - `receiver` is a zero address.
     * - `feeNumerator` is greater than the fee denominator i.e. greater than 100%.
     *
     * @param _exchangeId - the id of the exchange (corresponds to the ERC-721 token id)
     * @param _receiver address of the receiver.
     * @param _feeNumerator fee in percentage. e.g. 500 = 5%
     */
    function setTokenRoyalty(
        uint256 _exchangeId,
        address _receiver,
        uint96 _feeNumerator
    ) external;

    /**
     * @notice Resets royalty information for the token id back to the global default.
     *
     * Reverts if:
     * - caller is not the owner.
     *
     * @param _exchangeId - the id of the exchange (corresponds to the ERC-721 token id)
     */
    function resetTokenRoyalty(uint256 _exchangeId) external;
}
