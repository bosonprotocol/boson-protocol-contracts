// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.22;

import "@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol";

/**
 * @title Foreign1155
 *
 * @notice Mock ERC-(1155/2981) NFT for Unit Testing
 */
contract Foreign1155 is ERC1155Upgradeable {
    /**
     * Mint a Sample NFT
     * @param _tokenId - the token ID to mint an amount of
     * @param _supply - the number of tokens to mint
     */
    function mint(uint256 _tokenId, uint256 _supply) public {
        _mint(msg.sender, _tokenId, _supply, "");
    }

    /**
     * Deletes the contract code
     */
    function destruct() public {
        selfdestruct(payable(msg.sender));
    }
}

/*
 * @title Foreign1155 that consumes all gas when transfer is called
 *
 * @notice Mock ERC-(1155) for Unit Testing
 */
contract Foreign1155GasTheft is Foreign1155 {
    function safeTransferFrom(address, address, uint256, uint256, bytes memory) public virtual override {
        while (true) {
            // consume all gas
        }
    }
}

/*
 * @title Foreign1155 that returns an absurdly long return data
 *
 * @notice Mock ERC-(1155) for Unit Testing
 */
contract Foreign1155ReturnBomb is Foreign1155 {
    function safeTransferFrom(address, address, uint256, uint256, bytes memory) public virtual override {
        assembly {
            revert(0, 3000000)
        }
        // This is carefully chosen. If it's too low, not enough gas is consumed and contract that call it does not run out of gas.
        // If it's too high, then this contract runs out of gas before the return data is returned.
    }
}

/*
 * @title Foreign1155 that succeeds, but the data cannot be decoded into a boolean
 *
 * @notice Mock ERC-(1155) for Unit Testing
 */
contract Foreign1155MalformedReturn is Foreign1155 {
    enum AttackType {
        ReturnTooShort,
        ReturnTooLong,
        ReturnInvalid
    }

    AttackType public attackType;

    function setAttackType(AttackType _attackType) external {
        attackType = _attackType;
    }

    function safeTransferFrom(address, address, uint256, uint256, bytes memory) public virtual override {
        if (attackType == AttackType.ReturnTooShort) {
            assembly {
                return(0, 31) // return too short data
            }
        } else if (attackType == AttackType.ReturnTooLong) {
            assembly {
                return(0, 33) // return too long data
            }
        } else if (attackType == AttackType.ReturnInvalid) {
            assembly {
                return(0x40, 32) // return a value that is not 0 or 1
            }
        }
    }
}
