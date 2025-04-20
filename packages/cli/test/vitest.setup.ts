import 'reflect-metadata';

// Set up global fetch for tests if not available
try {
  if (!globalThis.fetch) {
    import('node-fetch').then(nodeFetch => {
      globalThis.fetch = nodeFetch.default;
      globalThis.Headers = nodeFetch.Headers;
      globalThis.Request = nodeFetch.Request;
      globalThis.Response = nodeFetch.Response;
    });
  }
} catch (e) {
  console.warn('Could not set up fetch polyfill', e);
}

// Override global Object.defineProperty to handle Symbol conflicts
const originalDefineProperty = Object.defineProperty;
Object.defineProperty = function(obj, prop, descriptor) {
  // Skip if trying to redefine a Symbol related to test matchers
  if (typeof prop === 'symbol' && 
      (prop.toString().includes('$$jest-matchers-object') || 
       prop.toString().includes('$$vitest'))) {
    return obj;
  }
  return originalDefineProperty(obj, prop, descriptor);
};

// Make sure the environment is properly configured for decorators
if (!Reflect || !Reflect.getMetadata) {
  console.warn('Reflect metadata is not properly set up. Decorator metadata might not work correctly.');
} 