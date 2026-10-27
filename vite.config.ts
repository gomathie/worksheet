import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { sentryVitePlugin } from '@sentry/vite-plugin'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const canUploadSourcemaps = Boolean(
    env.SENTRY_AUTH_TOKEN && env.SENTRY_ORG && env.SENTRY_PROJECT,
  )
  const releaseName =
    env.SENTRY_RELEASE ||
    (env.CF_PAGES_COMMIT_SHA ? `ledger@${env.CF_PAGES_COMMIT_SHA}` : undefined)

  return {
    plugins: [
      vue(),
      tailwindcss(),
      ...(canUploadSourcemaps
        ? [
            sentryVitePlugin({
              org: env.SENTRY_ORG,
              project: env.SENTRY_PROJECT,
              authToken: env.SENTRY_AUTH_TOKEN,
              telemetry: false,
              sourcemaps: {
                filesToDeleteAfterUpload: ['dist/**/*.map'],
              },
              ...(releaseName
                ? {
                    release: {
                      name: releaseName,
                      inject: true,
                      create: true,
                      finalize: true,
                    },
                  }
                : {}),
            }),
          ]
        : []),
    ],
    build: {
      // Source maps are only emitted when the Sentry upload plugin is enabled.
      // The plugin removes them from the deployable output after uploading.
      sourcemap: canUploadSourcemaps ? 'hidden' : false,
    },
    server: {
      // `npm run dev:web` proxies API calls to `wrangler pages dev` on :8788
      proxy: {
        '/api': 'http://127.0.0.1:8788',
      },
    },
  }
})
