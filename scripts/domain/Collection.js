const { stringIsValid, addressIsValid } = require("../util/validations.js");

/**
 * Boson Protocol Domain Entity: Collection
 *
 * See: {BosonTypes.Collection}
 */
class Collection {
  /*
      struct Collection {
        address collectionAddress;
        string externalId;
    }
  */

  constructor(collectionAddress, externalId) {
    this.collectionAddress = collectionAddress;
    this.externalId = externalId;
  }

  /**
   * Get a new Collection instance from a pojo representation
   * @param o
   * @returns {Collection}
   */
  static fromObject(o) {
    const { collectionAddress, externalId } = o;
    return new Collection(collectionAddress, externalId);
  }

  /**
   * Get a new Collection instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    let collectionAddress, externalId;

    // destructure struct
    [collectionAddress, externalId] = struct;

    return Collection.fromObject({
      collectionAddress,
      externalId,
    });
  }

  /**
   * Get a database representation of this Collection instance
   * @returns {object}
   */
  toObject() {
    return JSON.parse(this.toString());
  }

  /**
   * Get a string representation of this Collection instance
   * @returns {string}
   */
  toString() {
    return JSON.stringify(this);
  }

  /**
   * Get a struct representation of this Collection instance
   * @returns {string}
   */
  toStruct() {
    return [this.collectionAddress, this.externalId];
  }

  /**
   * Clone this Collection
   * @returns {Collection}
   */
  clone() {
    return Collection.fromObject(this.toObject());
  }

  /**
   * Is this Collection instance's collectionAddress field valid?
   * Must be a eip55 compliant Ethereum address
   * @returns {boolean}
   */
  collectionAddressIsValid() {
    return addressIsValid(this.collectionAddress);
  }

  /**
   * Is this Collection instance's externalId field valid?
   * Always present, must be a string
   * @returns {boolean}
   */
  externalIdIsValid() {
    return stringIsValid(this.externalId);
  }

  /**
   * Is this Collection instance valid?
   * @returns {boolean}
   */
  isValid() {
    return this.collectionAddressIsValid() && this.externalIdIsValid();
  }
}

/**
 * Boson Protocol Domain Entity: Collection of Collection
 *
 * See: {BosonTypes.Collection}
 */
class CollectionList {
  constructor(collections) {
    this.collections = collections;
  }

  /**
   * Get a new CollectionList instance from a pojo representation
   * @param o
   * @returns {CollectionList}
   */
  static fromObject(o) {
    const { collections } = o;
    return new CollectionList(collections.map((d) => Collection.fromObject(d)));
  }

  /**
   * Get a new CollectionList instance from a returned struct representation
   * @param struct
   * @returns {*}
   */
  static fromStruct(struct) {
    return CollectionList.fromObject({
      collections: struct.map((collections) => Collection.fromStruct(collections)),
    });
  }

  /**
   * Get a database representation of this CollectionList instance
   * @returns {object}
   */
  toObject() {
    return JSON.parse(this.toString());
  }

  /**
   * Get a string representation of this CollectionList instance
   * @returns {string}
   */
  toString() {
    return JSON.stringify(this);
  }

  /**
   * Get a struct representation of this CollectionList instance
   * @returns {string}
   */
  toStruct() {
    return this.collections.map((d) => d.toStruct());
  }

  /**
   * Clone this CollectionList
   * @returns {CollectionList}
   */
  clone() {
    return CollectionList.fromObject(this.toObject());
  }

  /**
   * Is this CollectionList instance's collection field valid?
   * Must be a list of Collection instances
   * @returns {boolean}
   */
  collectionIsValid() {
    let valid = false;
    let { collections } = this;
    try {
      valid =
        Array.isArray(collections) &&
        collections.reduce(
          (previousCollections, currentCollections) => previousCollections && currentCollections.isValid(),
          true
        );
    } catch (e) {}
    return valid;
  }

  /**
   * Is this CollectionList instance valid?
   * @returns {boolean}
   */
  isValid() {
    return this.collectionIsValid();
  }
}

// Export
exports.Collection = Collection;
exports.CollectionList = CollectionList;
