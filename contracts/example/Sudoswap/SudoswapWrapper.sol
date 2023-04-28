// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.9;

import { IBosonOfferHandler } from "../../interfaces/handlers/IBosonOfferHandler.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { DAIAliases as DAI } from "../../interfaces/DAIAliases.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { BosonTypes } from "../../domain/BosonTypes.sol";
import { SafeERC20 } from "../../ext_libs/SafeERC20.sol";
import { IERC20 } from "../../interfaces/IERC20.sol";
import { ERC721 } from "./../support/ERC721.sol";
import { IERC721Metadata } from "./../support/IERC721Metadata.sol";
import { IERC165 } from "../../interfaces/IERC165.sol";
import { LSSVMPairFactory } from "@sudoswap/LSSVMPairFactory.sol";

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

    // Token ID for which the price is not yet known
    uint256 private pendingTokenId;

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
        //_setApprovalForAll(address(this), msg.sender, true); // msg.sender is the owner of this contract and must be approved to transfer wrapped vouchers to pool pair
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
     * @notice Wraps the voucher, transfer true voucher to itself and funds to the protocol.
     *
     * Reverts if:
     *  - caller is not the contract owner
     *
     * @param _tokenId The token id.
     */
    function wrap(uint256 _tokenId) external onlyOwner {
        // Transfer voucher to this contract
        // Instead of msg.sender it could be voucherAddress, if vouchers were preminted to contract itself
        IERC721(voucherAddress).transferFrom(msg.sender, address(this), _tokenId);

        // Mint to itself, so it can be used with Sudoswap
        _mint(address(this), _tokenId);

        // Approves contract owner to operate on wrapped token
        _approve(owner(), _tokenId);
    }

    /**
     * @notice Unwraps the voucher, transfer true voucher to owner and funds to the protocol.
     *
     * Reverts if:
     *  - wrapped voucher is not owned by the seller and the caller is not the protocol
     *  - wrapped voucher is owned by the seller and the caller is not the owner of this contract or protcol
     *
     * @param _tokenId The token id.
     */
    function unwrap(uint256 _tokenId) external {
        address wrappedVoucherOwner = ownerOf(_tokenId);

        // Either contract owner or protocol can unwrap
        // If contract owner is unwrapping, this is equivalent to canceled auction
        require(
            msg.sender == protocolAddress || (owner() == msg.sender && wrappedVoucherOwner == msg.sender),
            "SudoswapWrapper: Only owner or protocol can unwrap"
        );

        // If some token price is not know yet, update it now
        if (pendingTokenId != 0) updatePendingTokenPrice(pendingTokenId);

        uint256 priceToPay = price[_tokenId];

        // Delete price and pendingTokenId to prevent reentrancy
        delete price[_tokenId];
        delete pendingTokenId;

        // transfer voucher to voucher owner
        IERC721(voucherAddress).safeTransferFrom(address(this), ownerOf(_tokenId), _tokenId);

        // Transfer token to protocol
        if (priceToPay > 0) {
            // No need to handle native separately, since Sudoswap always sends WETH
            IERC20(cachedExchangeToken[_tokenId]).safeTransfer(protocolAddress, priceToPay);
        }

        delete cachedExchangeToken[_tokenId]; // gas refund

        // Burn wrapped voucher
        _burn(_tokenId);
    }

    /** @notice Make a call to an external contract.
     *
     * Reverts if:
     * - tokenIds array is empty
     * - call to Sudoswap depositNFTs fails
     *
     * @param _tokenIds - array of wrapper token ids
     */
    function depositNFTs(address pool, uint256[] memory _tokenIds) external payable onlyOwner {
        require(_tokenIds.length > 0, "SudoswapWrapper: No token ids provided");
        //        require(_to != address(0), "SudoswapWrapper: Address zero not allowed");
        //
        //        // Prevent invocation of functions that would allow transfer of tokens from this contract
        //        bytes4 selector = bytes4(_data[:4]);
        //        require(
        //            selector != IERC20.transfer.selector &&
        //                selector != IERC20.approve.selector &&
        //                selector != IERC20.transferFrom.selector &&
        //                selector != DAI.push.selector &&
        //                selector != DAI.move.selector,
        //            "SudoswapWrapper: Function not allowed"
        //        );
        //
        //        _to.functionCallWithValue(_data, msg.value, "SudoswapWrapper: External call failed");
        poolAddress = pool;
        LSSVMPairFactory(payable(factoryAddress)).depositNFTs(IERC721(address(this)), _tokenIds, pool);
    }

    /**
     * @notice Handle transfers out of Sudoswap.
     *
     * @param _from The address of the sender.
     * @param _to The address of the recipient.
     * @param _tokenId The token id.
     */
    function _beforeTokenTransfer(
        address _from,
        address _to,
        uint256 _tokenId
    ) internal virtual override(ERC721) {
        if (_from == poolAddress && _to != address(this)) {
            // Someone is making a swap and wrapped voucher is being transferred to buyer
            // @TODO: check this If recipient is address(this), it means the seller is withdrawing and price updating can be skipped

            // If some token price is not know yet, update it now
            if (pendingTokenId != 0) updatePendingTokenPrice(pendingTokenId);

            // Store current balance and set the pending token id
            price[pendingTokenId] = getCurrentBalance(_tokenId);
            pendingTokenId = _tokenId;
        }

        super._beforeTokenTransfer(_from, _to, _tokenId);
    }

    function updatePendingTokenPrice(uint256 _tokenId) internal {
        price[pendingTokenId] = getCurrentBalance(_tokenId) - price[pendingTokenId];
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
        // TODO: use string concat when solidity version is upgraded
        string memory name = IERC721Metadata(_voucherAddress).name();
        return string(abi.encodePacked("Wrapped ", name));
    }

    /**
     * @notice Gets the the Boson Voucher symbol and adds "W" prefix.
     *
     * @dev Used only in the constructor.
     *
     * @param _voucherAddress Boson Voucher address
     */
    function getVoucherSymbol(address _voucherAddress) internal view returns (string memory) {
        // TODO: use string concat when solidity version is upgraded
        string memory symbol = IERC721Metadata(_voucherAddress).symbol();
        return string(abi.encodePacked("W", symbol));
    }
}
