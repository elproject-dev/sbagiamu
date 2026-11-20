package com.sbagiamu.app;

import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppSettingsPlugin.class);
        registerPlugin(ApkInstallerPlugin.class);
        super.onCreate(savedInstanceState);

        // Bersihkan cache webview setiap app dibuka agar selalu memuat aset APK terbaru
        try {
            WebView webView = getBridge().getWebView();
            if (webView != null) {
                webView.clearCache(true);
            }
        } catch (Exception ignored) {}
    }
}
