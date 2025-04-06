// This file helps with NestJS compatibility in ESM environments

// Allow synchronous dynamic import
export async function __importDefault(mod) {
  const imported = await import(mod);
  return imported.default || imported;
}

// Create a helper for module imports
export async function importModule(modulePath) {
  try {
    return await import(modulePath);
  } catch (err) {
    console.error(`Error importing module ${modulePath}:`, err);
    throw err;
  }
} 