/**
 * @fileoverview A comprehensive JSDoc reference for documenting JavaScript code.
 * @module ExampleModule
 */

/**
 * Represents a generic user.
 * @class
 */
class User {
    /**
     * Creates a new user.
     * @constructor
     * @param {string} id - The unique identifier for the user.
     * @param {string} name - The full name of the user.
     * @param {number} age - The age of the user.
     */
    constructor(id, name, age) {
      /** @private @type {string} */
      this._id = id;
      
      /** @public @type {string} */
      this.name = name;
      
      /** @public @type {number} */
      this.age = age;
    }
  
    /**
     * Gets the user's ID.
     * @returns {string} The user ID.
     */
    getId() {
      return this._id;
    }
  
    /**
     * Sets a new name for the user.
     * @param {string} newName - The new name.
     */
    setName(newName) {
      this.name = newName;
    }
  }
  
  /**
   * Enum for user roles.
   * @readonly
   * @enum {string}
   */
  const UserRole = {
    ADMIN: "admin",
    USER: "user",
    GUEST: "guest",
  };
  
  /**
   * Represents a utility class for user operations.
   * @class
   * @static
   */
  class UserUtils {
    /**
     * Checks if the user is an adult.
     * @param {User} user - The user object.
     * @returns {boolean} True if the user is 18 or older, false otherwise.
     */
    static isAdult(user) {
      return user.age >= 18;
    }
  }
  
  /**
   * Callback function used for asynchronous operations.
   * @callback AsyncCallback
   * @param {Error|null} error - The error object, if any.
   * @param {any} result - The result of the operation.
   */
  
  /**
   * Retrieves a user from the database.
   * @async
   * @function
   * @param {string} userId - The ID of the user.
   * @returns {Promise<User>} A promise that resolves to the user object.
   * @throws {Error} Throws an error if the user is not found.
   */
  async function getUserById(userId) {
    return new User(userId, "John Doe", 30);
  }
  
  /**
   * Registers a new user.
   * @function
   * @param {Object} userData - The user data.
   * @param {string} userData.name - The user's name.
   * @param {number} userData.age - The user's age.
   * @param {AsyncCallback} callback - The callback function.
   */
  function registerUser(userData, callback) {
    if (!userData.name || !userData.age) {
      callback(new Error("Invalid user data"), null);
      return;
    }
    callback(null, new User("1234", userData.name, userData.age));
  }
  
  /**
   * Event triggered when a new user is created.
   * @event module:ExampleModule~userCreated
   * @type {object}
   * @property {string} id - The ID of the created user.
   * @property {string} name - The name of the user.
   */
  
  /**
   * Logs a message with different severity levels.
   * @namespace Logger
   */
  const Logger = {
    /**
     * Logs an info message.
     * @param {string} message - The message to log.
     */
    info(message) {
      console.log(`INFO: ${message}`);
    },
  
    /**
     * Logs a warning message.
     * @param {string} message - The warning message.
     */
    warn(message) {
      console.warn(`WARN: ${message}`);
    },
  
    /**
     * Logs an error message.
     * @param {string} message - The error message.
     */
    error(message) {
      console.error(`ERROR: ${message}`);
    },
  };
  
  /**
   * @typedef {Object} Address
   * @property {string} street - The street name.
   * @property {string} city - The city name.
   * @property {string} zip - The zip code.
   */
  
  /**
   * @typedef {Object} UserProfile
   * @property {User} user - The user object.
   * @property {Address} address - The user's address.
   */
  
  /**
   * Fetches user profile details.
   * @async
   * @function
   * @param {string} userId - The user ID.
   * @returns {Promise<UserProfile>} The user profile details.
   */
  async function getUserProfile(userId) {
    return {
      user: new User(userId, "Alice", 25),
      address: { street: "123 Main St", city: "Springfield", zip: "12345" },
    };
  }
  
  /**
   * Performs a search for users.
   * @function
   * @param {string} query - The search query.
   * @param {number} [limit=10] - The maximum number of results.
   * @returns {Array<User>} An array of users matching the query.
   */
  function searchUsers(query, limit = 10) {
    return [new User("1", "Alice", 25), new User("2", "Bob", 30)];
  }
  
  /**
   * @example
   * // Creating a new user
   * const user = new User("123", "John Doe", 30);
   * console.log(user.getId());
   * 
   * @example
   * // Checking if a user is an adult
   * if (UserUtils.isAdult(user)) {
   *   console.log("User is an adult.");
   * }
   * 
   * @example
   * // Fetching a user asynchronously
   * getUserById("123").then(user => console.log(user.name));
   */
  
  export { User, UserRole, UserUtils, getUserById, registerUser, Logger, getUserProfile, searchUsers };