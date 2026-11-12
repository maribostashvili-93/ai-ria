/**
 * Paths whose contents are examples, not the project's real behavior.
 *
 * Test suites and example apps deliberately contain fake keys, unsafe commands
 * and throwaway `package.json` files. Treating them as evidence produces
 * security findings nobody can act on and plans built on a fixture's stack.
 * Every module that reasons *about* a repository should filter through this.
 */
export const FIXTURE_PATHS: RegExp[] = [
  /(^|\/)(tests?|__tests__|__mocks__|mocks|fixtures|__fixtures__|examples?|samples?|demo|demos)\//i,
  // End-to-end suites: seeded test users, local database URLs, throwaway passwords.
  /(^|\/)(e2e|playwright|cypress)\//i,
  /\.(test|spec)\.[cm]?[jt]sx?$/i,
  /(^|\/)(vendor|third[-_]party)\//i,
];

/** True when the path is a fixture/test/example path. */
export function isFixturePath(file: string, extra: RegExp[] = []): boolean {
  return [...FIXTURE_PATHS, ...extra].some((re) => re.test(file));
}
