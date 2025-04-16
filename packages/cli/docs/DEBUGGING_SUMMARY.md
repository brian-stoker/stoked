# Debugging the Stoked CLI

This guide provides a quick reference for debugging the Stoked CLI application.

## Quick Start for Debugging

### 1. Using VS Code (Recommended)

1. First build the project:
   ```
   pnpm build
   ```

2. Set breakpoints in your TypeScript files

3. Open VS Code's Run and Debug panel (Ctrl+Shift+D / Cmd+Shift+D)

4. Choose "Debug CLI with Command (Simple)" from the dropdown

5. Press F5 to start debugging

### 2. From the Command Line

Run with Node.js debugger:
```bash
pnpm debug:simple config repo -h
```

Then connect with Chrome DevTools by opening `chrome://inspect` in Chrome.

## Main Debugging Scripts

| Script | Purpose | Usage |
|--------|---------|-------|
| `debug:simple` | Best for general debugging | `pnpm debug:simple <command>` |
| `debug:simple:no-inspect` | Running without debugger | `pnpm debug:simple:no-inspect <command>` |
| `debug:mjs` | More verbose logging | `pnpm debug:mjs <command>` |

## VS Code Launch Configurations

| Configuration | Purpose |
|---------------|---------|
| Debug CLI (Simple) | Debug with no arguments (simple version) |
| Debug CLI with Command (Simple) | Debug with "config repo" command (simple version) |
| Debug with Custom Command | Enter custom command to debug |

## Troubleshooting

### No command output visible
- Use the simple debug script (`debug:simple`)
- Don't use scripts that override console methods

### Source maps not working
- Ensure project is built: `pnpm build`
- Check sourcemap settings in tsconfig.node.json
- Verify the correct debug script is used

### Breakpoints not hitting
- Set breakpoints in command handlers (`run` method)
- Check console for errors
- Use "Step Into" (F11) to navigate through code

## Key Files

- `/src/simple-debug.mjs` - Main debugging entry point
- `/src/debug-helper.mjs` - Alternative with verbose logging
- `/.vscode/launch.json` - VS Code debug configurations 