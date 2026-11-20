import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { readStorage, writeStorage } from './storage';

afterEach(() => {
  jest.restoreAllMocks();
  localStorage.clear();
});

describe('storage', () => {
  it('keeps what it could not save for the rest of the visit', () => {
    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    writeStorage('test', 'first');
    expect(readStorage('test')).toBe('first');

    // Once storage works again, the saved text is read from it.
    setItem.mockRestore();
    writeStorage('test', 'second');
    expect(localStorage.getItem('test')).toBe('second');
    expect(readStorage('test')).toBe('second');
  });
});
