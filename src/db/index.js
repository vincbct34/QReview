/**
 * Database abstraction layer.
 * Selects the right adapter based on NODE_ENV.
 */
let adapter;

if (process.env.NODE_ENV === "production") {
  adapter = require("./postgres");
} else {
  adapter = require("./sqlite");
}

module.exports = adapter;
