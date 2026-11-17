import { BrowserRouter } from 'react-router-dom'
import AuthProvider from './core/auth/AuthProvider'
import { AppRoutes } from './routes/routes'
import { PageTitle } from './routes/PageTitle'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <PageTitle />
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
