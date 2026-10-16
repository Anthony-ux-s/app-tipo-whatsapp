import { describe, expect, it } from 'vitest';
import { collectMentions, filterCandidates, findMentionQuery, insertMention, segmentMentions } from './mentions.utils';

const people = [
  { id: 'a', displayName: 'Andrés Rojas' },
  { id: 'v', displayName: 'Valentina Castro' },
  { id: 'l', displayName: 'Laura Méndez' },
];

describe('menciones con @', () => {
  it('detecta la mención que se está escribiendo junto al cursor', () => {
    expect(findMentionQuery('Hola @and', 9)).toEqual({ start: 5, query: 'and' });
    expect(findMentionQuery('@', 1)).toEqual({ start: 0, query: '' });
    expect(findMentionQuery('correo@empresa.com', 18)).toBeNull();
    expect(findMentionQuery('Hola @and ya', 12)).toBeNull();
  });

  it('sugiere por nombre o apellido, sin tildes', () => {
    expect(filterCandidates(people, 'andres').map((p) => p.id)).toEqual(['a']);
    expect(filterCandidates(people, 'mendez').map((p) => p.id)).toEqual(['l']);
    expect(filterCandidates(people, '')).toHaveLength(3);
  });

  it('inserta el nombre completo y deja el cursor después', () => {
    const result = insertMention('Hola @and, ¿vienes?', { start: 5, query: 'and' }, 9, 'Andrés Rojas');
    expect(result.text).toBe('Hola @Andrés Rojas , ¿vienes?');
    expect(result.caret).toBe(19);
  });

  it('solo cuenta las menciones que siguen en el texto al enviar', () => {
    expect(collectMentions('@Andrés Rojas y @Laura Méndez revisen', people)).toEqual(['a', 'l']);
    expect(collectMentions('ya no menciono a nadie', people)).toEqual([]);
  });

  it('parte el texto para resaltar cada mención y marca la mía', () => {
    const segments = segmentMentions('Ok @Laura Méndez y @Andrés Rojas.', [people[0], people[2]], 'l');
    expect(segments.map((s) => [s.text, s.mention?.self ?? null])).toEqual([
      ['Ok ', null],
      ['@Laura Méndez', true],
      [' y ', null],
      ['@Andrés Rojas', false],
      ['.', null],
    ]);
  });
});
