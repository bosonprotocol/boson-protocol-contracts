// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.9;
import { IBosonExchangeHandler } from "../../interfaces/handlers/IBosonExchangeHandler.sol";
import { IBosonOfferHandler } from "../../interfaces/handlers/IBosonOfferHandler.sol";
import { DAIAliases as DAI } from "../../interfaces/DAIAliases.sol";
import { BosonTypes } from "../../domain/BosonTypes.sol";
import { ERC721 } from "./../support/ERC721.sol";
import { IERC721Metadata } from "./../support/IERC721Metadata.sol";
import { IERC165 } from "../../interfaces/IERC165.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IWrappedNative } from "../../interfaces/IWrappedNative.sol";

interface IPool {
    function swapTokenForSpecificNFTs(
        uint256[] calldata nftIds,
        uint256 maxExpectedTokenInput,
        address nftRecipient,
        bool isRouter,
        address routerCaller
    ) external payable returns (uint256 inputAmount);
}

/**
 * @title SudoswapWrapper
 * @notice Wraps Boson Vouchers so they can be used with Sudoswap.
 *
 * Features:
 * - Wraps vouchers into ERC721 tokens that can be used with Sudoswap.
 * - Tracks the price agreed in Sudoswap.
 * - Allows to unwrap the voucher and sends funds to the protocol.
 * - Owner of wrapped voucher has the right to receive the true corresponding Boson voucher
 *
 * Out-of-band setup:
 * - Create a seller in Boson Protocol and get the Boson Voucher address.
 * - Deploy a SudoswapWrapper contract and pass the Boson Voucher address.
 * - Approve SudoswapWrapper to transfer Boson Vouchers on behalf of the seller.
 *
 * Usage:
 * - Seller wraps a voucher by calling `wrap` function.
 * - Seller calls Sudoswap method `createAuction` with the wrapped voucher address.
 * - Auction proceeds normally and either finishes with `endAuction` or `cancelAuction`.
 * - If auction finishes with `endAuction`:
 *   - Bidder gets wrapped voucher and this contract gets the price.
 *   - `unwrap` must be executed via the Boson Protocol `commitToOffer` method.
 * - If auction finishes with `cancelAuction`:
 *   - This contract gets wrapped voucher back and the bidder gets the price.
 *   - `unwrap` can be executed by the owner of the wrapped voucher.
 *
 * N.B. Although Sudoswap can send ethers, it's preffered to receive
 * WETH instead. For that reason `recieve` is not implemented, so it automatically sends WETH.
 */
contract SudoswapWrapper is BosonTypes, Ownable, ERC721 {
    // Add safeTransferFrom to IERC20
    using SafeERC20 for IERC20;

    // Contract addresses
    address private immutable voucherAddress;
    address private poolAddress;
    address private immutable factoryAddress;
    address private immutable protocolAddress;
    address private immutable wethAddress;

    // Mapping from token ID to price. If pendingTokenId == tokenId, this is not the final price.
    mapping(uint256 => uint256) private price;

    // Mapping to cache exchange token address, so costly call to the protocol is not needed every time.
    mapping(uint256 => address) private cachedExchangeToken;

    /**
     * @notice Constructor
     *
     * @param _voucherAddress The address of the voucher that are wrapped by this contract.
     * @param _factoryAddress The address of the Sudoswap factory.
     * @param _protocolAddress The address of the Boson Protocol.
     * @param _wethAddress The address of the WETH token.
     */
    constructor(
        address _voucherAddress,
        address _factoryAddress,
        address _protocolAddress,
        address _wethAddress
    ) ERC721(getVoucherName(_voucherAddress), getVoucherSymbol(_voucherAddress)) {
        voucherAddress = _voucherAddress;
        factoryAddress = _factoryAddress;
        protocolAddress = _protocolAddress;
        wethAddress = _wethAddress;

        // Approve pool to transfer wrapped vouchers
        _setApprovalForAll(address(this), _factoryAddress, true);
    }

    /**
     * @dev Returns true if this contract implements the interface defined by
     * `interfaceId`. See the corresponding
     * https://eips.ethereum.org/EIPS/eip-165#how-interfaces-are-identified[EIP section]
     * to learn more about how these ids are created.
     */
    function supportsInterface(bytes4 _interfaceId) public view virtual override(ERC721) returns (bool) {
        return (_interfaceId == type(IERC721).interfaceId || _interfaceId == type(IERC165).interfaceId);
    }

    /**
     * @notice Wraps the vouchers, transfer true vouchers to this contract and mint wrapped vouchers
     *
     * Reverts if:
     *  - caller is not the contract owner
     *
     * @param _tokenIds The token ids.
     */
    function wrap(uint256[] memory _tokenIds) external onlyOwner {
        for (uint256 i = 0; i < _tokenIds.length; i++) {
            uint256 tokenId = _tokenIds[i];

            // Transfer vouchers to this contract
            // Instead of msg.sender it could be voucherAddress, if vouchers were preminted to contract itself
            IERC721(voucherAddress).transferFrom(msg.sender, address(this), tokenId);

            // Mint to caller, so it can be used with Sudoswap
            _mint(msg.sender, tokenId);
        }
    }

    /**
     * @notice Unwraps the voucher, transfer true voucher to owner and funds to the protocol.
     *
     * Reverts if:
     *  - caller is neither protocol nor voucher owner
     *
     * @param _tokenId The token id.
     */
    function unwrap(uint256 _tokenId) external {
        address wrappedVoucherOwner = ownerOf(_tokenId);

        // Either contract owner or protocol can unwrap
        // If contract owner is unwrapping, this is equivalent to removing the voucher from the pool
        require(
            msg.sender == protocolAddress || wrappedVoucherOwner == msg.sender,
            "SudoswapWrapper: Only owner or protocol can unwrap"
        );

        uint256 priceToPay = price[_tokenId];

        // Delete price and pendingTokenId to prevent reentrancy
        delete price[_tokenId];

        // transfer Boson Voucher to voucher owner
        IERC721(voucherAddress).safeTransferFrom(address(this), wrappedVoucherOwner, _tokenId);

        // Transfer token to protocol
        if (priceToPay > 0) {
            // This example only supports WETH
            IERC20(cachedExchangeToken[_tokenId]).safeTransfer(protocolAddress, priceToPay);
        }

        delete cachedExchangeToken[_tokenId]; // gas refund

        // Burn wrapped voucher
        _burn(_tokenId);
    }

    /**
     * @notice Set the pool address
     *
     * @param _poolAddress The pool address
     */
    function setPoolAddress(address _poolAddress) external onlyOwner {
        poolAddress = _poolAddress;
    }

    /**
     * @notice swap token for specific NFT
     *
     * @param _tokenId - the token id
     * @param _maxPrice - the max price
     */
    function swapTokenForSpecificNFT(uint256 _tokenId, uint256 _maxPrice) external {
        uint256 balanceBefore = getCurrentBalance(_tokenId);

        uint256[] memory tokenIds = new uint256[](1);
        tokenIds[0] = _tokenId;

        IWrappedNative(wethAddress).transferFrom(msg.sender, address(this), _maxPrice);
        IWrappedNative(wethAddress).approve(poolAddress, _maxPrice);

        IPool(poolAddress).swapTokenForSpecificNFTs(tokenIds, _maxPrice, msg.sender, false, address(0));

        uint256 balanceAfter = getCurrentBalance(_tokenId);

        uint256 actualPrice = balanceAfter - balanceBefore;
        require(actualPrice <= _maxPrice, "SudoswapWrapper: Price too high");

        price[_tokenId] = actualPrice;
    }

    /**
     * @notice Gets own the token balance for the exchange token, associated with the token ID.
     *
     * @dev If the exchange token is not known, it is fetched from the protocol and cached for future use.
     *
     * @param _tokenId The token id.
     */
    function getCurrentBalance(uint256 _tokenId) internal returns (uint256) {
        address exchangeToken = cachedExchangeToken[_tokenId];

        // If exchange token is not known, get it from the protocol.
        if (exchangeToken == address(0)) {
            uint256 offerId = _tokenId >> 128; // OfferId is the first 128 bits of the token ID.

            if (offerId == 0) {
                // pre v2.2.0. Token does not have offerId, so we need to get it from the protocol.
                // Get Boson exchange. Don't explicitly check if the exchange exists, since existance of the token implies it does.
                uint256 exchangeId = _tokenId & type(uint128).max; // ExchangeId is the last 128 bits of the token ID.
                (, BosonTypes.Exchange memory exchange, ) = IBosonExchangeHandler(protocolAddress).getExchange(
                    exchangeId
                );
                offerId = exchange.offerId;
            }

            // Get Boson offer. Don't explicitly check if the offer exists, since existance of the token implies it does.
            (, BosonTypes.Offer memory offer, , , , ) = IBosonOfferHandler(protocolAddress).getOffer(offerId);
            exchangeToken = offer.exchangeToken;

            // If exchange token is 0, it means native token is used. In that case, use WETH.
            if (exchangeToken == address(0)) exchangeToken = wethAddress;
            cachedExchangeToken[_tokenId] = exchangeToken;
        }

        return IERC20(exchangeToken).balanceOf(address(this));
    }

    /**
     * @notice Gets the Boson Voucher token name and adds "Wrapped" prefix.
     *
     * @dev Used only in the constructor.
     *
     * @param _voucherAddress Boson Voucher address
     */
    function getVoucherName(address _voucherAddress) internal view returns (string memory) {
        string memory name = IERC721Metadata(_voucherAddress).name();
        return string.concat("Wrapped ", name);
    }

    /**
     * @notice Gets the the Boson Voucher symbol and adds "W" prefix.
     *
     * @dev Used only in the constructor.
     *
     * @param _voucherAddress Boson Voucher address
     */
    function getVoucherSymbol(address _voucherAddress) internal view returns (string memory) {
        string memory symbol = IERC721Metadata(_voucherAddress).symbol();
        return string.concat("W", symbol);
    }
}
