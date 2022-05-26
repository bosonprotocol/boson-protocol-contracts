/**
 * Boson Protocol Domain Enum: TokenType
 */
class TokenType {}

TokenType.FungibleToken = 0;
TokenType.NonFungibleToken = 1;
TokenType.MultiToken = 2;

TokenType.Types = [TokenType.FungibleToken, TokenType.NonFungibleToken, TokenType.MultiToken];

// Export
module.exports = TokenType;
