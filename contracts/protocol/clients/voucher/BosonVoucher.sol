// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import "../../../domain/BosonConstants.sol";
import { ERC721Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import { IERC721Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import { IERC721MetadataUpgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/IERC721MetadataUpgradeable.sol";
import { IERC2981Upgradeable } from "@openzeppelin/contracts-upgradeable/interfaces/IERC2981Upgradeable.sol";
import { IERC165Upgradeable } from "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165Upgradeable.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { ContextUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import { ERC2771ContextUpgradeable } from "@openzeppelin/contracts-upgradeable/metatx/ERC2771ContextUpgradeable.sol";
import { Context } from "@openzeppelin/contracts/utils/Context.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";
import { Address } from "@openzeppelin/contracts/utils/Address.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IBosonVoucher } from "../../../interfaces/clients/IBosonVoucher.sol";
import { BeaconClientBase } from "../../bases/BeaconClientBase.sol";
import { BeaconClientLib } from "../../libs/BeaconClientLib.sol";
import { IClientExternalAddresses } from "../../../interfaces/clients/IClientExternalAddresses.sol";
import { IBosonFundsHandler } from "../../../interfaces/handlers/IBosonFundsHandler.sol";

/**
 * @title BosonVoucherBase
 * @notice This is the Boson Protocol ERC-721 Voucher contract.
 *
 * N.B. Although this contract extends OwnableUpgradeable and ERC721Upgradeable,
 *      that is only for convenience, to avoid conflicts with mixed imports.
 */
contract BosonVoucherBase is IBosonVoucher, BeaconClientBase, OwnableUpgradeable, ERC721Upgradeable {
    using Address for address;
    using SafeERC20 for IERC20;

    // Struct that is used to manipulate private variables from ERC721UpgradeableStorage
    struct ERC721UpgradeableStorage {
        // Mapping from token ID to owner address
        mapping(uint256 => address) _owners;
        // Mapping owner address to token count
        mapping(address => uint256) _balances;
    }

    // Opensea collection config
    string private _contractURI;

    // Royalty percentage requested by seller (for all offers)
    // Not used anymore. Need to stay to avoid storage shift.
    uint256 private _royaltyPercentageUnused;

    // Map an offerId to a Range for pre-minted offers
    mapping(uint256 => Range) private _rangeByOfferId;

    // Used only temporarly in transfers
    bool private _isCommittable;

    // Tell if voucher has already been _committed
    mapping(uint256 => bool) private _committed;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[45] private __gap;

    /**
     * @notice Initializes the voucher.
     * This function is callable only once.
     */
    function initializeVoucher(
        uint256 _sellerId,
        uint256 _collectionIndex,
        address _newOwner,
        VoucherInitValues calldata voucherInitValues
    ) public initializer {
        string memory sellerId = string.concat(
            "S",
            Strings.toString(_sellerId),
            "_C",
            Strings.toString(_collectionIndex)
        );
        string memory voucherName = string.concat(VOUCHER_NAME, " ", sellerId);
        string memory voucherSymbol = string.concat(VOUCHER_SYMBOL, "_", sellerId);

        __ERC721_init_unchained(voucherName, voucherSymbol);

        // we don't call init on ownable, but rather just set the ownership to correct owner
        _transferOwnership(_newOwner);

        _setContractURI(voucherInitValues.contractURI);

        emit VoucherInitialized(_sellerId, _contractURI);
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
     * @param _tokenId - voucher token id corresponds to <<uint128(offerId)>>.<<uint128(exchangeId)>>
     * @param _buyer - the buyer address
     */
    function issueVoucher(uint256 _tokenId, address _buyer) external override onlyRole(PROTOCOL) {
        // Derive offerId
        uint256 offerId = _tokenId >> 128;

        // See if the offer id is associated with a range
        Range storage range = _rangeByOfferId[offerId];

        // Revert if exchange id falls within a reserved range
        uint256 rangeStart = range.start;
        if (_tokenId >= rangeStart && _tokenId < rangeStart + range.length) revert ExchangeIdInReservedRange();

        // Issue voucher is called only during commitToOffer (in protocol), so token can be set as committed
        _committed[_tokenId] = true;

        // Mint the voucher, sending it to the buyer address
        _mint(_buyer, _tokenId);
    }

    /**
     * @notice Burns a voucher.
     *
     * Caller must have PROTOCOL role.
     *
     * @param _tokenId - voucher token id corresponds to <<uint128(offerId)>>.<<uint128(exchangeId)>>
     */
    function burnVoucher(uint256 _tokenId) external override onlyRole(PROTOCOL) {
        _burn(_tokenId);
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
     * - _to is not the contract address or the contract owner
     *
     * @param _offerId - the id of the offer
     * @param _start - the first id of the token range
     * @param _length - the length of the range
     * @param _to - the address to send the pre-minted vouchers to (contract address or contract owner)
     */
    function reserveRange(uint256 _offerId, uint256 _start, uint256 _length, address _to) external onlyRole(PROTOCOL) {
        // _to must be the contract address or the contract owner (operator)
        if (_to != address(this) && _to != owner()) revert InvalidToAddress();

        // Prevent reservation of an empty range
        if (_length == 0) revert InvalidRangeLength();

        // Adjust start id to include offer id
        if (_start == 0) revert InvalidRangeStart();
        _start += (_offerId << 128);

        // Prevent overflow in issueVoucher and preMint
        if (_start > type(uint256).max - _length) revert InvalidRangeLength();

        // Get storage slot for the range
        Range storage range = _rangeByOfferId[_offerId];

        // Revert if the offer id is already associated with a range
        if (range.length != 0) revert OfferRangeAlreadyReserved();

        // Store the reserved range
        range.start = _start;
        range.length = _length;
        range.owner = _to;

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
     * - Offer already expired
     * - Offer is voided
     *
     * @param _offerId - the id of the offer
     * @param _amount - the amount to mint
     */
    function preMint(uint256 _offerId, uint256 _amount) external onlyOwner {
        // Get the offer's range
        Range storage range = _rangeByOfferId[_offerId];

        // Revert if id not associated with a range
        if (range.length == 0) revert NoReservedRangeForOffer();

        // Revert if no more to mint in range
        if (range.length < range.minted + _amount) revert InvalidAmountToMint();

        // Make sure that offer is not expired or voided
        (Offer memory offer, OfferDates memory offerDates) = getBosonOffer(_offerId);
        if (offer.voided || block.timestamp > offerDates.validUntil) revert OfferExpiredOrVoided();

        // Get the first token to mint
        uint256 start = range.start + range.minted;
        address to = range.owner;

        // Pre-mint the range
        uint256 tokenId;
        for (uint256 i = 0; i < _amount; ) {
            tokenId = start + i;

            emit Transfer(address(0), to, tokenId);

            unchecked {
                i++;
            }
        }

        // Bump the minted count
        range.minted += _amount;

        // Update to total balance
        getERC721UpgradeableStorage()._balances[to] += _amount;

        emit VouchersPreMinted(_offerId, start, tokenId);
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
     * @param _amount - amount to burn
     */
    function burnPremintedVouchers(uint256 _offerId, uint256 _amount) external override onlyOwner {
        // Get the offer's range
        Range storage range = _rangeByOfferId[_offerId];

        // Revert if id not associated with a range
        if (range.length == 0) revert NoReservedRangeForOffer();

        // Make sure that offer is either expired or voided
        (Offer memory offer, OfferDates memory offerDates) = getBosonOffer(_offerId);
        if (!offer.voided && block.timestamp <= offerDates.validUntil) revert OfferStillValid();

        // Get the first token to burn
        uint256 start = range.lastBurnedTokenId == 0 ? range.start : range.lastBurnedTokenId + 1;

        // Get the last token to burn
        uint256 end = start + _amount;

        // End should be greater than start
        if (end <= start || end > range.start + range.minted) revert AmountExceedsRangeOrNothingToBurn();

        // Burn the range
        address rangeOwner = range.owner;
        uint256 burned;
        for (uint256 tokenId = start; tokenId < end; tokenId++) {
            // Burn only if not already _committed
            if (!_committed[tokenId]) {
                emit Transfer(rangeOwner, address(0), tokenId);
                burned++;
            }
        }

        // Update last burned token id
        range.lastBurnedTokenId = end - 1;

        // Update owner's total balance
        getERC721UpgradeableStorage()._balances[rangeOwner] -= burned;
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
        if (offer.voided || block.timestamp > offerDates.validUntil) {
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
    function ownerOf(
        uint256 _tokenId
    ) public view virtual override(ERC721Upgradeable, IERC721Upgradeable) returns (address owner) {
        if (_exists(_tokenId)) {
            // If _tokenId exists, it does not matter if vouchers were preminted or not
            return super.ownerOf(_tokenId);
        } else {
            // If _tokenId does not exist, but offer is committable, report contract owner as token owner
            bool committable = isTokenCommittable(_tokenId);

            if (committable) {
                owner = _rangeByOfferId[_tokenId >> 128].owner;
                return owner;
            }

            // Otherwise revert
            revert(ERC721_INVALID_TOKEN_ID);
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
        bool committable = isTokenCommittable(_tokenId);

        if (committable) {
            silentMint(_from, _tokenId);
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
        bool committable = isTokenCommittable(_tokenId);

        if (committable) {
            silentMint(_from, _tokenId);
        }

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
    function supportsInterface(
        bytes4 _interfaceId
    ) public view override(ERC721Upgradeable, IERC165Upgradeable) returns (bool) {
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
     * Reverts if token id is not associated with any exchange or pre-minted offer.
     *
     * @param _tokenId - id of the voucher's associated exchange or pre-minted token id
     * @return the uri for the associated offer's off-chain metadata (blank if not found)
     */
    function tokenURI(
        uint256 _tokenId
    ) public view override(ERC721Upgradeable, IERC721MetadataUpgradeable) returns (string memory) {
        uint256 exchangeId = _tokenId & type(uint128).max;
        (bool exists, Offer memory offer) = getBosonOfferByExchangeId(exchangeId);

        if (!exists) {
            bool committable = isTokenCommittable(_tokenId);

            if (committable) {
                uint256 offerId = _tokenId >> 128;
                exists = true;
                (offer, ) = getBosonOffer(offerId);
            }
        }

        // solhint-disable-next-line custom-errors
        require(exists, ERC721_INVALID_TOKEN_ID); // not using Custom Errors here to match OZ 4.9.* errors
        return offer.metadataUri;
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
     * Reverts if:
     * - Caller is not the protocol
     * - New owner is the zero address
     *
     * @param _newOwner - the address to which ownership of the voucher contract will be transferred
     */
    function transferOwnership(
        address _newOwner
    ) public override(IBosonVoucher, OwnableUpgradeable) onlyRole(PROTOCOL) {
        // solhint-disable-next-line custom-errors
        require(_newOwner != address(0), OWNABLE_ZERO_ADDRESS); // not using Custom Errors here to match OZ 4.9.* errors

        _transferOwnership(_newOwner);
    }

    /**
     * @notice Overriding renounceOwnership() from OwnableUpgradeable, so it's not possible to renounce ownership.
     *
     * N.B. In the future it might be possible to renounce ownership via seller deactivation in the protocol.
     */
    function renounceOwnership() public pure override {
        revert AccessDenied();
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

    /** @notice Make a call to an external contract.
     *
     * Reverts if:
     * - _to is zero address
     * - call to external contract fails
     * - caller is not the owner
     * - _to is a contract that represents some assets (all contracts that implement `balanceOf` method, including ERC20 and ERC721)
     *
     *
     * @param _to - address of the contract to call
     * @param _data - data to pass to the external contract
     * @return result - result of the call
     */
    function callExternalContract(address _to, bytes calldata _data) external payable onlyOwner returns (bytes memory) {
        if (_to == address(0)) revert InvalidAddress();

        // Check if _to supports `balanceOf` method and revert if it does
        // This works with all contracts that implement this method even if they don't necessary implement ERC20 interface
        try IERC20(_to).balanceOf(address(this)) returns (uint256) {
            revert InteractionNotAllowed();
        } catch {}

        return _to.functionCallWithValue(_data, msg.value, FUNCTION_CALL_NOT_SUCCESSFUL);
    }

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
    function setApprovalForAllToContract(address _operator, bool _approved) external onlyOwner {
        if (_operator == address(0)) revert InvalidAddress();

        _setApprovalForAll(address(this), _operator, _approved);
    }

    // @dev Contract must be allowed to receive native token as it can be used as voucher's owner
    receive() external payable {}

    /**
     * @dev See {IERC721Receiver-onERC721Received}.
     *
     * Always returns `IERC721Receiver.onERC721Received.selector`.
     */
    function onERC721Received(address, address, uint256, bytes memory) public virtual override returns (bytes4) {
        return this.onERC721Received.selector;
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
    function royaltyInfo(
        uint256 _tokenId,
        uint256 _salePrice
    ) external view override returns (address receiver, uint256 royaltyAmount) {
        uint256 offerId;
        bool isPreminted;
        if (!_exists(_tokenId)) {
            // might not exists or is preminted
            isPreminted = isTokenCommittable(_tokenId);
            if (!isPreminted) {
                return (address(0), 0);
            }
            offerId = _tokenId >> 128;
        }

        uint256 royaltyPercentage;
        (receiver, royaltyPercentage) = getEIP2981RoyaltiesFromProtocol(
            isPreminted ? offerId : (_tokenId & type(uint128).max),
            !isPreminted
        );

        royaltyAmount = (_salePrice * royaltyPercentage) / HUNDRED_PERCENT;
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
     * @param _tokenId - the first token id of the batch
     * @param - this parameter is ignored, but required to match the signature of the parent method
     */
    function _beforeTokenTransfer(address _from, address _to, uint256 _tokenId, uint256) internal override {
        // If is committable, invoke onPremintedVoucherTransferred on the protocol
        if (_isCommittable) {
            // Set _isCommitable to false
            _isCommittable = false;

            address rangeOwner = _rangeByOfferId[_tokenId >> 128].owner;

            // Call protocol onPremintedVoucherTransferred
            bool committed = onPremintedVoucherTransferred(_tokenId, payable(_to), _from, rangeOwner);

            // Set committed status
            _committed[_tokenId] = committed;
        } else if (_from != address(0) && _to != address(0) && _from != _to) {
            // Update the buyer associated with the voucher in the protocol
            // Only when transferring, not when minting or burning
            onVoucherTransferred(_tokenId, payable(_to));
        }
    }

    /**
     * @notice Verify if token is committable.
     *
     * @param _tokenId - the tokenId of the voucher that is being transferred
     *
     * @return committable - true if the voucher is committable
     */
    function isTokenCommittable(uint256 _tokenId) public view returns (bool committable) {
        if (_committed[_tokenId]) {
            return false;
        } else {
            // it might be a pre-minted token. Preminted tokens have offerId in the upper 128 bits
            uint256 offerId = _tokenId >> 128;

            if (offerId > 0) {
                // Get the range stored at the midpoint
                Range storage range = _rangeByOfferId[offerId];

                // Get the beginning of the range once for reference
                uint256 start = range.start;

                // Start is 0 if the range does not exist
                // Token is committable if is within the range and has not been burned already
                if (
                    start > 0 &&
                    start <= _tokenId &&
                    start + range.minted - 1 >= _tokenId &&
                    _tokenId > range.lastBurnedTokenId
                ) {
                    // Has it been pre-minted, not burned yet
                    committable = true;
                }
            }
        }
    }

    /**
     * @notice Withdraw funds from the contract to the protocol seller pool
     *
     * @param _tokenList - list of tokens to withdraw, including native token (address(0))
     */
    function withdrawToProtocol(address[] calldata _tokenList) external {
        address protocolDiamond = IClientExternalAddresses(BeaconClientLib._beacon()).getProtocolAddress();
        uint256 sellerId = getSellerId();

        for (uint256 i = 0; i < _tokenList.length; ) {
            address token = _tokenList[i];
            if (token == address(0)) {
                uint256 balance = address(this).balance;

                if (balance > 0) {
                    IBosonFundsHandler(protocolDiamond).depositFunds{ value: balance }(sellerId, token, balance);
                }
            } else {
                uint256 balance = IERC20(token).balanceOf(address(this));
                if (balance > 0) {
                    // get current allowance
                    uint256 allowance = IERC20(token).allowance(address(this), protocolDiamond);
                    if (allowance < balance) {
                        IERC20(token).forceApprove(protocolDiamond, balance);
                    }
                    IBosonFundsHandler(protocolDiamond).depositFunds(sellerId, token, balance);
                }
            }

            unchecked {
                i++;
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
    function silentMint(address _from, uint256 _tokenId) internal {
        if (!_exists(_tokenId) && (_from == address(this) || _from == owner())) {
            // update data, so transfer will succeed
            getERC721UpgradeableStorage()._owners[_tokenId] = _from;
        }

        _isCommittable = true;
    }

    /*
     * Override ERC721Upgradeable._isApprovedOrOwner to check for pre-minted tokens
     */
    function _isApprovedOrOwner(address spender, uint256 tokenId) internal view override returns (bool) {
        address owner = ownerOf(tokenId);
        return (spender == owner || isApprovedForAll(owner, spender) || getApproved(tokenId) == spender);
    }

    /*
     **
     * @dev Reverts if the `_tokenId` has not been minted yet and is not a pre-minted token.
     */
    function _requireMinted(uint256 _tokenId) internal view override {
        // If token is committable, it is a pre-minted token
        bool committable = isTokenCommittable(_tokenId);

        // solhint-disable-next-line custom-errors
        require(_exists(_tokenId) || committable, "ERC721: invalid token ID"); // not using Custom Errors here to match OZ 4.9.* errors
    }

    /**
     * @notice This function returns the calldata of the current message.
     */
    function _msgData() internal view virtual override(Context, ContextUpgradeable) returns (bytes calldata) {
        return ContextUpgradeable._msgData();
    }

    /**
     * @notice This function returns the sender of the current message.
     */
    function _msgSender() internal view virtual override(Context, ContextUpgradeable) returns (address sender) {
        return ContextUpgradeable._msgSender();
    }

    /**
     * @notice This function specifies the context as being a single address (20 bytes).
     */
    function _contextSuffixLength() internal view virtual override(Context, ContextUpgradeable) returns (uint256) {
        return ContextUpgradeable._contextSuffixLength();
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
    function _msgData() internal view override(BosonVoucherBase, ERC2771ContextUpgradeable) returns (bytes calldata) {
        return ERC2771ContextUpgradeable._msgData();
    }

    /**
     * @notice This function returns the sender of the current message.
     * @dev It is an override of the ERC2771ContextUpgradeable._msgSender() function which allows meta transactions.
     */
    function _msgSender() internal view override(BosonVoucherBase, ERC2771ContextUpgradeable) returns (address sender) {
        return ERC2771ContextUpgradeable._msgSender();
    }

    /**
     * @notice This function specifies the context as being a single address (20 bytes).
     * @dev It is an override of the ERC2771ContextUpgradeable._contextSuffixLength() function which allows meta transactions.
     */
    function _contextSuffixLength()
        internal
        view
        override(BosonVoucherBase, ERC2771ContextUpgradeable)
        returns (uint256)
    {
        return ERC2771ContextUpgradeable._contextSuffixLength();
    }
}
