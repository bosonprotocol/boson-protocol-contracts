const { expect } = require("chai");
const AuthToken = require("../../scripts/domain/AuthToken");
const AuthTokenType = require("../../scripts/domain/AuthTokenType");

/**
 *  Test the AuthToken domain entity
 */
describe("AuthToken", function () {
  // Suite-wide scope
  let authToken, object, promoted, clone, dehydrated, rehydrated, key, value, struct;
  let tokenId, tokenType;

  context("📋 Constructor", async function () {
    beforeEach(async function () {
      // Required constructor params
      tokenId = "1";
      tokenType = AuthTokenType.Lens;
    });

    it("Should allow creation of valid, fully populated AuthToken instance", async function () {
      // Create a valid auth token
      authToken = new AuthToken(tokenId, tokenType);
      expect(authToken.tokenIdIsValid()).is.true;
      expect(authToken.tokenTypeIsValid()).is.true;
      expect(authToken.isValid()).is.true;
    });
  });

  context("📋 Field validations", async function () {
    beforeEach(async function () {
      // Required constructor params
      tokenId = "1";
      tokenType = AuthTokenType.ENS;

      // Create a valid auth token, then set fields in tests directly
      authToken = new AuthToken(tokenId, tokenType);
      expect(authToken.isValid()).is.true;
    });

    it("Always present, tokenId must be the string representation of a BigNumber", async function () {
      // Invalid field value
      authToken.tokenId = "zedzdeadbaby";
      expect(authToken.tokenIdIsValid()).is.false;
      expect(authToken.isValid()).is.false;

      // Invalid field value
      authToken.tokenId = new Date();
      expect(authToken.tokenIdIsValid()).is.false;
      expect(authToken.isValid()).is.false;

      // Valid field value
      authToken.tokenId = "0";
      expect(authToken.tokenIdIsValid()).is.true;
      expect(authToken.isValid()).is.true;

      // Valid field value
      authToken.tokenId = "126";
      expect(authToken.tokenIdIsValid()).is.true;
      expect(authToken.isValid()).is.true;
    });

    it("Always present, tokenType must be the string representation of a BigNumber", async function () {
      // Invalid field value
      authToken.tokenType = "zedzdeadbaby";
      expect(authToken.tokenTypeIsValid()).is.false;
      expect(authToken.isValid()).is.false;

      // Invalid field value
      authToken.tokenType = "0";
      expect(authToken.tokenTypeIsValid()).is.false;
      expect(authToken.isValid()).is.false;

      // Invalid field value
      authToken.tokenType = "126";
      expect(authToken.tokenTypeIsValid()).is.false;
      expect(authToken.isValid()).is.false;

      // Invalid field value
      authToken.tokenType = new Date();
      expect(authToken.tokenTypeIsValid()).is.false;
      expect(authToken.isValid()).is.false;

      // Valid field value
      authToken.tokenType = AuthTokenType.None;
      expect(authToken.tokenTypeIsValid()).is.true;
      expect(authToken.isValid()).is.true;

      // Valid field value
      authToken.tokenType = AuthTokenType.Custom;
      expect(authToken.tokenTypeIsValid()).is.true;
      expect(authToken.isValid()).is.true;

      // Valid field value
      authToken.tokenType = AuthTokenType.Lens;
      expect(authToken.tokenTypeIsValid()).is.true;
      expect(authToken.isValid()).is.true;

      // Valid field value
      authToken.tokenType = AuthTokenType.ENS;
      expect(authToken.tokenTypeIsValid()).is.true;
      expect(authToken.isValid()).is.true;
    });
  });

  context("📋 Utility functions", async function () {
    beforeEach(async function () {
      // Required constructor params
      tokenId = "1";
      tokenType = AuthTokenType.ENS;

      // Create a valid auth token, then set fields in tests directly
      authToken = new AuthToken(tokenId, tokenType);
      expect(authToken.isValid()).is.true;

      // Get plain object
      object = {
        tokenId,
        tokenType,
      };

      // Struct representation
      struct = [tokenId, tokenType];
    });

    context("👉 Static", async function () {
      it("AuthToken.fromObject() should return an AuthToken instance with the same values as the given plain object", async function () {
        // Promote to instance
        promoted = AuthToken.fromObject(object);

        // Is an AuthToken instance
        expect(promoted instanceof AuthToken).is.true;

        // Key values all match
        for ([key, value] of Object.entries(authToken)) {
          expect(JSON.stringify(promoted[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("AuthToken.fromStruct() should return an AuthToken instance from a struct representation", async function () {
        // Get authToken from struct
        authToken = AuthToken.fromStruct(struct);

        // Ensure it marshals back to a valid authToken
        expect(authToken.isValid()).to.be.true;
      });
    });

    context("👉 Instance", async function () {
      it("instance.toString() should return a JSON string representation of the AuthToken instance", async function () {
        dehydrated = authToken.toString();
        rehydrated = JSON.parse(dehydrated);

        for ([key, value] of Object.entries(authToken)) {
          expect(JSON.stringify(rehydrated[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.toObject() should return a plain object representation of the AuthToken instance", async function () {
        // Get plain object
        object = authToken.toObject();

        // Not an AuthToken instance
        expect(object instanceof AuthToken).is.false;

        // Key values all match
        for ([key, value] of Object.entries(authToken)) {
          expect(JSON.stringify(object[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.toStruct() should return a struct representation of the AuthToken instance", async function () {
        // Get struct from authToken
        struct = authToken.toStruct();

        // Marshal back to an AuthToken instance
        authToken = AuthToken.fromStruct(struct);

        // Ensure it marshals back to a valid authToken
        expect(authToken.isValid()).to.be.true;
      });

      it("instance.clone() should return another AuthToken instance with the same property values", async function () {
        // Get plain object
        clone = authToken.clone();

        // Is an AuthToken instance
        expect(clone instanceof AuthToken).is.true;

        // Key values all match
        for ([key, value] of Object.entries(authToken)) {
          expect(JSON.stringify(clone[key]) === JSON.stringify(value)).is.true;
        }
      });
    });
  });
});
