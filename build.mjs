import esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['./src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  outfile: './dist/index.js',
  external: [
    'better-auth',
    'drizzle-orm',
    'express',
    'nodemailer',
    '@aws-sdk/*',
    'multer',
    'cors',
    'morgan',
    'dotenv'
  ],
  sourcemap: true,
  minify: false
});

console.log('✓ Build complete');