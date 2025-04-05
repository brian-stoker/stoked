#!/bin/bash

# Source bash_profile which will in turn source bashrc
if [ -f ~/.bash_profile ]; then
   source ~/.bash_profile
fi

# Output current environment
echo "Environment initialized for Git Bash in Cursor"
echo "PNPM_HOME: $PNPM_HOME"
echo "PATH: $PATH"

# Run the command passed to this script
if [ $# -eq 0 ]; then
  # If no arguments provided, just start a shell
  exec bash
else
  # Execute the arguments
  exec "$@"
fi 