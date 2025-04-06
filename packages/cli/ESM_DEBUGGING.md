# ESM Debugging Guide for Stoked CLI

This guide addresses the specific challenges of debugging an ESM (ECMAScript Modules) TypeScript project, focusing on the Stoked CLI application.

## Understanding the Issue

When working with ESM modules, there are several challenges that can affect debugging:

1. **Native ESM support** - Node.js handles ESM differently from CommonJS modules
2. **Source maps** - TypeScript source maps need special handling with ESM
3. **`require()` vs `import`** - ESM only supports `import` syntax
4. **File extensions** - ESM requires explicit file extensions (.js, .mjs)

## Best Solution: Using simple-debug.mjs

We've created a specialized ESM debug helper (`simple-debug.mjs`) that provides the most reliable debugging experience:

1. It's a minimal script that doesn't interfere with console or stdout
2. It properly loads ESM modules and CLI arguments
3. It preserves all command output
4. It works reliably with the VS Code debugger

### How to Use simple-debug.mjs

From the command line:
```bash
# Run without debugger
pnpm debug:simple:no-inspect config repo -h

# Run with node debugger
pnpm debug:simple config repo -h
```

In VS Code, use the "Debug CLI (Simple)" or "Debug CLI with Command (Simple)" launch configurations.

## Alternative Solution: Using debug-helper.mjs

For more verbose debugging with log prefixes, you can use the `debug-helper.mjs` script:

1. Properly loads ESM modules
2. Enables source maps support
3. Setting up global error handlers
4. Managing command-line arguments
5. Adds debugging prefixes to console output

## How to Debug the CLI

### Option 1: Using VS Code Launch Configurations

We've set up several VS Code launch configurations:

1. **Debug CLI (Simple)**: Launches with the simple debug helper (recommended)
2. **Debug CLI with Command (Simple)**: Launches with a specific command using the simple debug helper
3. **Debug CLI**: Launches with the more verbose debug helper
4. **Debug CLI with Command**: Launches with a specific command using the verbose debug helper
5. **Debug with Custom Command**: Prompts you for a custom command to debug

To use these:
1. Open VS Code in the project directory
2. Set breakpoints in your TypeScript files
3. Go to the "Run and Debug" tab (Ctrl+Shift+D / Cmd+Shift+D)
4. Select the desired configuration
5. Press F5 to start debugging

The configurations will automatically build the project before debugging.

### Option 2: Debugging from the Command Line

You can also debug directly from the command line:

```bash
# Using the simple debug helper (RECOMMENDED)
pnpm debug:simple config repo -h

# Using Node's built-in debugger with verbose helper
pnpm debug:mjs config repo -h
```

Then open Chrome and navigate to `chrome://inspect`, click "Open dedicated DevTools for Node"

## Breakpoints and Stepping Through Code

While debugging:

1. Use F9 to toggle breakpoints
2. F5 to continue execution
3. F10 to step over
4. F11 to step into
5. Shift+F11 to step out

## Troubleshooting

### If Source Maps Aren't Working

1. Make sure the project is built: `pnpm build`
2. Verify source maps are enabled in the tsconfig files
3. Check that the path in the source map files is correct

### If Debugger Doesn't Stop at Breakpoints

1. Try setting breakpoints in the main command handlers (e.g., in the `run` method)
2. Verify the CLI is hitting the code path with your breakpoints
3. Check the debug console for any errors

### If You Get "require is not defined" Errors

1. Make sure all imports use ESM syntax: `import x from 'y'` instead of `require('y')`
2. Check that packages you're using support ESM
3. Use one of our specialized debug helpers instead of directly launching TypeScript files

### If You Don't See Command Output

1. Use the `simple-debug.mjs` script which doesn't modify the console
2. Make sure you're not using a script that redirects or intercepts stdout
3. Run the command without the debugger attached first to verify it works normally

## Examining State

While debugging, you can:

1. Hover over variables to see their values
2. Use the Debug Console to evaluate expressions
3. Check the Variables panel to inspect scope
4. Add watch expressions for important variables

## Advanced: Debugging Specific Commands

For debugging specific CLI commands:

1. Identify the command handler class
2. Set breakpoints in the `run()` method
3. Use the "Debug with Custom Command" configuration
4. Enter the command you want to debug when prompted

## Additional Notes for ESM Debugging

- Always use `.js` extensions in import statements even for TypeScript files
- The CLI uses ES modules exclusively, not CommonJS
- Source maps should be configured in both tsconfig.json and tsconfig.node.json 