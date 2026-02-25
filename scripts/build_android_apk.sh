#!/bin/bash

set -e  # Exit on error

# Get script directory and project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# Configuration
FRONTEND_DIR="${PROJECT_ROOT}/frontend"
BUILDOZER_SPEC="${PROJECT_ROOT}/buildozer.spec"
BUILDOZER_SPEC_BACKUP="${PROJECT_ROOT}/buildozer.spec.bak"
PYPROJECT_TOML="${PROJECT_ROOT}/pyproject.toml"

# Build mode: debug or release
BUILD_MODE="${1:-debug}"  # debug or release
if [[ "$BUILD_MODE" != "debug" && "$BUILD_MODE" != "release" ]]; then
    echo "Error: Invalid build mode: $BUILD_MODE (use debug or release)"
    exit 1
fi

# Print section header
print_section() {
    echo -e "\n=== $1 ==="
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Cleanup temporary files and restore backup
cleanup() {
    # Restore backup if exists
    if [ -f "$BUILDOZER_SPEC_BACKUP" ]; then
        echo "Restoring original buildozer.spec from backup..."
        mv "$BUILDOZER_SPEC_BACKUP" "$BUILDOZER_SPEC"
    fi
}

# Set trap to cleanup on exit
trap cleanup EXIT

# Check dependencies
check_dependencies() {
    print_section "Checking Dependencies"

    local missing_deps=()

    if ! command_exists buildozer; then
        missing_deps+=("buildozer")
    fi

    if ! command_exists npm; then
        missing_deps+=("npm")
    fi

    if [ ${#missing_deps[@]} -ne 0 ]; then
        echo "Error: Missing required dependencies:"
        for dep in "${missing_deps[@]}"; do
            echo "  - $dep"
        done
        exit 1
    fi

    # Check if buildozer is develop version
    echo "Checking buildozer version..."
    BUILDOZER_VERSION=$(pip show buildozer 2>/dev/null | grep -E "^Version:" | awk '{print $2}')

    if [[ "$BUILDOZER_VERSION" == *"dev"* ]]; then
        echo "Buildozer is develop version: $BUILDOZER_VERSION"
    else
        echo "Buildozer version: $BUILDOZER_VERSION (not develop)"
        echo "Installing develop version from GitHub..."
        pip install git+https://github.com/kivy/buildozer.git
        echo "Buildozer updated to develop version"
    fi

    echo "All dependencies found"
}

# Extract version from pyproject.toml
get_version() {
    print_section "Getting Version from pyproject.toml"

    if [ ! -f "$PYPROJECT_TOML" ]; then
        echo "Error: pyproject.toml not found at $PYPROJECT_TOML"
        exit 1
    fi

    VERSION=$(grep -E '^version = ' "$PYPROJECT_TOML" | cut -d '"' -f 2)

    if [ -z "$VERSION" ]; then
        echo "Error: Could not extract version from pyproject.toml"
        exit 1
    fi

    echo "Version found: $VERSION"
}

# Prepare buildozer.spec with version substituted
prepare_buildozer_spec() {
    print_section "Preparing buildozer.spec with Version"

    # Backup original buildozer.spec before modification
    cp "$BUILDOZER_SPEC" "$BUILDOZER_SPEC_BACKUP"
    echo "Backup created: $BUILDOZER_SPEC_BACKUP"

    # Replace __VERSION__ placeholder with actual version (modify in-place)
    sed "s/__VERSION__/$VERSION/g" "$BUILDOZER_SPEC_BACKUP" > "$BUILDOZER_SPEC"

    # For release builds, add signing configuration
    if [ "$BUILD_MODE" = "release" ] && [ -n "$ANDROID_KEYSTORE_PATH" ]; then
        echo "Adding release signing configuration to buildozer.spec"

        # Verify keystore file exists
        if [ ! -f "$ANDROID_KEYSTORE_PATH" ]; then
            echo "Error: Keystore file not found at: $ANDROID_KEYSTORE_PATH"
            exit 1
        fi

        echo -e "Keystore verified: $ANDROID_KEYSTORE_PATH\nKeystore alias: $ANDROID_KEY_ALIAS"

        # Append release signing configuration
        # Using android.* prefix with correct parameter names
        cat >> "$BUILDOZER_SPEC" << EOF

# Release signing configuration (added by build script)
android.release_artifact = apk
android.accept_sdk_license = True

# Android release signing
android.sign = 1
android.keystore = $ANDROID_KEYSTORE_PATH
android.keyalias = $ANDROID_KEY_ALIAS
android.keystorepw = $ANDROID_KEYSTORE_PASSWORD
android.keyaliaspw = $ANDROID_KEY_PASSWORD
EOF

        echo "Release signing configuration added to buildozer.spec"
    fi

    # Verify the substitution
    BUILDOZER_VERSION=$(grep -E '^version = ' "$BUILDOZER_SPEC" | awk '{print $3}')

    if [ "$BUILDOZER_VERSION" = "__VERSION__" ]; then
        echo "Error: Version placeholder was not replaced"
        exit 1
    fi

    echo "buildozer.spec updated with version: $BUILDOZER_VERSION"
}

# Build frontend
build_frontend() {
    print_section "Building Frontend"

    if [ ! -d "$FRONTEND_DIR" ]; then
        echo "Error: Frontend directory not found at $FRONTEND_DIR"
        exit 1
    fi

    cd "$FRONTEND_DIR"

    # Install npm dependencies if needed
    if [ ! -d "node_modules" ]; then
        echo "Installing npm dependencies..."
        npm ci
    fi

    # Build frontend
    echo "Building frontend assets..."
    npm run build

    if [ ! -d "dist" ]; then
        echo "Error: Frontend build failed - dist directory not found"
        exit 1
    fi

    cd "$PROJECT_ROOT"
    echo "Frontend built successfully"
}

# Check keystore for release builds
check_keystore() {
    if [ "$BUILD_MODE" = "release" ]; then
        print_section "Checking Keystore"

        # Support both local keystore file and environment variable path
        if [ -n "$ANDROID_KEYSTORE_PATH" ]; then
            # GitHub Actions: use keystore from environment variable
            keystore_file="$ANDROID_KEYSTORE_PATH"
            echo "Using keystore from ANDROID_KEYSTORE_PATH: $keystore_file"
        else
            # Local build: use default keystore file
            keystore_file="${PROJECT_ROOT}/search-api-webui.keystore"
            echo "Using local keystore: $keystore_file"
        fi

        if [ ! -f "$keystore_file" ]; then
            echo -e "Error: Keystore file not found: $keystore_file\nFor local builds: create search-api-webui.keystore\nFor GitHub builds: ensure ANDROID_KEYSTORE_BASE64 secret is set"
            exit 1
        fi

        echo "Keystore found at: $keystore_file"
    fi
}

# Build APK with buildozer
build_apk() {
    print_section "Building Android APK ($BUILD_MODE)"

    # Export P4A_RELEASE_* environment variables for release builds
    if [ "$BUILD_MODE" = "release" ] && [ -n "$ANDROID_KEYSTORE_PATH" ]; then
        echo "Exporting P4A_RELEASE_* environment variables..."
        export P4A_RELEASE_KEYSTORE="$ANDROID_KEYSTORE_PATH"
        export P4A_RELEASE_KEYALIAS="$ANDROID_KEY_ALIAS"
        export P4A_RELEASE_KEYSTORE_PASSWD="$ANDROID_KEYSTORE_PASSWORD"
        export P4A_RELEASE_KEYALIAS_PASSWD="$ANDROID_KEY_PASSWORD"

        echo "P4A release environment variables set"
        echo -e "P4A_RELEASE_KEYSTORE: $P4A_RELEASE_KEYSTORE\nP4A_RELEASE_KEYALIAS: $ANDROID_KEY_ALIAS"
    fi

    # Build command
    local build_success=0
    if [ "$BUILD_MODE" = "release" ]; then
        echo "Building release APK with signing..."
        if buildozer -v android release; then
            build_success=1
        fi
    else
        echo "Building debug APK..."
        if buildozer -v android debug; then
            build_success=1
        fi
    fi

    if [ $build_success -eq 0 ]; then
        echo "Error: Buildozer command failed"
        exit 1
    fi

    # Check if APK was created
    if [ ! -d "bin" ] || [ -z "$(ls -A bin/*.apk 2>/dev/null)" ]; then
        echo "Error: APK build failed - no APK found in bin/"
        exit 1
    fi

    echo "APK built successfully"
}

# Main build process
main() {
    echo "Search API WebUI - Android APK Builder"
    echo -e "Build mode: $BUILD_MODE\n"

    check_dependencies
    get_version
    prepare_buildozer_spec
    build_frontend
    check_keystore
    build_apk

    echo -e "\nBuild Complete!\nYour APK is ready at:"
    ls -lh bin/*.apk
}

# Run main
main
