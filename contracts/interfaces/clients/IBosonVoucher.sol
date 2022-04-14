// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import {IERC721Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import {BosonTypes} from "../../domain/BosonTypes.sol";

/**
 * @title IBosonVoucher
 *
 * @notice This is the interface for the Boson Protocol ERC-721 Voucher NFT contract.
 *
 * The ERC-165 identifier for this interface is: 0x8a75c03e
 */
interface IBosonVoucher is IERC721Upgradeable {
    function issueVoucher(uint256 _exchangeId, BosonTypes.Buyer calldata _buyer) external;

    function redeemVoucher(uint256 _exchangeId, address payable _holder) external;
}
