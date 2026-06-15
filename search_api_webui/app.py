# Copyright (c) 2026 QUERIT PRIVATE LIMITED
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to
# deal in the Software without restriction, including without limitation the
# rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
# sell copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in
# all copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
# THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
# FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
# DEALINGS IN THE SOFTWARE.

import json
import logging
import os
import platform
import queue
import socket
import sys
import threading
import time
import webbrowser
from datetime import datetime
from pathlib import Path

from flask import Flask, Response, jsonify, request, send_from_directory
from flask_cors import CORS

from search_api_webui.providers import load_custom_providers, load_providers

try:
    import webview
    WEBVIEW_AVAILABLE = True
except ImportError:
    WEBVIEW_AVAILABLE = False


# Check if running in Android APK environment
# ANDROID_ARGUMENT is set by python-for-android (p4a) build system
# when packaging the app using buildozer. It indicates the app is
# running in an Android APK environment.
IN_ANDROID_APP = (
    'ANDROID_ARGUMENT' in os.environ
)

# Conditional import of Android modules at module level
if IN_ANDROID_APP:
    try:
        from android.runnable import run_on_ui_thread
        from jnius import autoclass

        Activity = autoclass('org.kivy.android.PythonActivity')
        Intent = autoclass('android.content.Intent')
        Uri = autoclass('android.net.Uri')
    except ImportError as e:
        logging.error(f'Failed to import Android modules: {e}', exc_info=True)
        IN_ANDROID_APP = False
        run_on_ui_thread = None
        Activity = None
        Intent = None
        Uri = None
else:
    # Mock objects for non-Android environments
    run_on_ui_thread = None
    Activity = None
    Intent = None
    Uri = None


# Auto-enable webview mode when running as packaged executable
# This replaces the need for a separate PyInstaller runtime hook
if (
    getattr(sys, 'frozen', False)
    and platform.system() in ('Windows', 'Darwin')
    and '-w' not in sys.argv
    and '--webview' not in sys.argv
):
    sys.argv.append('-w')


# Configure logging based on Flask debug mode or environment variable
log_level = logging.DEBUG if os.getenv('FLASK_DEBUG') or os.getenv('FLASK_ENV') == 'development' else logging.INFO
logging.basicConfig(
    level=log_level,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
)
logger = logging.getLogger(__name__)


def get_resource_path(relative_path):
    '''Get absolute path to resource, works for dev and for PyInstaller.'''
    try:
        # PyInstaller creates a temp folder and stores path in _MEIPASS
        base_path = Path(sys._MEIPASS)
    except Exception:
        base_path = Path(__file__).resolve().parent

    return base_path / relative_path


CURRENT_DIR = Path(__file__).resolve().parent

# Handle static folder for both dev and packaged app
if hasattr(sys, '_MEIPASS'):
    # Running in PyInstaller bundle
    STATIC_FOLDER = Path(sys._MEIPASS) / 'static'
else:
    # Running in development
    STATIC_FOLDER = CURRENT_DIR / 'static'
    if not STATIC_FOLDER.exists():
        DEV_FRONTEND_DIST = CURRENT_DIR.parent / 'frontend' / 'dist'
        if DEV_FRONTEND_DIST.exists():
            STATIC_FOLDER = DEV_FRONTEND_DIST

app = Flask(__name__, static_folder=str(STATIC_FOLDER))
CORS(app)

# Use get_resource_path for providers.yaml
PROVIDERS_YAML = get_resource_path('providers.yaml')
USER_CONFIG_DIR = Path.home() / '.search-api-webui'
USER_CONFIG_JSON = USER_CONFIG_DIR / 'config.json'
SEARCH_HISTORY_JSON = USER_CONFIG_DIR / 'search_history.json'

if not USER_CONFIG_DIR.exists():
    USER_CONFIG_DIR.mkdir(parents=True, exist_ok=True)


def get_stored_config():
    if not USER_CONFIG_JSON.exists():
        return {}
    try:
        with open(USER_CONFIG_JSON, encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        logger.error(f'Error reading config: {e}')
        return {}


def save_stored_config(config_dict):
    try:
        with open(USER_CONFIG_JSON, 'w', encoding='utf-8') as f:
            json.dump(config_dict, f, indent=2)
    except Exception as e:
        logger.error(f'Error saving config: {e}')


if PROVIDERS_YAML.exists():
    provider_map = load_providers(str(PROVIDERS_YAML))
else:
    logger.error(f'Configuration file not found at {PROVIDERS_YAML}')
    provider_map = {}

BUILTIN_PROVIDER_NAMES = set(provider_map.keys())

# Load custom providers from user config at startup
_initial_config = get_stored_config()
_initial_custom = _initial_config.get('custom_providers', {})
if _initial_custom:
    provider_map.update(load_custom_providers(_initial_custom))


def reload_custom_providers():
    '''Reload custom providers from config.json into the global provider_map.'''
    stored_config = get_stored_config()
    custom_defs = stored_config.get('custom_providers', {})

    # Remove stale custom providers (those in provider_map but not built-in and not in current custom defs)
    stale = [name for name in provider_map if name not in BUILTIN_PROVIDER_NAMES and name not in custom_defs]
    for name in stale:
        del provider_map[name]

    # Add/update custom providers
    new_providers = load_custom_providers(custom_defs)
    provider_map.update(new_providers)


# Maximum number of search history to store
MAX_SEARCH_HISTORY_SIZE = 1000


def get_search_history():
    if not SEARCH_HISTORY_JSON.exists():
        return []
    try:
        with open(SEARCH_HISTORY_JSON, encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        logger.error(f'Error reading search history: {e}')
        return []


def add_search_history(query, advanced=False, extra_json=None):
    if not query or not query.strip():
        return

    query = query.strip()
    history = get_search_history()

    # Remove if already exists (to move it to front)
    history = [item for item in history if item.get('query') != query]

    # Build new history entry
    new_entry = {'query': query, 'timestamp': datetime.now().isoformat()}
    if advanced:
        new_entry['advanced'] = True
        new_entry['extra_json'] = extra_json or {}

    # Add to front with timestamp
    history.insert(0, new_entry)

    # Keep only MAX_SEARCH_HISTORY_SIZE items
    if len(history) > MAX_SEARCH_HISTORY_SIZE:
        history = history[:MAX_SEARCH_HISTORY_SIZE]

    try:
        with open(SEARCH_HISTORY_JSON, 'w', encoding='utf-8') as f:
            json.dump(history, f, indent=2)
    except Exception as e:
        logger.error(f'Error saving search history: {e}')


def save_search_history(history_list):
    try:
        with open(SEARCH_HISTORY_JSON, 'w', encoding='utf-8') as f:
            json.dump(history_list, f, indent=2)
    except Exception as e:
        logger.error(f'Error saving search history: {e}')


@app.route('/api/providers', methods=['GET'])
def get_providers_list():
    stored_config = get_stored_config()
    providers_info = []

    for name, provider_instance in provider_map.items():
        config_details = provider_instance.config

        user_conf = stored_config.get(name, {})

        if isinstance(user_conf, str):
            user_conf = {'api_key': user_conf}

        has_key = bool(user_conf.get('api_key'))

        providers_info.append(
            {
                'name': name,
                'has_key': has_key,
                'is_custom': name not in BUILTIN_PROVIDER_NAMES,
                'api_key_url': config_details.get('api_key_url', ''),
                'details': config_details,
                'user_settings': {
                    'api_url': user_conf.get('api_url', ''),
                    'limit': user_conf.get('limit', '10'),
                    'use_proxy': user_conf.get('use_proxy', False),
                    'proxy_url': user_conf.get('proxy_url', ''),
                    'skip_warmup': user_conf.get('skip_warmup', False),
                    'querit_version': user_conf.get('querit_version', 'abroad'),
                },
            },
        )
    return jsonify(providers_info)


@app.route('/api/search-history', methods=['GET'])
def get_search_history_api():
    prefix = request.args.get('prefix', '').strip().lower()
    history = get_search_history()

    # Filter by prefix if provided
    if prefix:
        history = [item for item in history if item.get('query', '').lower().startswith(prefix)]

    # Return query with optional advanced flag, newest first, max 10 items
    result = []
    for item in history[:10]:
        entry = {'query': item.get('query', '')}
        if item.get('advanced'):
            entry['advanced'] = True
            entry['extra_json'] = item.get('extra_json', {})
        result.append(entry)
    return jsonify(result)


@app.route('/api/search-history', methods=['POST'])
def add_search_history_api():
    data = request.json
    query = data.get('query', '')

    if query is None:
        # Clear all history
        save_search_history([])
    elif query.strip():
        # Add new query (with optional advanced search metadata)
        advanced = data.get('advanced', False)
        extra_json = data.get('extra_json', {})
        add_search_history(query.strip(), advanced=advanced, extra_json=extra_json)

    return jsonify({'success': True})


@app.route('/api/config', methods=['POST'])
def update_config():
    data = request.json
    provider_name = data.get('provider')

    if not provider_name:
        return jsonify({'error': 'Provider name is required'}), 400

    api_key = data.get('api_key')

    api_url = data.get('api_url', '').strip()
    limit = data.get('limit', '10')
    use_proxy = data.get('use_proxy', False)
    proxy_url = data.get('proxy_url', '').strip()
    skip_warmup = data.get('skip_warmup', False)
    querit_version = data.get('querit_version')

    all_config = get_stored_config()

    if provider_name in all_config and isinstance(all_config[provider_name], str):
        all_config[provider_name] = {'api_key': all_config[provider_name]}

    # Initialize provider config if not exists
    if provider_name not in all_config:
        all_config[provider_name] = {}

    # Update advanced settings, skip empty values
    if api_url:
        all_config[provider_name]['api_url'] = api_url
    elif 'api_url' in all_config[provider_name]:
        del all_config[provider_name]['api_url']

    if limit:
        all_config[provider_name]['limit'] = limit
    elif 'limit' in all_config[provider_name]:
        del all_config[provider_name]['limit']

    # Save proxy settings
    if use_proxy:
        all_config[provider_name]['use_proxy'] = True
        if proxy_url:
            all_config[provider_name]['proxy_url'] = proxy_url
    else:
        if 'use_proxy' in all_config[provider_name]:
            del all_config[provider_name]['use_proxy']
        if 'proxy_url' in all_config[provider_name]:
            del all_config[provider_name]['proxy_url']


    # Save querit version
    if provider_name == 'querit' and querit_version:
        all_config[provider_name]['querit_version'] = querit_version
    # Save warmup settings
    if skip_warmup:
        all_config[provider_name]['skip_warmup'] = True
    elif 'skip_warmup' in all_config[provider_name]:
        del all_config[provider_name]['skip_warmup']

    # Only update api_key if explicitly provided
    if api_key is not None:
        all_config[provider_name]['api_key'] = api_key

    # Clean up empty provider config
    if not all_config[provider_name]:
        del all_config[provider_name]

    save_stored_config(all_config)
    return jsonify({'status': 'success'})


def _validate_custom_provider_name(name):
    '''Validate a custom provider name. Returns an error string or None.'''
    import re

    if not name or not name.strip():
        return 'Provider name is required'
    name = name.strip()
    if len(name) > 64:
        return 'Provider name must be 64 characters or less'
    if not re.match(r'^[a-zA-Z0-9_-]+$', name):
        return 'Provider name can only contain letters, numbers, underscores, and hyphens'
    if name in BUILTIN_PROVIDER_NAMES:
        return f'"{name}" is a built-in provider name and cannot be used'
    if name == 'custom_providers':
        return '"custom_providers" is a reserved name'
    return None


def _get_custom_provider_defaults(method='GET'):
    '''Return default config values for a new custom provider.'''
    if method.upper() == 'POST':
        return {
            'method': 'POST',
            'headers': {'Content-Type': 'application/json'},
            'params': {},
            'payload': {'query': '{query}', 'count': '{limit}'},
            'advanced_params_tpl': {},
            'advanced_payload_tpl': {},
            'response_mapping': {
                'root_path': '@',
                'fields': {'url': 'url', 'title': 'title'},
            },
        }
    return {
        'method': 'GET',
        'headers': {},
        'params': {'q': '{query}', 'count': '{limit}'},
        'payload': {},
        'advanced_params_tpl': {},
        'advanced_payload_tpl': {},
        'response_mapping': {
            'root_path': '@',
            'fields': {'url': 'url', 'title': 'title'},
        },
    }


@app.route('/api/custom-providers', methods=['POST'])
def create_custom_provider():
    data = request.json
    name = (data.get('name') or '').strip()
    url = (data.get('url') or '').strip()
    method = (data.get('method') or 'GET').strip().upper()

    # Validate name
    name_error = _validate_custom_provider_name(name)
    if name_error:
        return jsonify({'error': name_error}), 400

    # Validate URL
    if not url:
        return jsonify({'error': 'API URL is required'}), 400
    if not url.startswith(('http://', 'https://')):
        return jsonify({'error': 'API URL must start with http:// or https://'}), 400

    # Validate method
    if method not in ('GET', 'POST'):
        return jsonify({'error': 'Method must be GET or POST'}), 400

    all_config = get_stored_config()
    custom_providers = all_config.get('custom_providers', {})

    if name in custom_providers:
        return jsonify({'error': f'Custom provider "{name}" already exists'}), 409

    # Build provider config with defaults
    defaults = _get_custom_provider_defaults(method)
    provider_config = {
        'url': url,
        'method': method,
        'headers': data.get('headers', defaults['headers']),
        'params': data.get('params', defaults['params']),
        'payload': data.get('payload', defaults['payload']),
        'response_mapping': data.get('response_mapping', defaults['response_mapping']),
    }

    # Optional fields
    if data.get('advanced_params_tpl'):
        provider_config['advanced_params_tpl'] = data['advanced_params_tpl']
    if data.get('advanced_payload_tpl'):
        provider_config['advanced_payload_tpl'] = data['advanced_payload_tpl']

    custom_providers[name] = provider_config
    all_config['custom_providers'] = custom_providers
    save_stored_config(all_config)
    reload_custom_providers()

    return jsonify({'status': 'success', 'provider': provider_config}), 201


@app.route('/api/custom-providers/<name>', methods=['PUT'])
def update_custom_provider(name):
    data = request.json

    all_config = get_stored_config()
    custom_providers = all_config.get('custom_providers', {})

    if name not in custom_providers:
        return jsonify({'error': f'Custom provider "{name}" not found'}), 404

    existing = custom_providers[name]

    # Update URL if provided
    url = data.get('url')
    if url is not None:
        url = url.strip()
        if not url:
            return jsonify({'error': 'API URL is required'}), 400
        if not url.startswith(('http://', 'https://')):
            return jsonify({'error': 'API URL must start with http:// or https://'}), 400
        existing['url'] = url

    # Update method if provided
    method = data.get('method')
    if method is not None:
        method = method.strip().upper()
        if method not in ('GET', 'POST'):
            return jsonify({'error': 'Method must be GET or POST'}), 400
        existing['method'] = method

    # Update optional fields if provided
    for field in ('headers', 'params', 'payload', 'response_mapping', 'advanced_params_tpl', 'advanced_payload_tpl'):
        if field in data:
            existing[field] = data[field]

    custom_providers[name] = existing
    all_config['custom_providers'] = custom_providers
    save_stored_config(all_config)
    reload_custom_providers()

    return jsonify({'status': 'success', 'provider': existing})


@app.route('/api/custom-providers/<name>', methods=['DELETE'])
def delete_custom_provider(name):
    all_config = get_stored_config()
    custom_providers = all_config.get('custom_providers', {})

    if name not in custom_providers:
        return jsonify({'error': f'Custom provider "{name}" not found'}), 404

    # Remove the custom provider definition
    del custom_providers[name]
    if custom_providers:
        all_config['custom_providers'] = custom_providers
    else:
        del all_config['custom_providers']

    # Remove per-provider settings (api_key, etc.), but not the custom_providers key itself
    if name in all_config and name != 'custom_providers':
        del all_config[name]

    save_stored_config(all_config)
    reload_custom_providers()

    return jsonify({'status': 'success'})


@app.route('/api/search', methods=['POST'])
def search_api():
    data = request.json
    query = data.get('query')
    provider_name = data.get('provider', 'querit')
    stream = data.get('stream', False)
    extra_json = data.get('extra_json')  # Advanced search: extra JSON params to merge into payload

    api_key = data.get('api_key')

    stored_config = get_stored_config()
    provider_config = stored_config.get(provider_name, {})

    if isinstance(provider_config, str):
        provider_config = {'api_key': provider_config}

    if not api_key:
        api_key = provider_config.get('api_key')
    if provider_name == 'querit':
        querit_version = data.get('querit_version') or provider_config.get('querit_version', 'abroad')
        # if querit_version == 'abroad':
        #     provider_config['api_url'] = 'https://api.querit.ai/v1/search'
        #     api_key = 'abroad'
        # elif querit_version == 'domestic':
        #     provider_config['api_url'] = 'http://searchapis.sdns.baidu.com/v1/search'
        #     api_key = 'domestic'
        # elif querit_version == 'all':
        #     provider_config['api_url'] = 'http://searchapis.sdns.baidu.com/v1/search'
        #     api_key = 'all'

    logger.info("kkk1 provider_config['api_url']={}, api_key={}".format(provider_config['api_url'],api_key))



    # Intervene in extra_json for complianceScene based on querit_version
    if provider_name == 'querit':
        if extra_json is None:
            extra_json = {}
        if 'filters' not in extra_json:
            extra_json['filters'] = {}
            
        if querit_version == 'domestic':
            extra_json['filters']['complianceScene'] = 'domestic'
        elif querit_version == 'all':
            extra_json['filters']['complianceScene'] = 'all'
        elif querit_version == 'abroad':
            extra_json['filters'].pop('complianceScene', None)

    if not api_key:
        return (
            jsonify({'error': f'API Key for {provider_name} is missing. Please configure it.'}),
            401,
        )

    provider = provider_map.get(provider_name)
    if not provider:
        return jsonify({'error': 'Provider not found'}), 404

    search_kwargs = {
        'api_url': provider_config.get('api_url'),
        'limit': provider_config.get('limit'),
        'proxy_url': provider_config.get('proxy_url') if provider_config.get('use_proxy') else None,
        'skip_warmup': provider_config.get('skip_warmup', False),
        'extra_json': extra_json,
    }

    # If stream is requested, use SSE to send status updates
    if stream:
        def generate():
            # Use a queue to communicate between search thread and generator
            message_queue = queue.Queue()

            def status_callback(status, message):
                # Put status update in queue for immediate yielding
                event_data = json.dumps({'type': 'status', 'status': status, 'message': message})
                message_queue.put(f'data: {event_data}\n\n')

            # Add status callback to search kwargs
            search_kwargs['status_callback'] = status_callback

            # Run search in background thread
            result_container = {}

            def run_search():
                try:
                    result = provider.search(query, api_key, **search_kwargs)
                    result_container['result'] = result
                except Exception as e:
                    result_container['error'] = str(e)
                finally:
                    # Signal completion
                    message_queue.put(None)

            search_thread = threading.Thread(target=run_search)
            search_thread.start()

            # Yield status updates as they arrive
            while True:
                try:
                    msg = message_queue.get(timeout=0.1)
                    if msg is None:
                        # Search completed
                        break
                    yield msg
                except queue.Empty:
                    # Send keepalive comment to prevent timeout
                    yield ': keepalive\n\n'

            # Wait for thread to finish
            search_thread.join()

            # Send final result
            if 'error' in result_container:
                error_result = {
                    'type': 'result',
                    'data': {'error': result_container['error'], 'results': [], 'metrics': {}},
                }
                result_data = json.dumps(error_result)
            else:
                result_data = json.dumps({'type': 'result', 'data': result_container['result']})
            yield f'data: {result_data}\n\n'

        return Response(generate(), mimetype='text/event-stream')

    # Non-streaming response (backward compatibility)
    result = provider.search(query, api_key, **search_kwargs)
    return jsonify(result)


@app.route('/api/browser-open', methods=['POST'])
def open_browser_external():
    '''
    Android-specific API: Open URL in external browser via Intent.
    Only works when running in Android WebView environment (frozen + Android).
    '''
    data = request.json
    url = data.get('url')

    if not url:
        return jsonify({'error': 'URL parameter is required'}), 400

    # Check if running in Android APK environment
    if not IN_ANDROID_APP:
        logger.warning(
            f'browser-open API called but not in Android app '
            f'(frozen={getattr(sys, "frozen", False)}, '
            f'android={"ANDROID_ARGUMENT" in os.environ})',
        )
        return jsonify({
            'error': 'Not running in Android app container',
            'frozen': getattr(sys, 'frozen', False),
            'android': 'ANDROID_ARGUMENT' in os.environ,
        }), 400

    try:
        # Define function without decorator first
        def open_browser_impl():
            '''Open URL in external browser using Android Intent'''
            context = Activity.mActivity
            intent = Intent()
            intent.setAction(Intent.ACTION_VIEW)
            intent.setData(Uri.parse(url))
            context.startActivity(intent)
            logger.info(f'Opened URL in external browser: {url}')

        # Execute on UI thread - call run_on_ui_thread as a function
        run_on_ui_thread(open_browser_impl)()

        return jsonify({'success': True, 'url': url})

    except Exception as e:
        logger.error(f'Failed to open browser: {e}', exc_info=True)
        return jsonify({'error': str(e)}), 500


# Host React Frontend
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    if path != '' and (STATIC_FOLDER / path).exists():
        return send_from_directory(str(STATIC_FOLDER), path)
    else:
        return send_from_directory(str(STATIC_FOLDER), 'index.html')


def wait_for_server_ready(host, port):
    start_time = time.time()
    while time.time() - start_time < 10:
        try:
            with socket.create_connection((host, port), timeout=1):
                return True
        except (OSError, ConnectionRefusedError):
            time.sleep(0.1)
    return False


def main():
    import argparse

    parser = argparse.ArgumentParser(description='Search API WebUI')
    parser.add_argument('--port', type=int, default=8889, help='Port to run the server on')
    parser.add_argument('--host', type=str, default='localhost', help='Host to run the server on')
    parser.add_argument('-w', '--webview', action='store_true', help='Use webview to open the application')
    args = parser.parse_args()

    url = f'http://{args.host}:{args.port}'
    logger.info('Starting Search API WebUI...')
    logger.info(f'  - Config Storage: {USER_CONFIG_JSON}')
    logger.info(f'  - Serving on: {url}')
    if args.webview:
        logger.info('  - Mode: webview')

    if args.webview:
        if not WEBVIEW_AVAILABLE:
            logger.warning('webview library not installed. Falling back to webbrowser.')
            # Start server in background thread and wait for it to be ready
            server_thread = threading.Thread(
                target=lambda: app.run(
                    host=args.host, port=args.port, use_reloader=False,
                ),
                daemon=True,
            )
            server_thread.start()
            if wait_for_server_ready(args.host, args.port):
                logger.info(f'Server is ready! Opening browser: {url}')
                webbrowser.open(url)
            else:
                logger.error('Server took too long to start. Browser not opened.')
        else:
            # Start server in background thread and wait for it to be ready, then start webview
            server_thread = threading.Thread(
                target=lambda: app.run(
                    host=args.host, port=args.port, use_reloader=False,
                ),
                daemon=True,
            )
            server_thread.start()
            if wait_for_server_ready(args.host, args.port):
                logger.info('Server is ready! Using webview mode...')
                webview.create_window('Search API WebUI', url, width=1200, height=800)
                webview.start()
            else:
                logger.error('Server took too long to start. Webview not opened.')
    else:
        # Start a background thread to check server status and open the browser automatically
        def open_browser():
            if wait_for_server_ready(args.host, args.port):
                logger.info(f'Server is ready! Opening browser: {url}')
                webbrowser.open(url)
            else:
                logger.error('Server took too long to start. Browser not opened.')
        threading.Thread(target=open_browser, daemon=True).start()
        app.run(host=args.host, port=args.port)


if __name__ == '__main__':
    main()
