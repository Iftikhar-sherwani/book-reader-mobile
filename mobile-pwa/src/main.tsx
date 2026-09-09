import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';

// Polyfills for broad Android browser compatibility (Promise.try & Uint8Array.prototype.toHex)
if (typeof (Promise as any).try !== 'function') {
  (Promise as any).try = function (fn: (...args: any[]) => any, ...args: any[]) {
    return new Promise((resolve) => resolve(fn(...args)));
  };
}

if (typeof (Uint8Array.prototype as any).toHex !== 'function') {
  (Uint8Array.prototype as any).toHex = function () {
    return Array.from(this)
      .map((b) => (b as number).toString(16).padStart(2, '0'))
      .join('');
  };
}

// Register service worker if supported
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Relative registration works seamlessly across subpaths (e.g. /REPOSITORY/ on GitHub Pages)
    navigator.serviceWorker.register('./sw.js').catch((err) => {
      console.warn('ServiceWorker registration error:', err);
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
