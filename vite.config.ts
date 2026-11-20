import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// base: './' 让构建产物可以挂在任意子路径下预览
export default defineConfig({
  base: './',
  plugins: [svelte()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200
  }
});
