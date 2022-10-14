// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.9;

contract MockInitializable {
    bool inited = false;

    modifier initializer() {
        require(!inited, "already inited");
        _;
        inited = true;
    }
}
