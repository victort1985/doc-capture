import 'reflect-metadata';
import { getMetadataArgsStorage } from 'typeorm';
import { StorageConnection } from '../../modules/storage/entities/storage-connection.entity';
import { DocumentEmailSettings } from '../../modules/document-email/entities/document-email-settings.entity';
import { OrderEmailSettings } from '../../modules/orders/entities/order-email-settings.entity';

/** Finds the `transformer` configured on a given @Column() property,
 * by reading TypeORM's global column metadata rather than trying to
 * import the (inline, unexported) transformer object directly. */
function getColumnTransformer(target: new (...args: unknown[]) => unknown, propertyName: string) {
  const column = getMetadataArgsStorage().columns.find(
    (c) => c.target === target && c.propertyName === propertyName,
  );
  if (!column) throw new Error(`No @Column() found for ${(target as { name: string }).name}.${propertyName}`);
  const transformer = (column.options as { transformer?: { to: (v: unknown) => unknown; from: (v: unknown) => unknown } }).transformer;
  if (!transformer) throw new Error(`${(target as { name: string }).name}.${propertyName} has no transformer configured`);
  return transformer;
}

describe('secret-at-rest encryption (AC7)', () => {
  const ORIGINAL_KEY = process.env.ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = 'c'.repeat(64);
  });

  afterAll(() => {
    process.env.ENCRYPTION_KEY = ORIGINAL_KEY;
  });

  it.each([
    ['StorageConnection.password', StorageConnection, 'password'],
    ['DocumentEmailSettings.appPassword', DocumentEmailSettings, 'appPassword'],
    ['OrderEmailSettings.appPassword', OrderEmailSettings, 'appPassword'],
  ])('%s is encrypted going in and decrypted coming out', (_label, EntityClass, propertyName) => {
    const transformer = getColumnTransformer(EntityClass, propertyName);
    const plaintextSecret = 'xxxx xxxx xxxx xxxx';

    const storedValue = transformer.to(plaintextSecret);
    // This is the actual regression check: the value that would be
    // written to the database column must not be the plaintext secret.
    expect(storedValue).not.toBe(plaintextSecret);
    expect(String(storedValue)).not.toContain(plaintextSecret);

    // ...but reading it back through the transformer must recover it.
    expect(transformer.from(storedValue)).toBe(plaintextSecret);
  });

  it.each([
    ['StorageConnection.password', StorageConnection, 'password'],
    ['DocumentEmailSettings.appPassword', DocumentEmailSettings, 'appPassword'],
    ['OrderEmailSettings.appPassword', OrderEmailSettings, 'appPassword'],
  ])('%s transformer passes through null/undefined unchanged (optional field)', (_label, EntityClass, propertyName) => {
    const transformer = getColumnTransformer(EntityClass, propertyName);
    expect(transformer.to(undefined)).toBeUndefined();
    expect(transformer.from(undefined)).toBeUndefined();
  });
});
