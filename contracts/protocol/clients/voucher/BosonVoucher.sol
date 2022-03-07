// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";
import "../../../interfaces/IBosonVoucher.sol";
import "../../../interfaces/IBosonClient.sol";
import "../../../interfaces/IBosonOfferHandler.sol";
import "../ClientBase.sol";

/**
 * @title BosonVoucher
 * @notice This is the Boson Protocol ERC-1155 NFT Voucher contract.
 *
 * Key features:
 * - Only PROTOCOL-roled addresses can issue vouchers, i.e., the ProtocolDiamond or an EOA for testing
 * - Newly minted voucher NFTs are automatically transferred to the buyer
 */
contract BosonVoucher is IBosonVoucher, ClientBase, ERC1155Upgradeable {

    /**
     * @notice Initializer
     */
    function initialize()
    public {
        __ERC1155_init_unchained("");
    }

    /**
     * @notice Issue one or more vouchers to a given buyer
     *
     * Minted voucher supply is sent to the buyer.
     * Caller must have PROTOCOL role.
     *
     * @param _offerId - the id of the offer (corresponds to the ERC-1155 token id)
     * @param _supply - how many vouchers to issue
     * @param _buyer - the buyer of the vouchers
     */
    function issueVouchers(uint256 _offerId, uint256 _supply, address payable _buyer)
    external
    override
    onlyRole(PROTOCOL)
    {
        // Mint the vouchers, sending them to the buyer
        _mint(_buyer, _offerId, _supply, new bytes(0x0));

    }

    /**
     * @notice Redeem a voucher
     *
     * @param _offerId - the id of the offer (corresponds to the ERC-1155 token id)
     */
    function redeemVoucher(uint256 _offerId, address payable _holder)
    external
    override
    {
        // TODO implement
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
    override(ERC1155Upgradeable, IERC165Upgradeable)
    returns (bool)
    {
        return (
            interfaceId == type(IBosonVoucher).interfaceId ||
            interfaceId == type(IBosonClient).interfaceId ||
            super.supportsInterface(interfaceId)
        );
    }

    /**
     * @notice Get the Voucher metadata URI
     *
     * This method is overrides the Open Zeppelin version, returning
     * a unique stored metadata URI for each token rather than a
     * replaceable baseURI template, since the latter is not compatible
     * with IPFS hashes.
     *
     * @param _offerId - id of the offer to get the URI for
     * @return the uri for the associated offer's off-chain metadata (blank if not found)
     */
    function uri(uint256 _offerId)
    public
    view
    override
    returns (string memory)
    {
        (bool success, Offer memory offer) = getBosonOffer(_offerId);
        return success ? offer.metadataUri : "";
    }

}