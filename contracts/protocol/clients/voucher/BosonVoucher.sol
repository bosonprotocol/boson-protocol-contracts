// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import {ERC721Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import {IERC165Upgradeable} from "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165Upgradeable.sol";

import {IBosonVoucher} from "../../../interfaces/clients/IBosonVoucher.sol";
import {IBosonClient} from "../../../interfaces/clients/IBosonClient.sol";
import {ClientBase} from "../../bases/ClientBase.sol";

/**
 * @title BosonVoucher
 * @notice This is the Boson Protocol ERC-721 NFT Voucher contract.
 *
 * Key features:
 * - Only PROTOCOL-roled addresses can issue vouchers, i.e., the ProtocolDiamond or an EOA for testing
 * - Newly minted voucher NFTs are automatically transferred to the buyer
 */
contract BosonVoucher is IBosonVoucher, ClientBase, ERC721Upgradeable {

    string internal constant VOUCHER_NAME = "Boson Voucher";
    string internal constant VOUCHER_SYMBOL = "BOSON_VOUCHER";

    /**
     * @notice Initializer
     */
    function initialize()
    public {
        __ERC721_init_unchained(VOUCHER_NAME, VOUCHER_SYMBOL);
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
    function issueVoucher(uint256 _exchangeId, Buyer calldata _buyer)
    external
    override
    onlyRole(PROTOCOL)
    {
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
    function burnVoucher(uint256 _exchangeId)
    external
    override
    onlyRole(PROTOCOL)
    {
        _burn(_exchangeId);
    }

    /**
     * @notice Redeem a voucher
     *
     * @param _exchangeId - the id of the exchange (corresponds to the ERC-1155 token id)
     */
    function redeemVoucher(uint256 _exchangeId, address payable _holder)
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
    override(ERC721Upgradeable, IERC165Upgradeable)
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
     * @param _exchangeId - id of the voucher's associated exchange
     * @return the uri for the associated offer's off-chain metadata (blank if not found)
     */
    function tokenURI(uint256 _exchangeId)
    public
    view
    override
    returns (string memory)
    {
        (bool exists, Offer memory offer) = getBosonOffer(_exchangeId);
        return exists ? offer.metadataUri : "";
    }

}