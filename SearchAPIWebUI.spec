# -*- mode: python ; coding: utf-8 -*-

'''
PyInstaller spec file for Search API WebUI macOS app.
'''

import os
import re
from pathlib import Path

# Get project paths
project_root = Path(SPECPATH).resolve()


# Read version from pyproject.toml
def get_version():
    '''Extract version from pyproject.toml'''
    pyproject_path = project_root / 'pyproject.toml'
    with open(pyproject_path, 'r', encoding='utf-8') as f:
        content = f.read()
        match = re.search(r'^version\s*=\s*["\']([^"\']+)["\']', content, re.MULTILINE)
        if match:
            return match.group(1)
    raise ValueError(f'Version not found in {pyproject_path}')


APP_VERSION = get_version()
app_module = project_root / 'search_api_webui'
frontend_dist = project_root / 'frontend' / 'dist'

# Check if frontend is built
if not frontend_dist.exists():
    raise FileNotFoundError(
        f'Frontend build not found at {frontend_dist}. '
        'Please build frontend first: cd frontend && npm install && npm run build'
    )

# Collect data files
datas = [
    (str(app_module / 'providers.yaml'), '.'),
    (str(frontend_dist), 'static'),
]

# Hidden imports that PyInstaller might miss
hiddenimports = [
    'flask',
    'flask_cors',
    'requests',
    'yaml',
    'jmespath',
    'webview',
    'search_api_webui.providers',
]

# Analysis
a = Analysis(
    [str(app_module / 'app.py')],
    pathex=[str(project_root)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=None,
    noarchive=False,
)

# PYZ archive
pyz = PYZ(a.pure, a.zipped_data, cipher=None)

# EXE
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='SearchAPIWebUI',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch='x86_64',  # Default to arm64, can be overridden
    codesign_identity=None,
    entitlements_file=None,
    icon=str(project_root / 'frontend' / 'public' / 'AppIcon.ico') if os.name == 'nt' else None,
)

# COLLECT - onedir mode
coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='SearchAPIWebUI',
)

# macOS app bundle
app = BUNDLE(
    coll,
    name='SearchAPIWebUI.app',
    icon=str(project_root / 'frontend' / 'public' / 'AppIcon.icns'),
    bundle_identifier='ai.querit.search-api-webui',
    version=APP_VERSION,
    info_plist={
        'CFBundleShortVersionString': APP_VERSION,
        'CFBundleVersion': APP_VERSION,
        'CFBundleName': 'Search API WebUI',
        'CFBundleDisplayName': 'Search API WebUI',
        'CFBundleExecutable': 'SearchAPIWebUI',
        'CFBundleIdentifier': 'ai.querit.search-api-webui',
        'NSHighResolutionCapable': True,
        'LSMinimumSystemVersion': '10.13.0',
        'NSPrincipalClass': 'NSApplication',
        'NSAppleScriptEnabled': False,
    },
)
