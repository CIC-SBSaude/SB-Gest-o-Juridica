import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // O preview do AI Studio encerra o WebSocket de HMR de forma intermitente.
    // Desabilitar HMR remove o falso erro visual; alterações continuam exigindo reload.
    hmr: false,
    watch: null,
  },
});
