import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { DemoNotice } from './mocks/DemoNotice'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <DemoNotice />
  </StrictMode>,
)
