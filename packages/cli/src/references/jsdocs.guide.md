# **JSDoc Guide**

## **1. Basics of JSDoc**

JSDoc is a documentation standard for JavaScript. It uses comment blocks to describe functions, classes, modules, and more.

```javascript
/**
 * Brief description of the function.
 *
 * @param {string} name - The user's name.
 * @param {number} age - The user's age.
 * @returns {string} A greeting message.
 */
function greet(name, age) {
  return `Hello, ${name}. You are ${age} years old.`;
}
```

---

## **2. JSDoc Tags and Examples**

### **2.1 Function Documentation**

```javascript
/**
 * Calculates the sum of two numbers.
 *
 * @param {number} a - First number.
 * @param {number} b - Second number.
 * @returns {number} Sum of a and b.
 */
function add(a, b) {
  return a + b;
}
```

### **2.2 Class and Constructor**

```javascript
/**
 * Represents a User.
 *
 * @class
 */
class User {
  /**
   * Creates a new user.
   *
   * @constructor
   * @param {string} id - User ID.
   * @param {string} name - User name.
   */
  constructor(id, name) {
    /** @private @type {string} */
    this._id = id;
    
    /** @public @type {string} */
    this.name = name;
  }

  /**
   * Gets the user ID.
   * @returns {string} User ID.
   */
  getId() {
    return this._id;
  }
}
```

### **2.3 Modules**

```javascript
/**
 * Utility functions for math operations.
 * @module MathUtils
 */

/**
 * Multiplies two numbers.
 *
 * @param {number} a - First number.
 * @param {number} b - Second number.
 * @returns {number} Product of a and b.
 */
export function multiply(a, b) {
  return a * b;
}
```

### **2.4 Typedefs (Custom Data Structures)**

```javascript
/**
 * User profile information.
 * @typedef {Object} UserProfile
 * @property {string} id - User ID.
 * @property {string} name - User name.
 * @property {number} age - User age.
 */

/**
 * Gets user profile details.
 * @returns {UserProfile} User profile object.
 */
function getUserProfile() {
  return { id: "123", name: "Alice", age: 30 };
}
```

### **2.5 Enums**

```javascript
/**
 * User roles in the system.
 * @readonly
 * @enum {string}
 */
const UserRole = {
  ADMIN: "admin",
  USER: "user",
  GUEST: "guest",
};
```

### **2.6 Callbacks**

```javascript
/**
 * Callback for data processing.
 * @callback DataCallback
 * @param {Error|null} error - Error object, if any.
 * @param {string} result - Processed result.
 */

/**
 * Processes data asynchronously.
 *
 * @param {string} input - Data to process.
 * @param {DataCallback} callback - Callback function.
 */
function processData(input, callback) {
  if (!input) {
    callback(new Error("Invalid input"), null);
    return;
  }
  callback(null, `Processed: ${input}`);
}
```

### **2.7 Async Functions**

```javascript
/**
 * Fetches data from an API.
 *
 * @async
 * @function
 * @param {string} url - API endpoint.
 * @returns {Promise<Object>} JSON response.
 * @throws {Error} If request fails.
 */
async function fetchData(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Network error");
  return response.json();
}
```

### **2.8 Events**

```javascript
/**
 * Event triggered when a user logs in.
 * @event User#login
 * @type {object}
 * @property {string} userId - The ID of the logged-in user.
 */

/**
 * Logs in a user and emits an event.
 * @fires User#login
 */
function loginUser() {
  const userId = "123";
  document.dispatchEvent(new CustomEvent("login", { detail: { userId } }));
}
```

### **2.9 Namespaces**

```javascript
/**
 * Logger utilities.
 * @namespace Logger
 */
const Logger = {
  /**
   * Logs an info message.
   * @param {string} message - Message to log.
   */
  info(message) {
    console.log(`INFO: ${message}`);
  },

  /**
   * Logs an error message.
   * @param {string} message - Error message.
   */
  error(message) {
    console.error(`ERROR: ${message}`);
  },
};
```

### **2.10 Examples**

```javascript
/**
 * @example
 * // Creating a new user
 * const user = new User("123", "John Doe");
 * console.log(user.getId());
 *
 * @example
 * // Fetching data asynchronously
 * fetchData("https://api.example.com/data")
 *   .then(data => console.log(data))
 *   .catch(error => console.error(error));
 */
```

---

## **3. Best Practices**

✅ **Use meaningful descriptions.**\
✅ **Document all function parameters and return values.**\
✅ **Include error handling (**``**).**\
✅ **Provide example usage (**``**).**\
✅ **Use proper types (**``**, **``**).**\
✅ **Keep comments concise but informative.**

---

This guide **covers all major JSDoc features** while maintaining clarity and completeness. Let me know if you need specific modifications! 🚀

