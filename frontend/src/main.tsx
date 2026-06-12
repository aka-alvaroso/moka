import React from 'react';
import ReactDOM from 'react-dom/client';
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
