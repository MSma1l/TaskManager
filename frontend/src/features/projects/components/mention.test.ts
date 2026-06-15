import { describe, expect, it } from 'vitest';
import { detectMention, insertMention } from './mention';

describe('detectMention', () => {
  it('detects a token typed at the start of the input', () => {
    const text = '@an';
    expect(detectMention(text, text.length)).toEqual({ query: 'an', start: 0 });
  });

  it('detects a token after a whitespace boundary', () => {
    const text = 'hello @an';
    expect(detectMention(text, text.length)).toEqual({ query: 'an', start: 6 });
  });

  it('detects an empty token right after typing "@"', () => {
    const text = 'hi @';
    expect(detectMention(text, text.length)).toEqual({ query: '', start: 3 });
  });

  it('returns null when there is no "@" before the caret', () => {
    const text = 'just some text';
    expect(detectMention(text, text.length)).toBeNull();
  });

  it('does not trigger mid-word (e.g. inside an email)', () => {
    const text = 'mail user@host';
    expect(detectMention(text, text.length)).toBeNull();
  });

  it('returns null once a space ends the token', () => {
    const text = '@anna ';
    expect(detectMention(text, text.length)).toBeNull();
  });

  it('only considers text up to the caret, ignoring trailing content', () => {
    const text = 'hey @an more words';
    const caret = 'hey @an'.length;
    expect(detectMention(text, caret)).toEqual({ query: 'an', start: 4 });
  });
});

describe('insertMention', () => {
  it('replaces the active token with "@username " (trailing space)', () => {
    const text = 'hi @an';
    const res = insertMention(text, text.length, 'anna');
    expect(res.text).toBe('hi @anna ');
    expect(res.caret).toBe('hi @anna '.length);
  });

  it('replaces an empty token', () => {
    const text = 'hi @';
    const res = insertMention(text, text.length, 'bob');
    expect(res.text).toBe('hi @bob ');
  });

  it('preserves text after the caret', () => {
    const text = 'hi @an!';
    const caret = 'hi @an'.length;
    const res = insertMention(text, caret, 'anna');
    expect(res.text).toBe('hi @anna !');
    expect(res.caret).toBe('hi @anna '.length);
  });

  it('inserts at the start of the input', () => {
    const text = '@a';
    const res = insertMention(text, text.length, 'admin');
    expect(res.text).toBe('@admin ');
    expect(res.caret).toBe('@admin '.length);
  });
});
