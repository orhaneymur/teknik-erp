import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { setupAuthInterceptor } from './lib/api'
import { loadTenantConfig } from './lib/tenantConfig'

setupAuthInterceptor()

// Firma bilgisi ConfigMap'ten gelir — arayüz çizilmeden önce yüklenmeli ki
// giriş ekranında bir an yanlış/varsayılan marka görünmesin.
loadTenantConfig().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
