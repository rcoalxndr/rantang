import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    /**
     * Proxy inilah yang membuat cookie sesi bekerja tanpa drama.
     *
     * Tanpa proxy, browser melihat frontend di localhost:5173 dan backend di
     * localhost:3000 sebagai dua asal (origin) yang berbeda. Cookie
     * `SameSite=Lax` tidak akan ikut terkirim, dan kita terpaksa memakai
     * `SameSite=None` + `Secure` yang butuh HTTPS — mustahil di localhost biasa.
     *
     * Dengan proxy, browser cuma pernah bicara ke localhost:5173. Permintaan ke
     * /api diteruskan Vite ke backend di belakang layar. Satu asal, cookie
     * bekerja apa adanya, dan CORS tidak dibutuhkan sama sekali saat
     * pengembangan.
     */
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: false,
      },
    },
  },
});
