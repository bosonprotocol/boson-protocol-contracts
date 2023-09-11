// SPDX-License-Identifier: MIT
pragma solidity 0.8.21;

import "../domain/BosonTypes.sol";

interface IInitializableVoucherClone {
    /**
     * @notice Initializes the contract with the address of the beacon contract.
     *
     * @param _beaconAddress - Address of the beacon contract.
     */
    function initialize(address _beaconAddress) external;

    /**
     * @notice Initializes a voucher with the given parameters.
     *
     * @param _sellerId - The ID of the seller.
     * @param _collectionIndex - The index of the collection.
     * @param _newOwner - The address of the new owner.
     * @param _voucherInitValues - The voucher initialization values.
     */
    function initializeVoucher(
        uint256 _sellerId,
        uint256 _collectionIndex,
        address _newOwner,
        BosonTypes.VoucherInitValues calldata _voucherInitValues
    ) external;
}
