import { AsyncLocalStorage } from 'node:async_hooks';

// A request owns its language. In-flight authorization keeps that language even
// when the native window changes its selection before the callback arrives.
const languages = new AsyncLocalStorage();
export function normalizeLanguage(value) { return /^en(?:-|$)/i.test(String(value)) ? 'en' : 'zh-CN'; }
export function currentLanguage() { return languages.getStore() || normalizeLanguage(process.env.CA_SETUP_LANGUAGE); }
export function withLanguage(language, work) { return languages.run(normalizeLanguage(language), work); }
export function t(zh, en) { return currentLanguage() === 'en' ? en : zh; }

// Keep the original message available so cached login errors follow a later
// language change without losing error codes or exposing provider response data.
export class SetupError extends Error {
  constructor(zh, en) {
    super();
    Object.defineProperty(this, 'message', { configurable: true, get: () => typeof zh === 'function' ? zh() : t(zh, en) });
  }
}
