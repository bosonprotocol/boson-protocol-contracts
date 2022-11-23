// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.9;
import "../../../domain/BosonConstants.sol";
import { ERC721Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import { IERC721Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
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
import { IBosonExchangeHandler } from "../../../interfaces/handlers/IBosonExchangeHandler.sol";

/**
 * @title BosonVoucher
 * @notice This is the Boson Protocol ERC-721 NFT Voucher contract.
 *
 * N.B. Although this contract extends OwnableUpgradeable and ERC721Upgradeable,
 *      that is only for convenience, to avoid conflicts with mixed imports.
 *
 *      This is only a logic contract, delegated to by BeaconClientProxy. Thus,
 *      this contract will never be "upgraded". Rather it will be redeployed
 *      with changes and the BosonClientBeacon will be advised of the new address.
 *      Individual seller collections are clones of BeaconClientProxy, which
 *      asks the BosonClientBeacon for the address of the BosonVoucher contract
 *      on each call. This allows us to upgrade all voucher collections cheaply,
 *      and at once.
 *
 * Key features:
 * - Only PROTOCOL-roled addresses can issue vouchers, i.e., the ProtocolDiamond or an EOA for testing
 * - Minted to the buyer when the buyer commits to an offer
 * - Burned when the buyer redeems the voucher NFT
 * - Support for pre-minted voucher id ranges
 */
contract BosonVoucher is IBosonVoucher, BeaconClientBase, OwnableUpgradeable, ERC721Upgradeable {
    // Describe a reserved range of token ids
    struct Range {
        uint256 offerId;
        uint256 start; // First token id of range
        uint256 length; // Length of range
        uint256 minted; // Amount pre-minted so far
    }

    // Opensea collection config
    string private _contractURI;

    // Royalty percentage requested by seller (for all offers)
    uint256 private _royaltyPercentage;

    // Map an offerId to a Range for pre-minted offers
    mapping(uint256 => Range) private rangeByOfferId;

    // All ranges as an array
    Range[] private ranges;

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

        // we don't call init on ownable, but rather just set the ownership to correct owner
        _transferOwnership(_newOwner);

        _setContractURI(voucherInitValues.contractURI);

        _setRoyaltyPercentage(voucherInitValues.royaltyPercentage);

        emit VoucherInitialized(_sellerId, _royaltyPercentage, _contractURI);
    }

    /**
     * @notice Issues a voucher to a buyer.
     *
     * Minted voucher supply is sent to the buyer.
     * Caller must have PROTOCOL role.
     *
     * Reverts if:
     * - Exchange id falls within a reserved range
     *
     * @param _exchangeId - the id of the exchange (corresponds to the ERC-721 token id)
     * @param _buyer - the buyer address
     */
    function issueVoucher(uint256 _exchangeId, address _buyer) external override onlyRole(PROTOCOL) {
        // Get the exchange
        (, Exchange memory exchange) = getBosonExchange(_exchangeId);

        // See if the offer id is associated with a range
        Range storage range = rangeByOfferId[exchange.offerId];

        // Revert if exchange id falls within a reserved range
        require(range.length == 0, EXCHANGE_ID_IN_RESERVED_RANGE);

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
     * @notice Reserves a range of vouchers to be associated with an offer
     *
     * Must happen prior to calling
     * Caller must have PROTOCOL role.
     *
     * Reverts if:
     * - Start id is not greater than zero
     * - Offer id is already associated with a range
     *
     * @param _offerId - the id of the offer
     * @param _startId - the first id of the token range
     * @param _length - the length of the range
     */
    function reserveRange(
        uint256 _offerId,
        uint256 _startId,
        uint256 _length
    ) external onlyRole(PROTOCOL) {
        // Make sure range start is valid
        require(_startId > 0, INVALID_RANGE_START);

        // Get storage slot for the range
        Range storage range = rangeByOfferId[_offerId];

        // Revert if the offer id is already associated with a range
        require(range.length == 0, OFFER_RANGE_ALREADY_RESERVED);

        // Store the reserved range
        range.offerId = _offerId;
        range.start = _startId;
        range.length = _length;
        ranges.push(range);
    }

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
     * Caller must be contract owner (seller operator address).
     *
     * Reverts if:
     * - Offer id is not associated with a range
     * - Amount to mint is more than remaining un-minted in range
     * - Too many to mint in a single transaction, given current block gas limit
     *
     * @param _offerId - the id of the offer
     * @param _amount - the amount to mint
     */
    function preMint(uint256 _offerId, uint256 _amount) external onlyOwner {
        // Get the offer's range
        Range storage range = rangeByOfferId[_offerId];

        // Revert if id not associated with a range
        require(range.length == 0, NO_RESERVED_RANGE_FOR_OFFER);

        // Get the first token to mint
        uint256 start = range.start + range.minted;

        // Revert if no more to mint in range
        require(range.length > start, INVALID_AMOUNT_TO_MINT);

        // Pre-mint the range to the seller
        uint256 tokenId;
        address seller = owner();
        for (uint256 i = 0; i < _amount; i++) {
            tokenId = start + i;
            emit Transfer(address(0), seller, tokenId);
        }

        // Bump the minted count
        range.minted += _amount;
    }

    /**
     * @notice Gets the number of vouchers left to be pre-minted for an offer.
     *
     * @param _offerId - the id of the offer
     * @return count - the count of pre-minted vouchers in reserved range
     */
    function getAvailablePreMints(uint256 _offerId) public view returns (uint256 count) {
        // Get the offer's range
        Range storage range = rangeByOfferId[_offerId];

        // Count the number left to be minted
        count = range.length - range.minted;
    }

    /**
     * @dev Returns the owner of the specified token.
     *
     * If the token IS a pre-mint, then the actual owner address hasn't been set,
     * but will be reported as the owner of this contract (the seller).
     *
     * If the token IS NOT a pre-mint, then the actual owner will be reported.
     *
     * Reverts if:
     * - Token is not a pre-mint and does not have a stored owner, i.e., invalid token id
     *
     * @param tokenId - the id of the token to check
     * @return owner - the address of the owner
     */
    function ownerOf(uint256 tokenId)
        public
        view
        virtual
        override(ERC721Upgradeable, IERC721Upgradeable)
        returns (address owner)
    {
        // Get the exchange (may not exist, but that's ok)
        (, Exchange memory exchange) = getBosonExchange(tokenId);

        // See if the offer id is associated with a range.
        // If exchange doesn't exist, exchange.offerId will be zero
        Range storage range = rangeByOfferId[exchange.offerId];

        // Report token owner
        // - stored token owner if one exists
        // - contract owner if token is reserved but not yet pre-minted
        if (range.length == 0) {
            owner = super.ownerOf(tokenId);
        } else {
            owner = _exists(tokenId) ? super.ownerOf(tokenId) : super.owner();
        }
    }

    /**
     * @dev See {IERC721-transferFrom}.
     */
    function transferFrom(
        address from,
        address to,
        uint256 tokenId
    ) public virtual override(ERC721Upgradeable, IERC721Upgradeable) {
        (bool committable, uint256 offerId) = getPreMintStatus(tokenId);

        if (!committable) {
            super.transferFrom(from, to, tokenId);
        } else {
            // _owner[tokenId] = owner();
            // super._transfer(from, to, tokenId);
            // TODO: how can we store owner as seller before doing a super._transfer() ?
            // worst case, we could copy the ERC721Upgradeable and its dependencies
            // keep the same storage, but make the balances and owners arrays internal instead of private
            // so that we can set the owner to the contract owner at this point and then carry on as normal
        }
    }

    /**
     * @dev See {IERC721-safeTransferFrom}.
     */
    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenId,
        bytes memory data
    ) public virtual override(ERC721Upgradeable, IERC721Upgradeable) {
        (bool committable, uint256 offerId) = getPreMintStatus(tokenId);

        if (!committable) {
            super.safeTransferFrom(from, to, tokenId, data);
        } else {
            // _owner[tokenId] = owner();
            // super._safeTransfer(from, to, tokenId);
            // TODO: how can we store owner as seller before doing a super._safeTransfer() ?
            // Can we do it with assembly?
            // worst case, we could copy the ERC721Upgradeable and its dependencies into the project
            // keep the same storage, but make the balances and owners arrays internal instead of private
            // so that we can set the owner to the contract owner at this point and then carry on as normal
        }
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
     * 0x2a55205a represents ERC2981 interface id
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
     * @notice Gets the seller id.
     *
     * @return the id for the Voucher seller
     */
    function getSellerId() public view override returns (uint256) {
        (bool exists, Seller memory seller) = getBosonSellerByAddress(owner());

        return exists ? seller.id : 0;
    }

    /**
     * @notice Transfers ownership of the contract to a new account (`newOwner`).
     * Can only be called by the protocol. Change is done by calling `updateSeller` on the protocol.
     *
     * @param newOwner - the address to which ownership of the voucher contract will be transferred
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
     * Emits RoyaltyPercentageChanged if successful.
     *
     * Reverts if:
     * - Caller is not the owner.
     * - `_newRoyaltyPercentage` is greater than max royalty percentage defined in the protocol
     *
     * @param _newRoyaltyPercentage fee in percentage. e.g. 500 = 5%
     */
    function setRoyaltyPercentage(uint256 _newRoyaltyPercentage) external override onlyOwner {
        _setRoyaltyPercentage(_newRoyaltyPercentage);
    }

    /**
     * @notice Gets the royalty percentage.
     *
     * @return _royaltyPercentage fee in percentage. e.g. 500 = 5%
     */
    function getRoyaltyPercentage() external view returns (uint256) {
        return _royaltyPercentage;
    }

    /**
     * @notice Sets royalty percentage.
     * Can only be called by the owner or during the initialization.
     *
     * Emits RoyaltyPercentageChanged if successful.
     *
     * @param _newRoyaltyPercentage - new royalty percentage
     */
    function _setRoyaltyPercentage(uint256 _newRoyaltyPercentage) internal {
        // get max royalty percentage from the protocol
        address protocolDiamond = IClientExternalAddresses(BeaconClientLib._beacon()).getProtocolAddress();
        uint16 maxRoyaltyPecentage = IBosonConfigHandler(protocolDiamond).getMaxRoyaltyPecentage();

        // make sure that new royalty percentage does not exceed the max value set in the protocol
        require(_newRoyaltyPercentage <= maxRoyaltyPecentage, "ERC2981: royalty fee exceeds protocol limit");

        _royaltyPercentage = _newRoyaltyPercentage;

        emit RoyaltyPercentageChanged(_newRoyaltyPercentage);
    }

    /**
     * @notice Performs special case transfer hooks.
     *
     * - Commits to pre-minted offers on first transfer.
     *
     * When a voucher is pre-minted, the owner is not stored
     * but the seller is reported as the transferee and owner,
     * so that it can be found by marketplaces and listed by
     * the seller for their asking price.
     *
     * On the first transfer after pre-minting, this method
     * will commit to the associated offer on behalf of the
     * new owner.
     *
     * - Updates buyer on subsequent transfers.
     *
     * When a voucher with an associated exchange is transferred
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
        // Update the buyer associated with the voucher in the protocol
        // Only when transferring, not minting or burning
        if (from != address(0) && to != address(0) && from != to) {
            onVoucherTransferred(tokenId, payable(to));
        } else {
            (bool committable, uint256 offerId) = getPreMintStatus(tokenId);
            if (committable) {
                address protocolDiamond = IClientExternalAddresses(BeaconClientLib._beacon()).getProtocolAddress();
                // TODO: uncomment when commitToPreMintedOffer method is available
                //IBosonExchangeHandler(protocolDiamond).commitToPreMintedOffer(to, _offerId, tokenId);
            }
        }
    }

    /**
     * @dev Determines if a token is pre-minted and committable via transfer hook
     *
     * Committable means:
     * - does not yet have an owner
     * - in a reserved range
     * - has been pre-minted
     *
     * @param _tokenId - the token id to check
     * @return committable - whether the token is committable
     * @return offerId - the associated offer id if committable
     */
    function getPreMintStatus(uint256 _tokenId) internal view returns (bool committable, uint256 offerId) {
        // Not committable if token has an owner
        if (!_exists(_tokenId)) {
            // If are reserved ranges, search them
            uint256 length = ranges.length;
            if (length > 0) {
                // Binary search the ranges array
                uint256 low = 0; // Lower bound of search (array index)
                uint256 high = length; // Upper bound of search
                while (low < high) {
                    // Calculate the current midpoint
                    uint256 mid = (high - low) / 2;

                    // Get the range stored at the midpoint
                    Range storage range = ranges[mid];

                    // Get the beginning of the range once for reference
                    uint256 start = range.start;
                    if (start > _tokenId) {
                        // Split low and search again if target too high
                        high = mid;
                    } else if (start + range.minted - 1 >= _tokenId) {
                        // Is token in target's minted range?
                        committable = true;
                        offerId = range.offerId;
                        break; // Found!
                    } else if (start + range.length - 1 >= _tokenId) {
                        // No? Ok, is it in target's reserved range?
                        committable = false;
                        break; // Found!
                    } else {
                        // No? It may be in a higher range
                        low = mid + 1;
                    }
                }
            }
        }
    }
}
