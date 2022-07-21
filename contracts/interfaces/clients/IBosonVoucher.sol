// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import { IERC721Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import { IERC721MetadataUpgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/IERC721MetadataUpgradeable.sol";
import { BosonTypes } from "../../domain/BosonTypes.sol";

/**
 * @title IBosonVoucher
 *
 * @notice This is the interface for the Boson Protocol ERC-721 Voucher NFT contract.
 *
 * The ERC-165 identifier for this interface is: 0x17c286ab
 */
interface IBosonVoucher is IERC721Upgradeable, IERC721MetadataUpgradeable {
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
}
