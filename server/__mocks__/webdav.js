// Manual mock for the `webdav` package (see jest.config.js moduleNameMapper).
// It's ESM-only with an ESM-only dependency tree (layerr, hot-patcher, ...),
// and none of these unit tests actually exercise real WebDAV/Synology
// storage behavior — they only need `StorageService` to be importable as a
// DI token, which pulls this in transitively via the adapter factory.
module.exports = {
  createClient: () => {
    throw new Error('webdav is mocked out for unit tests — see __mocks__/webdav.js');
  },
};
