#!/bin/bash

# Colors for better output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
    echo -e "${GREEN}✅${NC} $1"
}

log_error() {
    echo -e "${RED}❌${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}⚠️${NC} $1"
}

log_step() {
    echo -e "\n${CYAN}${BOLD}[$1] $2${NC}"
}

# Check if app name is provided
if [ -z "$1" ]; then
    log_error "App name is required"
    echo "Usage: npm run validate <app-name>"
    echo "Example: npm run validate demo-app"
    exit 1
fi

APP_NAME=$1

echo -e "\n${BOLD}🔍 SuiteReact Validation Process${NC}"
echo -e "${BOLD}=================================\n${NC}"

log_info "Validating app: ${BOLD}$APP_NAME${NC}"

# Function to run command with error checking
run_command() {
    local cmd="$1"
    local description="$2"
    
    log_info "$description"
    if ! eval "$cmd"; then
        log_error "Failed: $description"
        log_error "Command: $cmd"
        exit 1
    fi
    log_success "$description completed"
}

# Step 1: Run the full build process
log_step "1/4" "Building application"
run_command "npm run build $APP_NAME" "Running full build process for app: $APP_NAME"

# Step 2: Add project dependencies
log_step "2/4" "Adding project dependencies"
run_command "suitecloud project:adddependencies" "Adding SuiteCloud project dependencies"

# Step 3: Validate the project
log_step "3/4" "Validating project structure"
run_command "suitecloud project:validate --server --accountspecificvalues WARNING" "Running SuiteCloud project validation"

# Step 4: Dry run deployment
log_step "4/4" "Testing deployment (dry run)"
run_command "suitecloud project:deploy --accountspecificvalues WARNING --dryrun" "Running deployment dry run"

echo -e "\n${BOLD}🎉 Validation Complete!${NC}"
echo -e "${BOLD}=====================\n${NC}"
log_success "All validation steps passed for app: ${BOLD}$APP_NAME${NC}"
log_success "Project is ready for deployment"