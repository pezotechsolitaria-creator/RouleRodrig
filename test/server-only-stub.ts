// `server-only` throws when imported outside a React Server Component, which
// breaks Vitest even for pure logic in a server module. Aliased to this no-op
// in vitest.config.ts so the guarantee stays real in the app build while the
// unit tests can still import the module.
export {};
