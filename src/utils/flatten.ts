export function flattenObject(
  obj: Record<string, unknown>,
  prefix = '',
  separator = '.'
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}${separator}${key}` : key;

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const nested = flattenObject(value as Record<string, unknown>, fullKey, separator);
      Object.assign(result, nested);
    } else {
      result[fullKey] = String(value ?? '');
    }
  }

  return result;
}

export function unflattenObject(
  flat: Record<string, string>,
  separator = '.'
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(flat)) {
    const parts = key.split(separator);
    let current: Record<string, unknown> = result;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (typeof current[part] !== 'object' || current[part] === null) {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }

    current[parts[parts.length - 1]] = value;
  }

  return result;
}

export function getKeyDepth(key: string, separator = '.'): number {
  return key.split(separator).length;
}

export function detectNamingConvention(
  keys: string[]
): 'camelCase' | 'snake_case' | 'kebab-case' | 'PascalCase' | 'mixed' {
  const sample = keys.slice(0, 100);

  let camel = 0;
  let snake = 0;
  let kebab = 0;
  let pascal = 0;

  for (const key of sample) {
    const parts = key.split('.');
    for (const part of parts) {
      if (/^[A-Z][a-zA-Z0-9]*$/.test(part)) pascal++;
      else if (/^[a-z][a-zA-Z0-9]*[A-Z]/.test(part)) camel++;
      else if (/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(part)) snake++;
      else if (/^[a-z][a-z0-9]*(-[a-z0-9]+)+$/.test(part)) kebab++;
    }
  }

  const max = Math.max(camel, snake, kebab, pascal);
  const total = camel + snake + kebab + pascal;

  if (total === 0) return 'snake_case';
  if (max / total < 0.7) return 'mixed';
  if (max === camel) return 'camelCase';
  if (max === snake) return 'snake_case';
  if (max === kebab) return 'kebab-case';
  return 'PascalCase';
}

export function byteSizeOf(obj: Record<string, unknown>): number {
  return Buffer.byteLength(JSON.stringify(obj), 'utf8');
}
