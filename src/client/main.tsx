import React from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import './styles.css';
import './reference-layout.css';
import './side-chat.css';
import { prioritizeInteraction } from './background-work';

window.addEventListener('pointerdown', prioritizeInteraction, { passive: true });
window.addEventListener('keydown', prioritizeInteraction);
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    window.setTimeout(() => {
      void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => undefined);
    }, 2000);
  }, { once: true });
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
