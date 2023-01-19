// SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";

/**
 * @title MockNFTAuth721
 *
 * @notice Mock ERC-(721) NFT that represents NFT Auth tokens
 */
contract MockNFTAuth721 is ERC721EnumerableUpgradeable {
    string public constant TOKEN_NAME = "MockNFTAuth721";
    string public constant TOKEN_SYMBOL = "721NFTAuth";

    /**
     * Mint a Sample NFT to a specified address
     * @param _to - address to which token with specified id is minted
     * @param _tokenId - the first token ID to mint
     */
    function mint(address _to, uint256 _tokenId) external {
        _mint(_to, _tokenId);
    }
}
