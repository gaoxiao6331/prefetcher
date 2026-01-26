import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

export default defineConfig({
  plugins: [pluginReact()],
  performance: {
    removeConsole: false,
  },
  html: {
    title: 'Site B',
  },
  output: {
    distPath: {
      root: 'dist',
      js: 'assets/js',
      css: 'assets/css',
    },
    filename: {
      js: 'js/[name].js',
      css: 'css/[name].css',
    },
  },
  source: {
    entry: {
      index: './src/index.tsx'
    }
  }
});