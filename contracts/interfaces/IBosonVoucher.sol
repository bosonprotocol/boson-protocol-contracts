// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/token/ERC1155/IERC1155Upgradeable.sol";
import "../domain/BosonTypes.sol";

/**
 * @title IBosonVoucher
 *
 * @notice This is the interface for the Boson Protocol ERC-1155 Voucher NFT contract.
 *
 * The ERC-165 identifier for this interface is: 0x3ade32fd // TODO: recalc
 */
interface IBosonVoucher is IERC1155Upgradeable {

    function issueVouchers(uint256 _offerId, uint256 _supply, address payable _buyer)
    external;

    function redeemVoucher(uint256 _offerId, address payable _holder)
    external;

}