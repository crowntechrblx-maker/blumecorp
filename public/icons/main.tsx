import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './AuthContext.tsx'
import { WallpaperProvider } from './WallpaperContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <WallpaperProvider>
        <App />
      </WallpaperProvider>
    </AuthProvider>
  </StrictMode>,
)
