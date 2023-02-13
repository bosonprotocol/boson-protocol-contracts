// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.9;
import "../../../domain/BosonConstants.sol";
import { ERC721Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import { IERC721Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import { IERC721MetadataUpgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/IERC721MetadataUpgradeable.sol";
import { IERC2981Upgradeable } from "@openzeppelin/contracts-upgradeable/interfaces/IERC2981Upgradeable.sol";
import { IERC165Upgradeable } from "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165Upgradeable.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { ContextUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import { ERC2771ContextUpgradeable } from "@openzeppelin/contracts-upgradeable/metatx/ERC2771ContextUpgradeable.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";
import { IBosonVoucher } from "../../../interfaces/clients/IBosonVoucher.sol";
import { BeaconClientBase } from "../../bases/BeaconClientBase.sol";
import { BeaconClientLib } from "../../libs/BeaconClientLib.sol";
import { IClientExternalAddresses } from "../../../interfaces/clients/IClientExternalAddresses.sol";
import { IBosonConfigHandler } from "../../../interfaces/handlers/IBosonConfigHandler.sol";
import { IBosonExchangeHandler } from "../../../interfaces/handlers/IBosonExchangeHandler.sol";

/**
 * @title BosonVoucherBase
 * @notice This is the Boson Protocol ERC-721 Voucher contract.
 *
 * N.B. Although this contract extends OwnableUpgradeable and ERC721Upgradeable,
 *      that is only for convenience, to avoid conflicts with mixed imports.
 */
contract BosonVoucherBase is IBosonVoucher, BeaconClientBase, OwnableUpgradeable, ERC721Upgradeable {
    // Struct that is used to manipulate private variables from ERC721UpgradeableStorage
    struct ERC721UpgradeableStorage {
        // Mapping from token ID to owner address
        mapping(uint256 => address) _owners;
        // Mapping owner address to token count
        mapping(address => uint256) _balances;
    }

    struct PremintStatus {
        bool committable;
        uint256 offerId;
    }

    // Opensea collection config
    string private _contractURI;

    // Royalty percentage requested by seller (for all offers)
    uint256 private _royaltyPercentage;

    // Map an offerId to a Range for pre-minted offers
    mapping(uint256 => Range) private _rangeByOfferId;

    // All ranges as an array
    uint256[] private _rangeOfferIds;

    // Premint status, used only temporarly in transfers
    PremintStatus private _premintStatus;

    // Tell if preminted voucher has already been _committed
    mapping(uint256 => bool) private _committed;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[42] private __gap;

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
        Range storage range = _rangeByOfferId[exchange.offerId];

        // Revert if exchange id falls within a reserved range
        uint256 rangeStart = range.start;
        require(
            (_exchangeId < rangeStart) || (_exchangeId >= rangeStart + range.length),
            EXCHANGE_ID_IN_RESERVED_RANGE
        );

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
     * Must happen prior to calling preMint
     * Caller must have PROTOCOL role.
     *
     * Reverts if:
     * - Start id is not greater than zero for the first range
     * - Start id is not greater than the end id of the previous range for subsequent ranges
     * - Range length is zero
     * - Range length is too large, i.e., would cause an overflow
     * - Offer id is already associated with a range
     *
     * @param _offerId - the id of the offer
     * @param _start - the first id of the token range
     * @param _length - the length of the range
     */
    function reserveRange(
        uint256 _offerId,
        uint256 _start,
        uint256 _length
    ) external onlyRole(PROTOCOL) {
        // Prevent reservation of an empty range
        require(_length > 0, INVALID_RANGE_LENGTH);

        // Prevent overflow in issueVoucher and preMint
        require(_start <= type(uint256).max - _length, INVALID_RANGE_LENGTH);

        // Make sure that ranges are in ascending order
        uint256 rangeOfferIdsLength = _rangeOfferIds.length;
        if (rangeOfferIdsLength > 0) {
            // Get latest registered range
            Range storage lastRange = _rangeByOfferId[_rangeOfferIds[rangeOfferIdsLength - 1]];

            // New range should start after the end of last range
            require(_start >= lastRange.start + lastRange.length, INVALID_RANGE_START);
        } else {
            // Make sure range start is valid
            require(_start > 0, INVALID_RANGE_START);
        }

        // Get storage slot for the range
        Range storage range = _rangeByOfferId[_offerId];

        // Revert if the offer id is already associated with a range
        require(range.length == 0, OFFER_RANGE_ALREADY_RESERVED);

        // Store the reserved range
        range.start = _start;
        range.length = _length;
        _rangeOfferIds.push(_offerId);

        emit RangeReserved(_offerId, range);
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
     * Caller must be contract owner (seller assistant address).
     *
     * Reverts if:
     * - Offer id is not associated with a range
     * - Amount to mint is more than remaining un-minted in range
     * - Too many to mint in a single transaction, given current block gas limit
     * - Offer already expired
     * - Offer is voided
     * - _to is not the contract address or the owner
     
     * @param _offerId - the id of the offer
     * @param _amount - the amount to mint
     * @param _to - the address to send the minted vouchers to (contract address or contract owner)
     */
    function preMint(
        uint256 _offerId,
        uint256 _amount,
        address _to
    ) external onlyOwner {
        require(_to == address(this) || _to == owner(), "INVALID_ADDRESS");
        // Get the offer's range
        Range storage range = _rangeByOfferId[_offerId];

        // Revert if id not associated with a range
        require(range.length != 0, NO_RESERVED_RANGE_FOR_OFFER);

        // Revert if no more to mint in range
        require(range.length >= range.minted + _amount, INVALID_AMOUNT_TO_MINT);

        // Get max amount that can be minted in a single transaction
        address protocolDiamond = IClientExternalAddresses(BeaconClientLib._beacon()).getProtocolAddress();
        uint256 maxPremintedVouchers = IBosonConfigHandler(protocolDiamond).getMaxPremintedVouchers();

        // Revert if too many to mint in a single transaction
        require(_amount <= maxPremintedVouchers, TOO_MANY_TO_MINT);

        // Make sure that offer is not expired or voided
        (Offer memory offer, OfferDates memory offerDates) = getBosonOffer(_offerId);
        require(!offer.voided && (offerDates.validUntil > block.timestamp), OFFER_EXPIRED_OR_VOIDED);

        // Get the first token to mint
        uint256 start = range.start + range.minted;

        // Pre-mint the range
        uint256 tokenId;
        for (uint256 i = 0; i < _amount; i++) {
            tokenId = start + i;

            emit Transfer(address(0), _to, tokenId);
        }

        // Bump the minted count
        range.minted += _amount;

        // Update to total balance
        getERC721UpgradeableStorage()._balances[_to] += _amount;
    }

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
     */
    function burnPremintedVouchers(uint256 _offerId) external override onlyOwner {
        // Get the offer's range
        Range storage range = _rangeByOfferId[_offerId];

        // Revert if id not associated with a range
        require(range.length != 0, NO_RESERVED_RANGE_FOR_OFFER);

        // Make sure that offer is either expired or voided
        (Offer memory offer, OfferDates memory offerDates) = getBosonOffer(_offerId);
        require(offer.voided || (offerDates.validUntil <= block.timestamp), OFFER_STILL_VALID);

        // Get max amount that can be burned in a single transaction
        address protocolDiamond = IClientExternalAddresses(BeaconClientLib._beacon()).getProtocolAddress();
        uint256 maxPremintedVouchers = IBosonConfigHandler(protocolDiamond).getMaxPremintedVouchers();

        // Get the first token to burn
        uint256 start = (range.lastBurnedTokenId == 0) ? range.start : (range.lastBurnedTokenId + 1);

        // Get the last token to burn
        uint256 end = range.start + range.minted;

        // End should be greater than start
        require(end > start, NOTHING_TO_BURN);

        // If amount to burn is more than maxPremintedVouchers, burn only maxPremintedVouchers
        if (end > start + maxPremintedVouchers) {
            end = start + maxPremintedVouchers;
        }

        // Burn the range
        address seller = owner();
        uint256 burned;
        for (uint256 tokenId = start; tokenId < end; tokenId++) {
            // Burn only if not already _committed
            if (!_committed[tokenId]) {
                emit Transfer(seller, address(0), tokenId);
                burned++;
            }
        }

        // Update last burned token id
        range.lastBurnedTokenId = end - 1;

        // Update seller's total balance
        getERC721UpgradeableStorage()._balances[seller] -= burned;
    }

    /**
     * @notice Gets the number of vouchers available to be pre-minted for an offer.
     *
     * @param _offerId - the id of the offer
     * @return count - the count of vouchers in reserved range available to be pre-minted
     */
    function getAvailablePreMints(uint256 _offerId) external view returns (uint256 count) {
        // If offer is expired or voided, return 0
        (Offer memory offer, OfferDates memory offerDates) = getBosonOffer(_offerId);
        if (offer.voided || (offerDates.validUntil <= block.timestamp)) {
            return 0;
        }

        // Get the offer's range
        Range storage range = _rangeByOfferId[_offerId];

        // Count the number left to be minted
        count = range.length - range.minted;
    }

    /**
     * @notice Gets the range for an offer.
     *
     * @param _offerId - the id of the offer
     * @return range - the range struct with information about range start, length and already minted tokens
     */
    function getRangeByOfferId(uint256 _offerId) external view returns (Range memory range) {
        // Get the offer's range
        range = _rangeByOfferId[_offerId];
    }

    /**
     * @dev Returns the owner of the specified token.
     *
     * If the token IS a pre-mint, then the actual owner address hasn't been set,
     * but will be reported as the owner of this contract (the seller assistant).
     *
     * If the token IS NOT a pre-mint, then the actual owner will be reported.
     *
     * Reverts if:
     * - Token is not a pre-mint and does not have a stored owner, i.e., invalid token id
     *
     * @param _tokenId - the id of the token to check
     * @return owner - the address of the owner
     */
    function ownerOf(uint256 _tokenId)
        public
        view
        virtual
        override(ERC721Upgradeable, IERC721Upgradeable)
        returns (address owner)
    {
        if (_exists(_tokenId)) {
            // If _tokenId exists, it does not matter if vouchers were preminted or not
            return super.ownerOf(_tokenId);
        } else {
            // If _tokenId does not exist, but offer is committable, report contract owner as token owner
            (bool committable, ) = getPreMintStatus(_tokenId);
            if (committable) return super.owner();

            // Otherwise revert
            revert("ERC721: invalid token ID");
        }
    }

    /**
     * @dev See {IERC721-transferFrom}.
     */
    function transferFrom(
        address _from,
        address _to,
        uint256 _tokenId
    ) public virtual override(ERC721Upgradeable, IERC721Upgradeable) {
        (bool committable, uint256 offerId) = getPreMintStatus(_tokenId);

        if (committable) {
            // If offer is committable, temporarily update _owners, so transfer succeeds
            silentMintAndSetPremintStatus(_from, _tokenId, offerId);
        }

        super.transferFrom(_from, _to, _tokenId);
    }

    /**
     * @dev See {IERC721-safeTransferFrom}.
     */
    function safeTransferFrom(
        address _from,
        address _to,
        uint256 _tokenId,
        bytes memory _data
    ) public virtual override(ERC721Upgradeable, IERC721Upgradeable) {
        (bool committable, uint256 offerId) = getPreMintStatus(_tokenId);

        if (committable) {
            // If offer is committable, temporarily update _owners, so transfer succeeds
            silentMintAndSetPremintStatus(_from, _tokenId, offerId);
        }

        super.safeTransferFrom(_from, _to, _tokenId, _data);
    }

    /**
     * @notice Non-standard ERC721 function to transfer a pre-minted token from one address to another.
     *
     * Reverts if:
     * - TokenId was already used to commit
     * - TokenId already exists (i.e. has an owner)
     * - TokenId has not been preminted yet
     * - TokenId was already burned
     * - From is not the owner of the voucher contract
     *
     * @param _from - the address to transfer from
     * @param _to - the address to transfer to
     * @param _offerId - the id of the offer
     * @param _tokenId - the id of the token
     * @param _data - data to pass if receiver is contract
     */
    function transferPremintedFrom(
        address _from,
        address _to,
        uint256 _offerId,
        uint256 _tokenId,
        bytes memory _data
    ) external override {
        // Check that token has not been used yet
        require(!_committed[_tokenId] && !_exists(_tokenId), NOT_COMMITTABLE);

        // Get range associated with offer
        Range storage range = _rangeByOfferId[_offerId];

        // Check if token is committable
        require(range.start + range.minted - 1 >= _tokenId && _tokenId > range.lastBurnedTokenId, NOT_COMMITTABLE);

        // Temporarily update _owners, so transfer succeeds
        silentMintAndSetPremintStatus(_from, _tokenId, _offerId);

        super.safeTransferFrom(_from, _to, _tokenId, _data);
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
    function supportsInterface(bytes4 _interfaceId)
        public
        view
        override(ERC721Upgradeable, IERC165Upgradeable)
        returns (bool)
    {
        return (_interfaceId == type(IBosonVoucher).interfaceId ||
            _interfaceId == type(IERC2981Upgradeable).interfaceId ||
            super.supportsInterface(_interfaceId));
    }

    /**
     * @notice Gets the Voucher metadata URI.
     *
     * This method overrides the Open Zeppelin version, returning
     * a unique stored metadata URI for each token rather than a
     * replaceable baseURI template, since the latter is not compatible
     * with IPFS hashes.
     *
     * @param _tokenId - id of the voucher's associated exchange or pre-minted token id
     * @return the uri for the associated offer's off-chain metadata (blank if not found)
     */
    function tokenURI(uint256 _tokenId)
        public
        view
        override(ERC721Upgradeable, IERC721MetadataUpgradeable)
        returns (string memory)
    {
        (bool exists, Offer memory offer) = getBosonOfferByExchangeId(_tokenId);

        if (!exists) {
            (bool committable, uint256 offerId) = getPreMintStatus(_tokenId);
            if (committable) {
                exists = true;
                (offer, ) = getBosonOffer(offerId);
            }
        }
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
     * @param _newOwner - the address to which ownership of the voucher contract will be transferred
     */
    function transferOwnership(address _newOwner)
        public
        override(IBosonVoucher, OwnableUpgradeable)
        onlyRole(PROTOCOL)
    {
        require(_newOwner != address(0), OWNABLE_ZERO_ADDRESS);
        _transferOwnership(_newOwner);
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
     * @param _tokenId - the voucher queried for royalty information
     * @param _salePrice - the sale price of the voucher specified by _tokenId
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
        (bool offerExists, Offer memory offer) = getBosonOfferByExchangeId(_tokenId);

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
        require(_newRoyaltyPercentage <= maxRoyaltyPecentage, ROYALTY_FEE_INVALID);

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
     * @param _from - the address from which the voucher is being transferred
     * @param _to - the address to which the voucher is being transferred
     * @param _tokenId - the tokenId of the voucher that is being transferred
     */
    function _beforeTokenTransfer(
        address _from,
        address _to,
        uint256 _tokenId
    ) internal override {
        if (_premintStatus.committable) {
            // If is committable, invoke commitToPreMintedOffer on the protocol

            // Store offerId so _premintStatus can be deleted before making an external call
            uint256 offerId = _premintStatus.offerId;
            delete _premintStatus;

            // Set the preminted token as committed
            _committed[_tokenId] = true;

            // If this is a transfer of preminted token, treat it differently
            address protocolDiamond = IClientExternalAddresses(BeaconClientLib._beacon()).getProtocolAddress();
            IBosonExchangeHandler(protocolDiamond).commitToPreMintedOffer(payable(_to), offerId, _tokenId);
        } else if (_from != address(0) && _to != address(0) && _from != _to) {
            // Update the buyer associated with the voucher in the protocol
            // Only when transferring, not when minting or burning
            onVoucherTransferred(_tokenId, payable(_to));
        }
    }

    /**
     * @dev Determines if a token is pre-minted and committable via transfer hook
     *
     * Committable means:
     * - does not yet have an owner
     * - in a reserved range
     * - has been pre-minted
     * - has not been already burned
     *
     * @param _tokenId - the token id to check
     * @return committable - whether the token is committable
     * @return offerId - the associated offer id if committable
     */
    function getPreMintStatus(uint256 _tokenId) public view returns (bool committable, uint256 offerId) {
        // Not committable if _committed already or if token has an owner
        if (!_committed[_tokenId] && !_exists(_tokenId)) {
            // If are reserved ranges, search them
            uint256 length = _rangeOfferIds.length;
            if (length > 0) {
                // Binary search the ranges array
                uint256 low = 0; // Lower bound of search (array index)
                uint256 high = length; // Upper bound of search

                while (low < high) {
                    // Calculate the current midpoint and get the offer id
                    uint256 mid = (high + low) / 2;
                    uint256 currentOfferId = _rangeOfferIds[mid];

                    // Get the range stored at the midpoint
                    Range storage range = _rangeByOfferId[currentOfferId];

                    // Get the beginning of the range once for reference
                    uint256 start = range.start;

                    if (start > _tokenId) {
                        // Split low and search again if target too high
                        high = mid;
                    } else if (start + range.length - 1 >= _tokenId) {
                        // Is token in target's reserved range?

                        if (start + range.minted - 1 >= _tokenId && _tokenId > range.lastBurnedTokenId) {
                            // Has it been pre-minted and not burned yet?
                            committable = true;
                            offerId = currentOfferId;
                        }
                        break; // Found!
                    } else {
                        // No? It may be in a higher range
                        low = mid + 1;
                    }
                }
            }
        }
    }

    /*
     * Returns storage pointer to location of private variables
     * 0x99 is location of _owners
     * 0x9a is location of _balances
     *
     * Since ERC721UpgradeableStorage slot is 0x99
     * _owners slot is ERC721UpgradeableStorage + 0
     * _balances slot is ERC721UpgradeableStorage + 1
     */
    function getERC721UpgradeableStorage() internal pure returns (ERC721UpgradeableStorage storage ps) {
        assembly {
            ps.slot := 0x99
        }
    }

    /*
     * Updates owners, but do not emit Transfer event. Event was already emited during pre-mint.
     */
    function silentMintAndSetPremintStatus(
        address _from,
        uint256 _tokenId,
        uint256 _offerId
    ) internal {
        // update data, so transfer will succeed
        getERC721UpgradeableStorage()._owners[_tokenId] = _from;

        // Update premint status
        _premintStatus.committable = true;
        _premintStatus.offerId = _offerId;
    }
}

/**
 * @title BosonVoucher
 * @notice This is the Boson Protocol ERC-721 Voucher contract.
 *
 * N.B. This is only a logic contract, delegated to by BeaconClientProxy. Thus,
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
 * - Burned when the buyer redeems the voucher
 * - Support for pre-minted voucher id ranges
 *
 * @dev This contract inherit BosonVoucherBase because we have added support to meta transaction
 *      and split into two contracts doesn't mess up the storage layout when importing ERC2771ContextUpgradeable
 */
contract BosonVoucher is BosonVoucherBase, ERC2771ContextUpgradeable {
    constructor(address forwarder) ERC2771ContextUpgradeable(forwarder) {}

    /**
     * @notice This function returns the calldata of the current message.
     * @dev It is an override of the ERC2771ContextUpgradeable._msgData() function which allows meta transactions.
     */
    function _msgData() internal view override(ContextUpgradeable, ERC2771ContextUpgradeable) returns (bytes calldata) {
        return ERC2771ContextUpgradeable._msgData();
    }

    /**
     * @notice This function returns the sender of the current message.
     * @dev It is an override of the ERC2771ContextUpgradeable._msgSender() function which allows meta transactions.
     */
    function _msgSender()
        internal
        view
        override(ContextUpgradeable, ERC2771ContextUpgradeable)
        returns (address sender)
    {
        return ERC2771ContextUpgradeable._msgSender();
    }

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[50] private __gap;
}
