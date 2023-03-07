// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import {PairAndFactory} from "../base/PairAndFactory.sol";
import {UsingLinearCurve} from "../mixins/UsingLinearCurve.sol";
import {UsingMissingEnumerable} from "../mixins/UsingMissingEnumerable.sol";
import {UsingERC20} from "../mixins/UsingERC20.sol";

contract PAFLinearCurveMissingEnumerableERC20Test is
    PairAndFactory,
    UsingLinearCurve,
    UsingMissingEnumerable,
    UsingERC20
{}
