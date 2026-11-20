import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { registerSW } from 'virtual:pwa-register';
import { Capacitor } from '@capacitor/core';

// Hanya aktifkan Service Worker PWA di browser biasa (Web).
// Di aplikasi native Android / iOS (Capacitor), semua file sudah ada di dalam APK
// sehingga Service Worker tidak diperlukan dan justru bisa menyebabkan cache lawas tertahan.
if (!Capacitor.isNativePlatform()) {
  registerSW({ immediate: true });
}

createRoot(document.getElementById("root")!).render(<App />);
