# Copyright (c) 2026 QUERIT PRIVATE LIMITED
#
# Android entry point for Search API WebUI using Kivy + Buildozer
# This file enables packaging the Flask app into an Android APK

import os
import time
from threading import Thread

if 'ANDROID_ARGUMENT' in os.environ:
    app_files_dir = os.environ.get('ANDROID_PRIVATE')
    if app_files_dir:
        print(f"Setting HOME to Android private files dir: {app_files_dir}")
        os.environ['HOME'] = app_files_dir
        os.environ['XDG_CONFIG_HOME'] = app_files_dir

from kivy.app import App
from kivy.clock import Clock
from kivy.core.window import Window
from kivy.core.window import Keyboard
from android.runnable import run_on_ui_thread
from android.permissions import request_permissions, Permission
from jnius import autoclass, PythonJavaClass, java_method

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


class CustomWebViewClient(PythonJavaClass):
    '''
    Custom WebViewClient to handle page navigation and enable
    proper back button support for browsing history.
    '''
    __javainterfaces__ = ['android/webkit/WebViewClient']
    __javacontext__ = 'app'

    @java_method('(Landroid/webkit/WebView;Ljava/lang/String;)Z')
    def shouldOverrideUrlLoading(self, view, url):
        '''
        Allow WebView to handle all URL navigation internally.
        Returns False to let WebView load the URL.
        '''
        return False


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

        # Bind back button to handle WebView navigation
        Window.bind(on_keyboard=self.on_back_button)

        # Start Flask server in background thread
        Thread(target=self.start_flask_server, daemon=True).start()

        # Schedule WebView creation after Flask starts
        Clock.schedule_once(self.create_webview, 2)

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
                host='0.0.0.0',
                port=self.flask_port,
                debug=False,
                use_reloader=False,
                threaded=True,
            )
        except Exception as e:
            print(f'Flask server error: {e}')

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

            # Set custom WebViewClient to handle navigation
            self.webview.setWebViewClient(CustomWebViewClient())

            # Load the Flask app
            url = f'http://localhost:{self.flask_port}'
            self.webview.loadUrl(url)

            # Replace root widget with WebView
            Activity.mActivity.setContentView(self.webview)

            print(f'WebView loaded: {url}')

        except Exception as e:
            print(f'WebView setup error: {e}')

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

    def on_back_button(self, window, key, *args):
        '''
        Handle Android back button to navigate WebView history.
        Returns True if back navigation was handled, False otherwise.
        '''
        if key == Keyboard.keycodes['escape']:  # Back button on Android
            if self.webview and self.webview.canGoBack():
                self.webview.goBack()
                return True
        return False


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
