# Copyright (c) 2026 QUERIT PRIVATE LIMITED
#
# Android entry point for Search API WebUI using Kivy + Buildozer
# This file enables packaging the Flask app into an Android APK

import logging
import os
import time
from threading import Thread

# Set up logger
logger = logging.getLogger(__name__)

# ANDROID_ARGUMENT is set by python-for-android (p4a) build system
# when packaging the app using buildozer. It indicates the app is
# running in an Android APK environment.
if 'ANDROID_ARGUMENT' in os.environ:
    app_files_dir = os.environ.get('ANDROID_PRIVATE')
    if app_files_dir:
        logger.info(f'Setting HOME to Android private files dir: {app_files_dir}')
        os.environ['HOME'] = app_files_dir
        os.environ['XDG_CONFIG_HOME'] = app_files_dir

        # Pre-create .kivy directory to avoid logo copy permission errors
        kivy_dir = os.path.join(app_files_dir, '.kivy')
        icon_dir = os.path.join(kivy_dir, 'icon')
        try:
            os.makedirs(icon_dir, mode=0o755, exist_ok=True)
            logger.info(f'Created Kivy directories: {icon_dir}')
        except Exception as e:
            logger.warning(f'Could not create Kivy directories: {e}')

from kivy.app import App
from kivy.clock import Clock
from kivy.core.window import Window
from android.runnable import run_on_ui_thread
from android.permissions import request_permissions, Permission
from jnius import autoclass

# Import the Flask app
from search_api_webui.app import app as flask_app


# Request Android permissions at startup
def request_android_permissions():
    '''
    Request necessary Android permissions for storage access.
    Must be called before Kivy initializes.
    '''
    try:
        request_permissions([
            Permission.WRITE_EXTERNAL_STORAGE,
            Permission.READ_EXTERNAL_STORAGE,
            Permission.INTERNET,
        ])
    except Exception as e:
        print(f'Permission request error: {e}')


# Android WebView classes
WebView = autoclass('android.webkit.WebView')
WebViewClient = autoclass('android.webkit.WebViewClient')
WebSettings = autoclass('android.webkit.WebSettings')
Activity = autoclass('org.kivy.android.PythonActivity')
ViewGroup_LayoutParams = autoclass('android.view.ViewGroup$LayoutParams')
ViewGroup = autoclass('android.view.ViewGroup')
LinearLayout_LayoutParams = autoclass('android.widget.LinearLayout$LayoutParams')
LinearLayout = autoclass('android.widget.LinearLayout')
Rect = autoclass('android.graphics.Rect')


class SearchWebViewApp(App):
    '''
    Main Kivy application that runs Flask in background
    and displays it in an Android WebView.
    '''

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.webview = None
        self.flask_port = 5000
        self.flask_ready = False

    def build(self):
        '''
        Build the application UI.
        Called by Kivy framework when app starts.
        '''
        # Set window background color
        Window.clearcolor = (1, 1, 1, 1)

        # Start Flask server in background thread
        Thread(target=self.start_flask_server, daemon=True).start()

        # Wait for Flask port to be available before creating WebView
        Clock.schedule_once(self.wait_for_flask, 0)

        # Return a placeholder widget
        from kivy.uix.label import Label
        return Label(text='Loading Search API WebUI...')

    def start_flask_server(self):
        '''
        Start Flask development server in background.
        Runs in a separate daemon thread.
        '''
        try:
            flask_app.run(
                host='127.0.0.1',
                port=self.flask_port,
                debug=False,
                use_reloader=False,
                threaded=True,
            )
        except Exception as e:
            print(f'Flask server error: {e}')

    def wait_for_flask(self, dt):
        '''
        Poll Flask port until it's available, then create WebView.
        '''
        import socket

        max_attempts = 50  # 5 seconds max (50 * 0.1s)
        for _ in range(max_attempts):
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(0.1)
            try:
                result = sock.connect_ex(('127.0.0.1', self.flask_port))
                sock.close()
                if result == 0:
                    # Port is open, Flask is ready
                    Clock.schedule_once(self.create_webview, 0)
                    return
            except Exception:
                pass
            Clock.schedule_once(self.wait_for_flask, 0.1)
        # Fallback: just create webview after timeout
        Clock.schedule_once(self.create_webview, 0)

    def create_webview(self, dt):
        '''
        Create and configure Android WebView.
        Must run on UI thread.
        '''
        self.setup_webview()

    @run_on_ui_thread
    def setup_webview(self):
        '''
        Initialize WebView on Android UI thread.
        Configures WebView settings and loads the Flask app.
        '''
        try:
            # Create WebView instance
            context = Activity.mActivity
            self.webview = WebView(context)

            # Configure WebView settings
            settings = self.webview.getSettings()
            settings.setJavaScriptEnabled(True)
            settings.setDomStorageEnabled(True)
            settings.setDatabaseEnabled(True)
            settings.setAllowFileAccess(True)
            settings.setAllowContentAccess(True)

            # Set cache mode to default
            settings.setCacheMode(WebSettings.LOAD_DEFAULT)

            # Enable zoom controls (optional)
            settings.setBuiltInZoomControls(False)

            # Set custom User-Agent to identify Android WebView environment
            original_ua = settings.getUserAgentString()
            custom_ua = original_ua + ' SearchAPIWebUI-Android'
            settings.setUserAgentString(custom_ua)
            logger.info(f'[WebView] Set custom UA: {custom_ua}')

            # Set WebViewClient to handle navigation
            self.webview.setWebViewClient(WebViewClient())

            # Get status bar height and set margin
            status_bar_height = self.get_status_bar_height()

            # Create layout params with top margin for status bar
            layout_params = LinearLayout_LayoutParams(
                ViewGroup_LayoutParams.MATCH_PARENT,
                ViewGroup_LayoutParams.MATCH_PARENT
            )
            layout_params.topMargin = status_bar_height

            self.webview.setLayoutParams(layout_params)

            # Create a container LinearLayout and add WebView to it
            container = LinearLayout(context)
            container.setOrientation(LinearLayout.VERTICAL)
            container.setLayoutParams(LinearLayout_LayoutParams(
                ViewGroup_LayoutParams.MATCH_PARENT,
                ViewGroup_LayoutParams.MATCH_PARENT
            ))
            container.addView(self.webview)

            # Replace root widget with WebView
            Activity.mActivity.setContentView(container)

            # Load the Flask app
            url = f'http://localhost:{self.flask_port}'
            self.webview.loadUrl(url)

            print(f'WebView loaded: {url} (status bar height: {status_bar_height}px)')

        except Exception as e:
            print(f'WebView setup error: {e}')

    def get_status_bar_height(self):
        '''
        Get the height of the status bar in pixels.
        '''
        try:
            rect = Rect()
            window = Activity.mActivity.getWindow()
            window.getDecorView().getWindowVisibleDisplayFrame(rect)
            return rect.top
        except Exception as e:
            print(f'Error getting status bar height: {e}')
            # Fallback: return a typical status bar height in dp
            return int(25 * Activity.mActivity.getResources().getDisplayMetrics().density)

    def on_pause(self):
        '''
        Called when app goes to background.
        Return True to allow app to pause.
        '''
        return True

    def on_resume(self):
        '''
        Called when app returns from background.
        '''
        pass


def main():
    '''
    Application entry point.
    '''
    # Request permissions before starting app
    request_android_permissions()

    # Start the Kivy app
    SearchWebViewApp().run()


if __name__ == '__main__':
    main()
