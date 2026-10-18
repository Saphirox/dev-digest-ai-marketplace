import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base + hash routing: works at https://<owner>.github.io/<repo>/ without a 404.html fallback.
export default defineConfig({
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['@huggingface/transformers'] },
  build: { target: 'es2022' },
});
