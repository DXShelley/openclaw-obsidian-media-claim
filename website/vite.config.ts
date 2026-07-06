import { defineConfig } from 'vite';
const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'openclaw-obsidian-media-claim';
const base = process.env.GITHUB_ACTIONS ? `/${repositoryName}/` : '/';

export default defineConfig({
  base,
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]'
      }
    }
  }
});
