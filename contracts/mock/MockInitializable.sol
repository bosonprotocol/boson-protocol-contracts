// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

contract MockInitializable {
    bool private inited = false;

    modifier initializer() {
        require(!inited, "already inited");
        _;
        inited = true;
    }
}
