import { BrowserRouter } from 'react-router-dom'
import AuthProvider from './core/auth/AuthProvider'
import { AppRoutes } from './routes/routes'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
