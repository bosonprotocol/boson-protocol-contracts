const hre = require("hardhat");
const ethers = hre.ethers;
const { expect } = require("chai");
const { Collection, CollectionList } = require("../../scripts/domain/Collection");

/**
 *  Test the Collection domain entity
 */
describe("Collection", function () {
  // Suite-wide scope
  let accounts, collection, object, promoted, clone, dehydrated, rehydrated, key, value, struct;
  let collectionAddress, externalId;

  beforeEach(async function () {
    // Get a list of accounts
    accounts = await ethers.getSigners();
    collectionAddress = accounts[1].address;

    // Required constructor params
    externalId = "Brand1";
  });

  context("📋 Constructor", async function () {
    it("Should allow creation of valid, fully populated Collection instance", async function () {
      // Create valid collection
      collection = new Collection(collectionAddress, externalId);
      expect(collection.collectionAddressIsValid()).is.true;
      expect(collection.externalIdIsValid()).is.true;
      expect(collection.isValid()).is.true;
    });
  });

  context("📋 Field validations", async function () {
    beforeEach(async function () {
      // Create valid collection, then set fields in tests directly
      collection = new Collection(collectionAddress, externalId);
      expect(collection.isValid()).is.true;
    });

    it("Always present, collectionAddress must be a string representation of an EIP-55 compliant address", async function () {
      // Invalid field value
      collection.collectionAddress = "0xASFADF";
      expect(collection.collectionAddressIsValid()).is.false;
      expect(collection.isValid()).is.false;

      // Invalid field value
      collection.collectionAddress = "zedzdeadbaby";
      expect(collection.collectionAddressIsValid()).is.false;
      expect(collection.isValid()).is.false;

      // Valid field value
      collection.collectionAddress = accounts[0].address;
      expect(collection.collectionAddressIsValid()).is.true;
      expect(collection.isValid()).is.true;

      // Valid field value
      collection.collectionAddress = "0xec2fd5bd6fc7b576dae82c0b9640969d8de501a2";
      expect(collection.collectionAddressIsValid()).is.true;
      expect(collection.isValid()).is.true;
    });

    it("Always present, externalId must be a string", async function () {
      // Invalid field value
      collection.externalId = 12;
      expect(collection.externalIdIsValid()).is.false;
      expect(collection.isValid()).is.false;

      // Valid field value
      collection.externalId = "zedzdeadbaby";
      expect(collection.externalIdIsValid()).is.true;
      expect(collection.isValid()).is.true;

      // Valid field value
      collection.externalId = "QmYXc12ov6F2MZVZwPs5XeCBbf61cW3wKRk8h3D5NTYj4T";
      expect(collection.externalIdIsValid()).is.true;
      expect(collection.isValid()).is.true;

      // Valid field value
      collection.externalId = "";
      expect(collection.externalIdIsValid()).is.true;
      expect(collection.isValid()).is.true;
    });
  });

  context("📋 Utility functions", async function () {
    beforeEach(async function () {
      // Create valid collection, then set fields in tests directly
      collection = new Collection(collectionAddress, externalId);

      expect(collection.isValid()).is.true;

      // Get plain object
      object = {
        collectionAddress,
        externalId,
      };

      // Struct representation
      struct = [collectionAddress, externalId];
    });

    context("👉 Static", async function () {
      it("Collection.fromObject() should return a Collection instance with the same values as the given plain object", async function () {
        // Promote to instance
        promoted = Collection.fromObject(object);

        // Is a Collection instance
        expect(promoted instanceof Collection).is.true;

        // Key values all match
        for ([key, value] of Object.entries(collection)) {
          expect(JSON.stringify(promoted[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("Collection.fromStruct() should return a Collection instance from a struct representation", async function () {
        // Get an instance from the struct
        collection = Collection.fromStruct(struct);

        // Ensure it is valid
        expect(collection.isValid()).to.be.true;
      });
    });

    context("👉 Instance", async function () {
      it("instance.toString() should return a JSON string representation of the Collection instance", async function () {
        dehydrated = collection.toString();
        rehydrated = JSON.parse(dehydrated);

        for ([key, value] of Object.entries(collection)) {
          expect(JSON.stringify(rehydrated[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.toObject() should return a plain object representation of the Collection instance", async function () {
        // Get plain object
        object = collection.toObject();

        // Not a Collection instance
        expect(object instanceof Collection).is.false;

        // Key values all match
        for ([key, value] of Object.entries(collection)) {
          expect(JSON.stringify(object[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("Collection.toStruct() should return a struct representation of the Collection instance", async function () {
        // Get struct from collection
        struct = collection.toStruct();

        // Marshal back to a collection instance
        collection = Collection.fromStruct(struct);

        // Ensure it marshals back to a valid collection
        expect(collection.isValid()).to.be.true;
      });

      it("instance.clone() should return another Collection instance with the same property values", async function () {
        // Get plain object
        clone = collection.clone();

        // Is a Collection instance
        expect(clone instanceof Collection).is.true;

        // Key values all match
        for ([key, value] of Object.entries(collection)) {
          expect(JSON.stringify(clone[key]) === JSON.stringify(value)).is.true;
        }
      });
    });
  });
});

describe("CollectionList", function () {
  // Suite-wide scope
  let accounts, collections, collectionList, object, promoted, clone, dehydrated, rehydrated, key, value, struct;

  beforeEach(async function () {
    // Get a list of accounts
    accounts = await ethers.getSigners();

    // Required constructor params
    collections = [
      new Collection(accounts[1].address, "MockToken1", "100"),
      new Collection(accounts[2].address, "MockToken2", "200"),
      new Collection(accounts[3].address, "MockToken3", "300"),
    ];
  });

  context("📋 Constructor", async function () {
    it("Should allow creation of valid, fully populated CollectionList instance", async function () {
      // Create valid CollectionList
      collectionList = new CollectionList(collections);
      expect(collectionList.collectionIsValid()).is.true;
      expect(collectionList.isValid()).is.true;
    });
  });

  context("📋 Field validations", async function () {
    beforeEach(async function () {
      // Create valid CollectionList, then set fields in tests directly
      collectionList = new CollectionList(collections);
      expect(collectionList.isValid()).is.true;
    });

    it("Always present, collections must be an array of valid Collection instances", async function () {
      // Invalid field value
      collectionList.collections = "0xASFADF";
      expect(collectionList.isValid()).is.false;

      // Invalid field value
      collectionList.collection = collections[0];
      expect(collectionList.isValid()).is.false;

      // Invalid field value
      collectionList.collections = ["0xASFADF", "zedzdeadbaby"];
      expect(collectionList.isValid()).is.false;

      // Invalid field value
      collectionList.collections = undefined;
      expect(collectionList.isValid()).is.false;

      // Invalid field value
      collectionList.collections = [...collections, "zedzdeadbaby"];
      expect(collectionList.isValid()).is.false;

      // Invalid field value
      collectionList.collections = [new Collection("111", "mockToken", "100")];
      expect(collectionList.isValid()).is.false;

      // Valid field value
      collectionList.collections = [...collections];
      expect(collectionList.isValid()).is.true;
    });
  });

  context("📋 Utility functions", async function () {
    beforeEach(async function () {
      // Create valid CollectionList, then set fields in tests directly
      collectionList = new CollectionList(collections);
      expect(collectionList.isValid()).is.true;

      // Get plain object
      object = {
        collections,
      };

      // Struct representation
      struct = collections.map((d) => d.toStruct());
    });

    context("👉 Static", async function () {
      it("CollectionList.fromObject() should return a CollectionList instance with the same values as the given plain object", async function () {
        // Promote to instance
        promoted = CollectionList.fromObject(object);

        // Is a CollectionList instance
        expect(promoted instanceof CollectionList).is.true;

        // Key values all match
        for ([key, value] of Object.entries(collectionList)) {
          expect(JSON.stringify(promoted[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("CollectionList.fromStruct() should return a CollectionList instance from a struct representation", async function () {
        // Get an instance from the struct
        collectionList = CollectionList.fromStruct(struct);

        // Ensure it is valid
        expect(collectionList.isValid()).to.be.true;
      });
    });

    context("👉 Instance", async function () {
      it("instance.toString() should return a JSON string representation of the CollectionList instance", async function () {
        dehydrated = collectionList.toString();
        rehydrated = JSON.parse(dehydrated);

        for ([key, value] of Object.entries(collectionList)) {
          expect(JSON.stringify(rehydrated[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("instance.toObject() should return a plain object representation of the CollectionList instance", async function () {
        // Get plain object
        object = collectionList.toObject();

        // Not a CollectionList instance
        expect(object instanceof CollectionList).is.false;

        // Key values all match
        for ([key, value] of Object.entries(collectionList)) {
          expect(JSON.stringify(object[key]) === JSON.stringify(value)).is.true;
        }
      });

      it("CollectionList.toStruct() should return a struct representation of the CollectionList instance", async function () {
        // Get struct from CollectionList
        struct = collectionList.toStruct();

        // Marshal back to a CollectionList instance
        collectionList = CollectionList.fromStruct(struct);

        // Ensure it marshals back to a valid CollectionList
        expect(collectionList.isValid()).to.be.true;
      });

      it("instance.clone() should return another CollectionList instance with the same property values", async function () {
        // Get plain object
        clone = collectionList.clone();

        // Is a CollectionList instance
        expect(clone instanceof CollectionList).is.true;

        // Key values all match
        for ([key, value] of Object.entries(collectionList)) {
          expect(JSON.stringify(clone[key]) === JSON.stringify(value)).is.true;
        }
      });
    });
  });
});
