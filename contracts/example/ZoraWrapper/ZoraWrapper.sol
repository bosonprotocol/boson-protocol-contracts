// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.9;

import { IBosonOfferHandler } from "../../interfaces/handlers/IBosonOfferHandler.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { BosonTypes } from "../../domain/BosonTypes.sol";
import { SafeERC20 } from "../../ext_libs/SafeERC20.sol";
import { IERC20 } from "../../interfaces/IERC20.sol";
import { ERC721 } from "./../support/ERC721.sol";
import { IERC721Metadata } from "./../support/IERC721Metadata.sol";
import { IERC721 } from "../../interfaces/IERC721.sol";
import { IERC165 } from "../../interfaces/IERC165.sol";

/**
 * @title ZoraWrapper
 * @notice Wraps Boson Vouchers so they can be used with Zora Auction House.
 *
 * Features:
 *
 * Out-of-band setup:
 */
contract ZoraWrapper is BosonTypes, Ownable, ERC721 {
    // Add safeTransferFrom to IERC20
    using SafeERC20 for IERC20;

    address private immutable voucherAddress;
    address private immutable zoraAuctionHouseAddress;
    address private immutable protocolAddress;

    uint256 private pendingTokenId;
    mapping(uint256 => uint256) public price;
    mapping(uint256 => address) private cachedExchangeToken;

    /**
     * @notice Constructor
     *
     * @param _voucherAddress The address of the voucher that are wrapped by this contract.
     * @param _zoraAuctionHouseAddress The address of Zora Auction House.
     */
    constructor(
        address _voucherAddress,
        address _zoraAuctionHouseAddress,
        address _protocolAddress
    ) ERC721(getVoucherName(_voucherAddress), getVoucherSymbol(_voucherAddress)) {
        voucherAddress = _voucherAddress;
        zoraAuctionHouseAddress = _zoraAuctionHouseAddress;
        protocolAddress = _protocolAddress;

        // Approve Zora Auction House to transfer wrapped vouchers
        setApprovalForAll(_zoraAuctionHouseAddress, true);
        setApprovalForAll(msg.sender, true); // msg.sender is the owner of this contract and must be approved to transfer wrapped vouchers to Auction House
    }

    function getVoucherName(address _voucherAddress) internal view returns (string memory) {
        string memory name = IERC721Metadata(_voucherAddress).name();
        return string(abi.encodePacked("WRAPPED", name));
    }

    function getVoucherSymbol(address _voucherAddress) internal view returns (string memory) {
        string memory symbol = IERC721Metadata(_voucherAddress).symbol();
        return string(abi.encodePacked("W", symbol));
    }

    function supportsInterface(bytes4 _interfaceId) public view virtual override(ERC721) returns (bool) {
        return (_interfaceId == type(IERC721).interfaceId || _interfaceId == type(IERC165).interfaceId);
    }

    function wrap(uint256 _tokenId) external onlyOwner {
        // should wrapping be limited to onlyOwner?
        // if not wrapping can be done with onERC721Received

        // transfer voucher to this contract
        // instead of msg.sender it could be voucherAddress.
        IERC721(voucherAddress).transferFrom(msg.sender, address(this), _tokenId);

        // Mint to itself, so it can be used with Zora Auction House
        _mint(address(this), _tokenId);
    }

    function unwrap(uint256 _tokenId) external {
        // either contract owner or protocol can unwrap
        // if contract owner is unwrapping, this is equivalent to withdrawing from Zora Auction House
        require(
            msg.sender == protocolAddress || (ownerOf(_tokenId) == msg.sender && owner() == msg.sender),
            "ZoraWrapper: Only owner or protocol can unwrap"
        );

        if (pendingTokenId != 0) updatePendingTokenPrice(pendingTokenId);

        uint256 priceToPay = price[_tokenId];

        delete price[_tokenId];
        delete pendingTokenId;

        // transfer voucher to voucher owner
        IERC721(voucherAddress).safeTransferFrom(address(this), ownerOf(_tokenId), _tokenId);

        // Transfer token to protocol
        if (priceToPay > 0) {
            IERC20(cachedExchangeToken[_tokenId]).safeTransfer(protocolAddress, priceToPay);
        }

        // Burn wrapped voucher
        _burn(_tokenId);
    }

    function _beforeTokenTransfer(
        address _from,
        address _to,
        uint256 _tokenId
    ) internal virtual override(ERC721) {
        if (_from == zoraAuctionHouseAddress && _to != address(this)) {
            // auction is over, and wrapped voucher is being transferred to voucher owner

            if (pendingTokenId != 0) updatePendingTokenPrice(pendingTokenId);

            price[pendingTokenId] = getCurrentBalance(_tokenId);

            pendingTokenId = _tokenId;
        }

        super._beforeTokenTransfer(_from, _to, _tokenId);
    }

    function updatePendingTokenPrice(uint256 _tokenId) internal {
        price[pendingTokenId] = getCurrentBalance(_tokenId) - price[pendingTokenId];
    }

    function getCurrentBalance(uint256 _tokenId) internal returns (uint256) {
        address exchangeToken = cachedExchangeToken[_tokenId];
        if (exchangeToken == address(0)) {
            uint256 offerId = _tokenId >> 128;

            // get exchange token.
            (, BosonTypes.Offer memory offer, , , , ) = IBosonOfferHandler(protocolAddress).getOffer(offerId);
            exchangeToken = offer.exchangeToken;

            cachedExchangeToken[_tokenId] = exchangeToken;
        }
        return IERC20(exchangeToken).balanceOf(address(this));
    }
}
