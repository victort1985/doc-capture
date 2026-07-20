import { ValueTransformer } from 'typeorm';

/**
 * Postgres numeric/decimal columns come back from the pg driver as
 * STRINGS (e.g. "150.00"), not numbers — a deliberate choice to avoid
 * silent float precision loss, but it means every @Column({ type:
 * 'numeric' | 'decimal' }) field needs this transformer or callers
 * (both server-side math and frontend .toFixed() calls on the JSON
 * response) will break at runtime despite the TS type saying `number`.
 */
export const numericTransformer: ValueTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | null) => (value === null || value === undefined ? value : parseFloat(value)),
};
