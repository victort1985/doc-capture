module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  // The `webdav` package ships ESM-only ("export ... from") with no
  // CommonJS build. It's node_modules, which Jest ignores for
  // transforms by default — but storage.service.ts pulls it in
  // transitively (via the Synology storage adapter), so any spec that
  // imports StorageService (even just to mock it as a DI provider)
  // fails to even parse without this override.
  moduleNameMapper: {
    '^webdav$': '<rootDir>/../__mocks__/webdav.js',
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
};
