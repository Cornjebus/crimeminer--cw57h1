import { defineConfig } from 'vite'; // ^4.4.0
import react from '@vitejs/plugin-react'; // ^4.0.0
import tsconfigPaths from 'vite-tsconfig-paths'; // ^4.2.0
import compression from 'vite-plugin-compression'; // ^0.5.1
import { visualizer } from 'rollup-plugin-visualizer'; // ^5.9.0

export default defineConfig(({ mode }) => {
  const isDevelopment = mode === 'development';
  
  return {
    plugins: [
      react({
        fastRefresh: true,
        babel: {
          plugins: ['@emotion/babel-plugin']
        }
      }),
      tsconfigPaths(),
      compression({
        algorithm: 'brotli',
        ext: '.br'
      }),
      visualizer({
        filename: './dist/stats.html'
      })
    ],

    server: {
      port: 3000,
      strictPort: true,
      host: true,
      cors: {
        origin: ['http://localhost:3000'],
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        credentials: true
      },
      hmr: {
        overlay: true,
        clientPort: 3000,
        timeout: 120000
      }
    },

    preview: {
      port: 3000,
      strictPort: true,
      host: true,
      headers: {
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';",
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block'
      }
    },

    build: {
      outDir: 'dist',
      sourcemap: true,
      minify: 'terser',
      target: 'esnext',
      chunkSizeWarningLimit: 1000,
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true
        }
      },
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', '@reduxjs/toolkit'],
            ui: ['@mui/material', '@emotion/react'],
            utils: ['date-fns', 'lodash']
          }
        }
      },
      reportCompressedSize: true,
      cssCodeSplit: true,
      assetsInlineLimit: 4096
    },

    resolve: {
      alias: {
        '@': '/src',
        '@components': '/src/components',
        '@pages': '/src/pages',
        '@services': '/src/services',
        '@utils': '/src/utils',
        '@hooks': '/src/hooks',
        '@store': '/src/store',
        '@types': '/src/types',
        '@assets': '/src/assets',
        '@config': '/src/config',
        '@constants': '/src/constants'
      }
    },

    css: {
      preprocessorOptions: {
        scss: {
          additionalData: '@import "@/assets/styles/variables.scss"; @import "@/assets/styles/mixins.scss";'
        }
      },
      modules: {
        localsConvention: 'camelCase',
        generateScopedName: '[name]__[local]___[hash:base64:5]'
      }
    },

    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        '@reduxjs/toolkit',
        'socket.io-client',
        'axios',
        'date-fns',
        'lodash'
      ],
      exclude: ['@testing-library/react'],
      esbuildOptions: {
        target: 'esnext'
      }
    },

    envPrefix: 'VITE_',

    esbuild: {
      jsxInject: "import React from 'react'",
      legalComments: 'none'
    }
  };
});