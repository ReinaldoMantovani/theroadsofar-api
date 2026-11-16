import { ValueTransformer } from 'typeorm';

/**
 * JSON guardado em LONGTEXT (portável entre MySQL 8 e MariaDB da Hostinger).
 * Nunca lança erro na leitura: um valor corrompido vira o valor padrão.
 */
export const jsonText = <T>(fallback: T): ValueTransformer => ({
  to: (value: T | null | undefined) => (value === undefined ? undefined : value === null ? null : JSON.stringify(value)),
  from: (value: string | null) => {
    if (value === null || value === undefined || value === '') return fallback;
    if (typeof value !== 'string') return value as unknown as T;
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  },
});

/** DECIMAL chega do driver como string — converte para number */
export const decimalNumber: ValueTransformer = {
  to: (v: number | null | undefined) => v,
  from: (v: string | null) => (v === null || v === undefined ? null : Number(v)),
};
