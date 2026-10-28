import { describe, expect, it } from 'vitest';
import { changedFields, type EntryDraft } from './EntryForm';

const base: EntryDraft = { kind: 'event', title: 'Cine', date: '2026-10-25', time: '18:00', repeat: 'none', alert: 30, categoryId: 'c1' };

describe('guardar un plan abierto', () => {
  it('solo se guarda lo que se ha tocado', () => {
    expect(changedFields(base, { ...base, alert: 60 })).toEqual({ alert: 60 });
    expect(changedFields(base, { ...base })).toEqual({});
  });

  it('quitar un dato también cuenta como cambio', () => {
    expect(changedFields({ ...base, location: 'Kinépolis' }, { ...base, location: undefined })).toEqual({ location: undefined });
    expect(changedFields(base, { ...base, alert: null })).toEqual({ alert: null });
  });
});
