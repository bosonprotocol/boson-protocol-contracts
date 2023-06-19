// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.18;

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
