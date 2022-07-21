/**
 * Boson Protocol Domain Enum: AuthTokenType
 */
class AuthTokenType {}

AuthTokenType.None = 0;
AuthTokenType.Lens = 1;
AuthTokenType.ENS = 2;

AuthTokenType.Types = [AuthTokenType.None, AuthTokenType.Threshold, AuthTokenType.SpecificToken];

// Export
module.exports = AuthTokenType;
