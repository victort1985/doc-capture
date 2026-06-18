import { v4 as uuid } from 'uuid';

export interface NamePatternContext {
  place: string;
  username: string;
  docType: string;
  counter: number;
}

export function resolveNamePattern(pattern: string, ctx: NamePatternContext): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 8).replace(/:/g, '-');

  return pattern
    .replace('{date}', date)
    .replace('{time}', time)
    .replace('{place}', sanitize(ctx.place))
    .replace('{username}', sanitize(ctx.username))
    .replace('{docType}', ctx.docType)
    .replace('{counter}', String(ctx.counter).padStart(3, '0'))
    .replace('{uuid}', uuid());
}

export function sanitize(value: string): string {
  return value.replace(/[^a-zA-Z0-9-_]+/g, '_');
}
