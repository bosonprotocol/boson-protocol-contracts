// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.9;

import { BosonTypes } from "../../domain/BosonTypes.sol";

/**
 * @title IBosonBundleEvents
 *
 * @notice Defines events related to management of bundles within the protocol.
 */
interface IBosonBundleEvents {
    event BundleCreated(
        uint256 indexed bundleId,
        uint256 indexed sellerId,
        BosonTypes.Bundle bundle,
        address indexed executedBy
    );
}
