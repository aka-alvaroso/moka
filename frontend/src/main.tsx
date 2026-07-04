import React from 'react';
import ReactDOM from 'react-dom/client';
// Self-hosted fonts (bundled by Vite) — no runtime dependency on Google Fonts.
// Critical for server-side export: headless Chrome has no outbound access to
// fonts.googleapis.com, so CDN fonts silently fell back to system fonts.
import '@fontsource/inter/300.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/rubik/900.css';
import App from './App';
import { RenderView } from './components/RenderView';
import { ThemeProvider } from './context/ThemeContext';
import './index.css';

const isRenderView = window.location.pathname.endsWith('/render');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isRenderView ? <RenderView /> : <ThemeProvider><App /></ThemeProvider>}
  </React.StrictMode>
);
