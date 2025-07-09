// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.9;
pragma experimental ABIEncoderV2;

import { IERC721, IERC165 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Counters } from "@openzeppelin/contracts/utils/Counters.sol";

interface IWETH {
    function deposit() external payable;

    function withdraw(uint256 wad) external;

    function transfer(address to, uint256 value) external returns (bool);
}

/**
 * @title An open auction house, enabling collectors and curators to run their own auctions
 * @dev This is an inspired by zora's AuctionHouse contract https://github.com/ourzora/auction-house/blob/01c4e8085c6815bf3233057dee8e628aca07813f/contracts/AuctionHouse.sol
 * But stripped down and only for test purposes
 */
contract MockAuction {
    using SafeERC20 for IERC20;

    event AuctionCanceled();

    struct Auction {
        // ID for the ERC721 token
        uint256 tokenId;
        // Address for the ERC721 contract
        address tokenContract;
        // The current highest bid amount
        uint256 amount;
        // The address that should receive the funds once the NFT is sold.
        address tokenOwner;
        // The address of the current highest bid
        address bidder;
        // The address of the ERC-20 currency to run the auction with.
        // If set to 0x0, the auction will be run in ETH
        address auctionCurrency;
        address curator;
    }

    address public immutable wethAddress;

    // A mapping of all of the auctions currently running.
    mapping(uint256 => Auction) public auctions;

    uint256 public auctionIdCounter;

    /*
     * Constructor
     */
    constructor(address _weth) {
        wethAddress = _weth;
    }

    /**
     * @notice Create an auction.
     * @dev Store the auction details in the auctions mapping
     */
    function createAuction(uint256 tokenId, address tokenContract, address auctionCurrency, address curator) external {
        address tokenOwner = IERC721(tokenContract).ownerOf(tokenId);
        require(
            msg.sender == IERC721(tokenContract).getApproved(tokenId) || msg.sender == tokenOwner,
            "Caller must be approved or owner for token id"
        );
        uint256 auctionId = auctionIdCounter++;

        Auction storage auction = auctions[auctionId];
        auction.tokenId = tokenId;
        auction.tokenContract = tokenContract;
        auction.amount = 0;
        auction.tokenOwner = tokenOwner;
        auction.bidder = address(0);
        auction.auctionCurrency = auctionCurrency;
        auction.curator = curator;

        IERC721(tokenContract).transferFrom(tokenOwner, address(this), tokenId);
    }

    /**
     * @notice Create a bid on a token, with a given amount.
     * @dev If provided a valid bid, transfers the provided amount to this contract.
     * If the auction is run in native ETH, the ETH is wrapped so it can be identically to other
     * auction currencies in this contract.
     */
    function createBid(uint256 auctionId, uint256 amount) external payable {
        address lastBidder = auctions[auctionId].bidder;

        require(
            amount > auctions[auctionId].amount,
            "Must send more than last bid by minBidIncrementPercentage amount"
        );

        // If it's not, then we should refund the last bidder
        if (lastBidder != address(0)) {
            _handleOutgoingBid(lastBidder, auctions[auctionId].amount, auctions[auctionId].auctionCurrency);
        }

        _handleIncomingBid(amount, auctions[auctionId].auctionCurrency);

        auctions[auctionId].amount = amount;
        auctions[auctionId].bidder = msg.sender;
    }

    /**
     * @notice End an auction paying out the respective parties.
     * @dev If for some reason the auction cannot be finalized (invalid token recipient, for example),
     * The auction reverts.
     */
    function endAuction(uint256 auctionId) external {
        uint256 tokenOwnerProfit = auctions[auctionId].amount;

        // Otherwise, transfer the token to the winner and pay out the participants below
        try
            IERC721(auctions[auctionId].tokenContract).safeTransferFrom(
                address(this),
                auctions[auctionId].bidder,
                auctions[auctionId].tokenId
            )
        {} catch (bytes memory reason) {
            if (reason.length == 0) {
                revert("Voucher transfer failed");
            } else {
                /// @solidity memory-safe-assembly
                assembly {
                    revert(add(32, reason), mload(reason))
                }
            }
        }
        _handleOutgoingBid(auctions[auctionId].tokenOwner, tokenOwnerProfit, auctions[auctionId].auctionCurrency);

        delete auctions[auctionId];
    }

    /**
     * @notice Cancel an auction.
     * @dev Transfers the NFT back to the auction creator and emits an AuctionCanceled event
     */
    function cancelAuction(uint256 auctionId) external {
        require(
            auctions[auctionId].tokenOwner == msg.sender || auctions[auctionId].curator == msg.sender,
            "Can only be called by auction creator or curator"
        );
        _cancelAuction(auctionId);
    }

    /**
     * @dev Given an amount and a currency, transfer the currency to this contract.
     * If the currency is ETH (0x0), attempt to wrap the amount as WETH
     */
    function _handleIncomingBid(uint256 amount, address currency) internal {
        // If this is an ETH bid, ensure they sent enough and convert it to WETH under the hood
        if (currency == address(0)) {
            require(msg.value == amount, "Sent ETH Value does not match specified bid amount");
            IWETH(wethAddress).deposit{ value: amount }();
        } else {
            // We must check the balance that was actually transferred to the auction,
            // as some tokens impose a transfer fee and would not actually transfer the
            // full amount to the market, resulting in potentally locked funds
            IERC20 token = IERC20(currency);
            uint256 beforeBalance = token.balanceOf(address(this));
            token.safeTransferFrom(msg.sender, address(this), amount);
            uint256 afterBalance = token.balanceOf(address(this));
            require(beforeBalance + amount == afterBalance, "Token transfer call did not transfer expected amount");
        }
    }

    function _handleOutgoingBid(address to, uint256 amount, address currency) internal {
        // If the auction is in ETH, unwrap it from its underlying WETH and try to send it to the recipient.
        if (currency == address(0)) {
            IWETH(wethAddress).withdraw(amount);

            // If the ETH transfer fails (sigh), rewrap the ETH and try send it as WETH.
            if (!_safeTransferETH(to, amount)) {
                IWETH(wethAddress).deposit{ value: amount }();
                IERC20(wethAddress).safeTransfer(to, amount);
            }
        } else {
            IERC20(currency).safeTransfer(to, amount);
        }
    }

    function _safeTransferETH(address to, uint256 value) internal returns (bool) {
        (bool success, ) = to.call{ value: value }(new bytes(0));
        return success;
    }

    function _cancelAuction(uint256 auctionId) internal {
        address tokenOwner = auctions[auctionId].tokenOwner;
        IERC721(auctions[auctionId].tokenContract).safeTransferFrom(
            address(this),
            tokenOwner,
            auctions[auctionId].tokenId
        );

        emit AuctionCanceled();
        delete auctions[auctionId];
    }

    receive() external payable {}

    fallback() external payable {}
}
