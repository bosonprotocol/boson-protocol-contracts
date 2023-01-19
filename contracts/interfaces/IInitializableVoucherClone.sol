// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

import "../domain/BosonTypes.sol";

interface IInitializableVoucherClone {
    function initialize(address _beaconAddress) external;

    function initializeVoucher(
        uint256 _sellerId,
        address _newOwner,
        BosonTypes.VoucherInitValues calldata _voucherInitValues
    ) external;
}
