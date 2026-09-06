import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as localeCore from '../src/core/locale.js';
import enUS from '../src/locales/en-US.js';
import faIR from '../src/locales/fa-IR.js';

describe('locale core system', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.lang = 'en';
    document.documentElement.dir = 'ltr';
    localeCore.locale('en-US', enUS);
    localeCore.locale('fa-IR', faIR);
    localeCore.setCurrentLang('en-US');
  });

  it('normalizes language codes and aliases', () => {
    expect(localeCore.normalizeLang('fa')).toBe('fa-IR');
    expect(localeCore.normalizeLang('fa-IR')).toBe('fa-IR');
    expect(localeCore.normalizeLang('fa_IR')).toBe('fa-IR');
    expect(localeCore.normalizeLang('en')).toBe('en-US');
    expect(localeCore.normalizeLang('en-US')).toBe('en-US');
    expect(localeCore.normalizeLang('en_US')).toBe('en-US');
    expect(localeCore.normalizeLang('')).toBe('en-US');
  });

  it('translates keys in the active locale with fallback', () => {
    localeCore.setCurrentLang('en-US');
    expect(localeCore.t('common.ok')).toBe('OK');
    expect(localeCore.t('common.save')).toBe('Save');

    localeCore.setCurrentLang('fa-IR');
    expect(localeCore.t('common.ok')).toBe('تأیید');
    expect(localeCore.t('common.save')).toBe('ذخیره');
    expect(localeCore.t('common.appName')).toBe('اوپن‌کورس‌دک');
  });

  it('falls back to en-US when key is missing in active locale', () => {
    localeCore.locale('test-LANG', { 'test.custom': 'Custom Value' });
    localeCore.setCurrentLang('test-LANG');
    expect(localeCore.t('test.custom')).toBe('Custom Value');
    expect(localeCore.t('common.save')).toBe('Save');
  });

  it('falls back to key itself when missing everywhere', () => {
    localeCore.setCurrentLang('en-US');
    expect(localeCore.t('non.existent.key')).toBe('non.existent.key');
  });

  it('interpolates parameters correctly and preserves unreplaced params', () => {
    localeCore.setCurrentLang('en-US');
    expect(localeCore.t('notes.wordCount', { count: 42 })).toBe('42 words');
    expect(localeCore.t('pdf.page', { page: 3, total: 10 })).toBe('Page 3 of 10');
    expect(localeCore.t('pdf.page', { page: 3 })).toBe('Page 3 of {total}');
  });

  it('supports lazy evaluation via tf()', () => {
    localeCore.setCurrentLang('en-US');
    const getOk = localeCore.tf('common.ok');
    expect(typeof getOk).toBe('function');
    expect(getOk()).toBe('OK');

    localeCore.setCurrentLang('fa-IR');
    expect(getOk()).toBe('تأیید');
  });

  it('manages RTL direction and persists ocd_lang and ocd_dir to localStorage', () => {
    localeCore.setCurrentLang('fa-IR');
    expect(document.documentElement.lang).toBe('fa-IR');
    expect(document.documentElement.dir).toBe('rtl');
    expect(localStorage.getItem('ocd_lang')).toBe('fa-IR');
    expect(localStorage.getItem('ocd_dir')).toBe('rtl');

    localeCore.setCurrentLang('en-US');
    expect(document.documentElement.lang).toBe('en-US');
    expect(document.documentElement.dir).toBe('ltr');
    expect(localStorage.getItem('ocd_lang')).toBe('en-US');
    expect(localStorage.getItem('ocd_dir')).toBe('ltr');
  });

  it('emits DOM event and bus event on setCurrentLang', () => {
    const domListener = vi.fn();
    window.addEventListener('localechange', domListener);

    const busEmit = vi.fn();
    window.OpenCourseDeck = window.OpenCourseDeck || {};
    window.OpenCourseDeck.bus = { emit: busEmit };

    localeCore.setCurrentLang('fa-IR');

    expect(domListener).toHaveBeenCalled();
    const eventDetail = domListener.mock.calls[0][0].detail;
    expect(eventDetail).toEqual({ lang: 'fa-IR', dir: 'rtl' });
    expect(busEmit).toHaveBeenCalledWith('locale:change', { lang: 'fa-IR', dir: 'rtl' });

    window.removeEventListener('localechange', domListener);
  });

  it('formats numbers with formatNumber helper', () => {
    expect(localeCore.formatNumber(1234.5, 'en-US')).toBe('1,234.5');
    const faFormatted = localeCore.formatNumber(1234, 'fa-IR');
    expect(faFormatted).toBeTruthy();
  });

  it('preserves complete parity between en-US and fa-IR dictionaries', () => {
    const enKeys = Object.keys(enUS);
    const faKeys = Object.keys(faIR);

    expect(enKeys.length).toBe(faKeys.length);
    expect(enKeys.sort()).toEqual(faKeys.sort());

    for (const key of enKeys) {
      const enParams = [...(enUS[key].match(/\{(\w+)\}/g) || [])].sort();
      const faParams = [...(faIR[key].match(/\{(\w+)\}/g) || [])].sort();
      expect(faParams, `Placeholder mismatch on key: ${key}`).toEqual(enParams);
    }
  });

  it('does not contain legacy "پلاسمادک" or untranslated "accent" in fa-IR', () => {
    const faValues = Object.values(faIR);
    for (const val of faValues) {
      expect(val).not.toContain('پلاسمادک');
    }
    expect(faIR['settings.accentColor']).not.toContain('accent');
    expect(faIR['settings.accentColor']).toBe('رنگ تأکیدی');
    expect(faIR['common.appName']).toBe('اوپن‌کورس‌دک');
    expect(faIR['progress.streak']).toBe('زنجیره یادگیری');
    expect(faIR['player.unmute']).toBe('وصل صدا');
  });
});
