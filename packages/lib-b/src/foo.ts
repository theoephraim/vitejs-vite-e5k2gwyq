// Import lib-a through its package entrypoint. Because lib-b's tsconfig does
// NOT enable the `ts-src` condition, this resolves to lib-a's built
// `dist/src/index.d.ts` (the `types` export condition) rather than lib-a's
// source — so lib-a's `ENV.MY_VAR` usage never gets type-checked against
// lib-b's `varlock/env` augmentation.
import { foobar } from '@_/lib-a';

export function hello() {
  return foobar();
}
