/**
 * Boson Protocol Domain Enum: AuthTokenType
 */
class AuthTokenType {}

AuthTokenType.None = 0;
AuthTokenType.Custom = 1;
AuthTokenType.Lens = 2;
AuthTokenType.ENS = 3;

AuthTokenType.Types = [AuthTokenType.None, AuthTokenType.Custom, AuthTokenType.Lens, AuthTokenType.ENS];

// Export
module.exports = AuthTokenType;
