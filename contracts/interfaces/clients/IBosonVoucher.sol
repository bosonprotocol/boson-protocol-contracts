// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import { IERC721Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import {
    IERC721MetadataUpgradeable
} from "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/IERC721MetadataUpgradeable.sol";
import {
    IERC721ReceiverUpgradeable
} from "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721ReceiverUpgradeable.sol";

/**
 * @title IBosonVoucher
 *
 * @notice This is the interface for the Boson Protocol ERC-721 Voucher contract.
 *
 * The ERC-165 identifier for this interface is: 0x6a474d2c
 */
interface IBosonVoucher is IERC721Upgradeable, IERC721MetadataUpgradeable, IERC721ReceiverUpgradeable {
    event ContractURIChanged(string contractURI);
    event VoucherInitialized(uint256 indexed sellerId, string indexed contractURI);
    event RangeReserved(uint256 indexed offerId, Range range);
    event VouchersPreMinted(uint256 indexed offerId, uint256 startId, uint256 endId);

    // Describe a reserved range of token ids
    struct Range {
        uint256 start; // First token id of range
        uint256 length; // Length of range
        uint256 minted; // Amount pre-minted so far
        uint256 lastBurnedTokenId; // Last burned token id
        address owner; // The range owner
    }

    /**
     * @notice Issues a voucher to a buyer.
     *
     * Minted voucher supply is sent to the buyer.
     * Caller must have PROTOCOL role.
     *
     * @param _tokenId - voucher token id corresponds to <<uint128(offerId)>>.<<uint128(exchangeId)>>
     * @param _buyer - the buyer address
     */
    function issueVoucher(uint256 _tokenId, address _buyer) external;

    /**
     * @notice Burns a voucher.
     *
     * Caller must have PROTOCOL role.
     *
     * @param _tokenId - voucher token id corresponds to <<uint128(offerId)>>.<<uint128(exchangeId)>>
     */
    function burnVoucher(uint256 _tokenId) external;

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
     * @param _tokenId - the voucher queried for royalty information
     * @param _salePrice - the sale price of the voucher specified by _tokenId
     *
     * @return receiver - address of who should be sent the royalty payment
     * @return royaltyAmount - the royalty payment amount for the given sale price
     */
    function royaltyInfo(
        uint256 _tokenId,
        uint256 _salePrice
    ) external view returns (address receiver, uint256 royaltyAmount);

    /**
     * @notice Reserves a range of vouchers to be associated with an offer
     *
     * Must happen prior to calling preMint
     * Caller must have PROTOCOL role.
     *
     * Reverts if:
     * - Start id is not greater than zero for the first range
     * - Start id is not greater than the end id of the previous range for subsequent ranges
     * - Range length is zero
     * - Range length is too large, i.e., would cause an overflow
     * - Offer id is already associated with a range
     * - _to is not the contract address or the contract owner
     *
     * @param _offerId - the id of the offer
     * @param _start - the first id of the token range
     * @param _length - the length of the range
     * @param _to - the address to send the pre-minted vouchers to (contract address or contract owner)
     */
    function reserveRange(uint256 _offerId, uint256 _start, uint256 _length, address _to) external;

    /**
     * @notice Pre-mints all or part of an offer's reserved vouchers.
     *
     * For small offer quantities, this method may only need to be
     * called once.
     *
     * But, if the range is large, e.g., 10k vouchers, block gas limit
     * could cause the transaction to fail. Thus, in order to support
     * a batched approach to pre-minting an offer's vouchers,
     * this method can be called multiple times, until the whole
     * range is minted.
     *
     * A benefit to the batched approach is that the entire reserved
     * range for an offer need not be pre-minted at one time. A seller
     * could just mint batches periodically, controlling the amount
     * that are available on the market at any given time, e.g.,
     * creating a pre-minted offer with a validity period of one year,
     * causing the token range to be reserved, but only pre-minting
     * a certain amount monthly.
     *
     * Caller must be contract owner (seller assistant address).
     *
     * Reverts if:
     * - Offer id is not associated with a range
     * - Amount to mint is more than remaining un-minted in range
     * - Too many to mint in a single transaction, given current block gas limit
     *
     * @param _offerId - the id of the offer
     * @param _amount - the amount to mint
     */
    function preMint(uint256 _offerId, uint256 _amount) external;

    /**
     * @notice Burn all or part of an offer's preminted vouchers.
     * If offer expires or it's voided, the seller can burn the preminted vouchers that were not transferred yet.
     * This way they will not show in seller's wallet and marketplaces anymore.
     *
     * For small offer quantities, this method may only need to be
     * called once.
     *
     * But, if the range is large, e.g., 10k vouchers, block gas limit
     * could cause the transaction to fail. Thus, in order to support
     * a batched approach to pre-minting an offer's vouchers,
     * this method can be called multiple times, until the whole
     * range is burned.
     *
     * Caller must be contract owner (seller assistant address).
     *
     * Reverts if:
     * - Offer id is not associated with a range
     * - Offer is not expired or voided
     * - There is nothing to burn
     *
     * @param _offerId - the id of the offer
     * @param _amount - amount to burn
     */
    function burnPremintedVouchers(uint256 _offerId, uint256 _amount) external;

    /**
     * @notice Gets the number of vouchers available to be pre-minted for an offer.
     *
     * @param _offerId - the id of the offer
     * @return count - the count of vouchers in reserved range available to be pre-minted
     */
    function getAvailablePreMints(uint256 _offerId) external view returns (uint256 count);

    /**
     * @notice Gets the range for an offer.
     *
     * @param _offerId - the id of the offer
     * @return range - range struct with information about range start, length and already minted tokens
     */
    function getRangeByOfferId(uint256 _offerId) external view returns (Range memory range);

    /**
     * @notice Make a call to an external contract.
     *
     * Reverts if:
     * - _to is zero address
     * - call to external contract fails
     * - caller is not the owner
     * - _to is a contract that represents some assets (all contracts that implement `balanceOf` method, including ERC20 and ERC721)
     *
     * @param _to - address of the contract to call
     * @param _data - data to pass to the external contract
     * @return result - result of the call
     */
    function callExternalContract(address _to, bytes memory _data) external payable returns (bytes memory);

    /** @notice Set approval for all to the vouchers owned by this contract
     *
     * Reverts if:
     * - _operator is zero address
     * - caller is not the owner
     * - _operator is this contract
     *
     * @param _operator - address of the operator to set approval for
     * @param _approved - true to approve the operator in question, false to revoke approval
     */
    function setApprovalForAllToContract(address _operator, bool _approved) external;

    /**
     * @notice Withdraw funds from the contract to the protocol seller pool
     *
     * @param _tokenList - list of tokens to withdraw, including native token (address(0))
     */
    function withdrawToProtocol(address[] calldata _tokenList) external;
}
