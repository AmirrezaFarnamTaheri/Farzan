import { describe, expect, it } from 'vitest';
import { normalizeSearchQuery, rankLexicalMatches } from '../src/core/searchRanking.js';

describe('shared topbar and command-palette lexical ranking', () => {
  it('puts exact labels before prefixes, substring labels and descriptions', () => {
    const items = [
      { id: 'desc', label: 'Intro', description: 'Cardiology basics' },
      { id: 'middle', label: 'Clinical cardiology review' },
      { id: 'prefix', label: 'Cardiology notes' },
      { id: 'exact', label: 'Cardiology' },
    ];
    expect(rankLexicalMatches(items, 'cardiology').map(x => x.id))
      .toEqual(['exact','prefix','middle','desc']);
  });

  it('normalizes Arabic and Persian yeh/kaf, mixed-script spacing, and Unicode variants', () => {
    expect(normalizeSearchQuery('  فيزيكِ   كليه  ')).toBe(normalizeSearchQuery('فیزیک کلیه'));
    const items = [
      { id: 'persian', label: 'فیزیک کلیه' },
      { id: 'english', label: 'Physiology' },
    ];
    expect(rankLexicalMatches(items, 'فيزيك كليه').map(x => x.id)).toEqual(['persian']);
  });

  it('maintains stable order for equally-ranked matches and limits only after ranking', () => {
    const items=[{id:1,label:'biology one'}, {id:2,label:'Biology two'}, {id:3,label:'biology'}];
    expect(rankLexicalMatches(items,'BIOLOGY',{limit:2}).map(x=>x.id)).toEqual([3,1]);
  });

  it('includes note tags, catalog keywords and category text in low-cost fallback ranking', () => {
    const corpus = [
      { id: 'note', label: 'Study notes', tags: ['كليه', 'Cardiology'] },
      { id: 'topic', label: 'Chapter A', keywords: ['Physiology', 'Nephrology'] },
      { id: 'media', label: 'My video', category: 'Downloaded media' },
    ];
    expect(rankLexicalMatches(corpus, 'کلیه').map(item => item.id)).toEqual(['note']);
    expect(rankLexicalMatches(corpus, 'nephrology').map(item => item.id)).toEqual(['topic']);
    expect(rankLexicalMatches(corpus, 'downloaded media').map(item => item.id)).toEqual(['media']);
    // Explicit command-only vocabulary must remain limited to label.
    expect(rankLexicalMatches(corpus, 'nephrology', { keys: ['label'] })).toEqual([]);
  });

  it('filters unsafe record types and supports labels-only command searching', () => {
    const items = [null, { label:'Other',description:'plasma' }, { label:'Plasma theme', cat:'theme' }];
    expect(rankLexicalMatches(items,'plasma',{keys:['label']}).map(x=>x.label)).toEqual(['Plasma theme']);
    expect(rankLexicalMatches([], 'query')).toEqual([]);
    expect(rankLexicalMatches([{label:'Nothing'}], 'unknown')).toEqual([]);
  });
});
