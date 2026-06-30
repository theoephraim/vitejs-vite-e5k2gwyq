# varlock monorepo env-types: cross-package type-checking

This repo reproduces — and fixes — a TypeScript error that shows up when one
package imports another, and both have their own `.env.schema` (and thus their
own generated `env.d.ts`):

```
../lib-a/src/bar.ts(5,14): error TS2339: Property 'MY_VAR' does not exist on type 'TypedEnvSchema'.
```

## Why it happens

varlock exposes a typed `ENV` via `import { ENV } from 'varlock/env'`. The type
comes from an **ambient module augmentation**: each package's generated
`env.d.ts` contains

```ts
declare module 'varlock/env' {
  export interface TypedEnvSchema extends Readonly<...> {}
}
```

There is only **one** `varlock/env` module in the whole TypeScript program, so
`ENV`'s type is the *merge* of every `env.d.ts` that happens to be loaded in the
current compilation.

If `lib-b` imports `lib-a`'s **source** (`.ts`), tsc pulls `lib-a/src/bar.ts`
into `lib-b`'s program and type-checks its body — including `ENV.MY_VAR` — but
only `lib-b`'s `env.d.ts` is loaded. So `TypedEnvSchema` only has `lib-b`'s
keys, and `MY_VAR` appears to not exist.

This is a fundamental limitation of global module augmentation, not something a
varlock setting can paper over while keeping the `import { ENV } from
'varlock/env'` ergonomics. (The unique hashed type aliases varlock generates
only prevent *duplicate-identifier* collisions when both `env.d.ts` files land
in one compilation — a different problem.)

## The fix: consume BUILT declarations across package boundaries

When a package is built, `tsc` infers and **inlines** any `ENV.*`-derived types
into the emitted `.d.ts`:

```ts
// lib-a/dist/src/bar.d.ts
export declare function foobar(): string | undefined;
```

There's no `varlock/env` reference left, so a consumer never has to type-check
`lib-a`'s body against its own env augmentation. The trick is to make sure
cross-package imports resolve to that built `.d.ts`, not to source.

This repo does that with three pieces:

1. **Export-map conditions** (`packages/*/package.json`):

   ```jsonc
   "exports": {
     ".": {
       "ts-src": "./src/index.ts",        // source — only used if you opt in
       "types": "./dist/src/index.d.ts",  // tsc reads this by default
       "default": "./dist/src/index.js"   // runtime
     }
   }
   ```

   The `ts-src` condition is available for editors/tools that want
   click-through to source (enable it with `"customConditions": ["ts-src"]`),
   but the authoritative type-check leaves it **off** so `tsc` resolves `types`
   → the built `.d.ts`.

2. **Project references + `tsc -b`** (`tsconfig.json`, `packages/*/tsconfig.json`):
   the root solution config builds each package in dependency order, emitting
   `lib-a`'s declarations before `lib-b` is checked. `composite` + `declaration`
   enable this; `declarationMap` keeps go-to-definition landing on source.

3. **`disableSourceOfProjectReferenceRedirect: true`** (in `tsconfig.base.json`):
   without it, project references silently redirect an import of a referenced
   project back to its *source* `.ts` files — which would re-introduce the bug.
   This forces resolution to the built `.d.ts`.

## Try it

```sh
pnpm install
pnpm exec tsc -b --force   # builds lib-a, then type-checks lib-b — clean
```

### The trade-off

If you instead want source-first dev (no build step, instant feedback) by
enabling `"customConditions": ["ts-src"]`, the cross-package env error comes
back — that's the inherent tension. Keep `ts-src` for your editor if you like,
but run the authoritative `tsc -b` type-check without it.
