# Debugging Guide for Stoked CLI

This guide helps you debug the Stoked CLI application, especially when working with ESM modules.

## Prerequisites

- Make sure to run `pnpm build` before debugging
- Use the provided VSCode launch configurations

## Debugging Options

### Option 1: Debug using VS Code

1. Open VS Code in your project directory
2. Go to the "Run and Debug" tab (or press Ctrl+Shift+D / Cmd+Shift+D)
3. Select one of the debug configurations:

   - "Debug CLI" to debug the CLI without any arguments
   - "Debug CLI with Command" to debug with the "config repo" command
   - "Debug with Custom Command" to debug with a custom command that you'll be prompted for
   - "Debug Tests" to debug the test suite

4. Set breakpoints in your code by clicking in the gutter next to line numbers
5. Press F5 to start debugging

### Option 2: Debug from the command line

1. Run the debug script:

   ```
   pnpm debug:mjs
   ```

2. For debugging a specific command, pass arguments:

   ```
   pnpm debug:mjs config repo
   ```

3. To use the Chrome DevTools debugger:
   ```
   pnpm debug:cmd config repo
   ```
   Then open Chrome and navigate to `chrome://inspect` and click on "Open dedicated DevTools for Node"

## Troubleshooting

### Source maps not working

If you don't see source maps or if the debugger isn't stopping at breakpoints:

1. Make sure you've built the project recently with `pnpm build`
2. Try cleaning the `dist` directory and rebuilding
3. Check that the debug-helper.mjs script is being used

### ESM Module Errors

If you see errors about "require is not defined in ES module scope":

1. Make sure you're using the `debug-helper.mjs` script for debugging
2. Verify your imports use ESM syntax (import from instead of require())
3. Check that all dependencies properly support ESM modules

### Missing Context in Debugger

If the debugger shows code but not the context you expect:

1. Try setting a breakpoint at a specific line you know should be hit
2. Step through the code using F11 (Step Into) and F10 (Step Over)
3. Use the debug console to evaluate expressions
