import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles.css';
import './theme.css';
import './density.css';
import './sidebar.css';
import { initializeAppearance } from './appearance';

initializeAppearance();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><BrowserRouter><App/></BrowserRouter></React.StrictMode>
);
