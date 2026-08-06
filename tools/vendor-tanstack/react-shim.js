// Resolve to the React global vendored by index.html (vendor/react.production.min.js).
module.exports = (typeof window !== 'undefined' ? window.React : globalThis.React);
