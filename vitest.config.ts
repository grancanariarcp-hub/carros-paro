import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    testTimeout: 15_000,
    hookTimeout: 15_000,
    // Los ficheros se ejecutan de uno en uno, no en paralelo. `setupFixture`
    // crea hospitales y usuarios con identificadores FIJOS, así que dos
    // ficheros a la vez chocan al insertar la misma fila y el segundo falla
    // con un error que no dice nada ("Cannot read properties of null").
    // Si algún día las fixtures generan ids aleatorios, esto puede quitarse.
    fileParallelism: false,
    env: {
      // Cargado desde .env.local de Next.js (tests apuntan a DEV)
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    },
  },
})
