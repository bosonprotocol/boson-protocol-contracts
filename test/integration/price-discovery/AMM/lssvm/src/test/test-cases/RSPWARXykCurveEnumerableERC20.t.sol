// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import {RouterSinglePoolWithAssetRecipient} from "../base/RouterSinglePoolWithAssetRecipient.sol";
import {UsingXykCurve} from "../mixins/UsingXykCurve.sol";
import {UsingEnumerable} from "../mixins/UsingEnumerable.sol";
import {UsingERC20} from "../mixins/UsingERC20.sol";

contract RSPWARXykCurveEnumerableERC20Test is
    RouterSinglePoolWithAssetRecipient,
    UsingXykCurve,
    UsingEnumerable,
    UsingERC20
{}
