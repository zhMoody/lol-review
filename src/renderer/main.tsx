import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './tokens.css'
import { App } from './app.js'
import { initMotion } from './motion/engine.js'

initMotion()

const container = document.getElementById('root')
if (container === null) {
  throw new Error('缺少 #root 挂载点')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
