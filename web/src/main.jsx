import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.jsx';
import { PenyediaAuth } from './auth.jsx';
import './styles.css';

createRoot(document.getElementById('akar')).render(
  <StrictMode>
    <PenyediaAuth>
      <App />
    </PenyediaAuth>
  </StrictMode>
);
