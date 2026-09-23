import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './app/App'
import { PreferencesProvider } from './shared/lib/preferences'
import './shared/styles/global.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <PreferencesProvider>
        <App />
      </PreferencesProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
