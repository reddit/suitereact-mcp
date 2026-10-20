#!/bin/bash

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log_info() {
  echo -e "${BLUE}info${NC} $1"
}

log_success() {
  echo -e "${GREEN}ok${NC} $1"
}

log_error() {
  echo -e "${RED}fail${NC} $1"
}

log_step() {
  echo -e "\n${CYAN}${BOLD}[$1] $2${NC}"
}

run_command() {
  local cmd="$1"
  local description="$2"

  log_info "$description"
  if ! eval "$cmd"; then
    log_error "Failed: $description"
    log_error "Command: $cmd"
    exit 1
  fi
  log_success "$description"
}

if [ -z "${1:-}" ]; then
  log_error "App name is required"
  echo "Usage: npm run validate:app -- <app-name>"
  exit 1
fi

APP_NAME="$1"

if [ ! -d "apps/$APP_NAME" ]; then
  log_error "App directory does not exist: apps/$APP_NAME"
  exit 1
fi

echo -e "\n${BOLD}SuiteReact App Validation${NC}"
echo -e "${BOLD}=========================\n${NC}"
log_info "App: ${BOLD}$APP_NAME${NC}"

log_step "1/8" "Preparing scoped deploy override"
run_command "node deploy/prepare-app-deploy.js '$APP_NAME' --if-missing" "Ensuring deploy.override exists"

log_step "2/8" "Building SDF artifacts"
run_command "npm run delete:dist" "Cleaning dist"
run_command "npm run build:sdf" "Building SuiteScript and SDF objects"

log_step "3/8" "Building app bundle"
run_command "npm run build:app '$APP_NAME'" "Building app"

log_step "4/8" "Checking production bundle"
run_command "node deploy/check-production-bundle.js '$APP_NAME'" "Rejecting embedded local URLs"

log_step "5/8" "Applying overrides and checking scope"
run_command "node deploy/apply-overrides.js" "Applying deploy/manifest overrides"
run_command "node deploy/check-deploy-scope.js --app '$APP_NAME' --file dist/deploy.xml" "Checking deploy scope"

log_step "6/8" "Adding SuiteCloud dependencies"
run_command "suitecloud project:adddependencies" "Adding project dependencies"
run_command "node deploy/apply-overrides.js" "Re-applying overrides after dependency resolution"
run_command "node deploy/check-deploy-scope.js --app '$APP_NAME' --file dist/deploy.xml" "Re-checking deploy scope"

log_step "7/8" "Validating SuiteCloud project"
run_command "suitecloud project:validate --server --accountspecificvalues WARNING" "Running SuiteCloud validation"

log_step "8/8" "Running dry-run deployment"
run_command "suitecloud project:deploy --accountspecificvalues WARNING --dryrun" "Running deployment dry run"

echo -e "\n${BOLD}Validation complete${NC}"
log_success "$APP_NAME is ready for reviewed deployment"
