export PATH="$HOME/ffmpeg/bin:$PATH"
export PATH="$HOME/AppData/Local/pnpm:$PATH"

# NVM configuration
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion

# VS Code shell integration
[[ "$TERM_PROGRAM" == "vscode" ]] && . "$(code --locate-shell-integration-path bash)"

# Set PNPM_HOME if not already set by .bash_profile
if [ -z "$PNPM_HOME" ]; then
  export PNPM_HOME="$HOME/AppData/Local/pnpm"
  export PATH="$PNPM_HOME:$PATH"
fi

# Alias for common commands
alias ll='ls -la'
alias gs='git status' 