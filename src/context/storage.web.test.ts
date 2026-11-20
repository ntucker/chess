import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { readStorage, subscribeStorage, writeStorage } from './storage';

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

  it("reads another tab's save over what this visit could not save", () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('QuotaExceededError');
    });
    writeStorage('test', 'mine');
    const onChange = jest.fn();
    const unsubscribe = subscribeStorage('test', onChange);
    localStorage.setItem('test', 'theirs');
    window.dispatchEvent(new StorageEvent('storage', { key: 'other' }));
    expect(onChange).not.toHaveBeenCalled();
    window.dispatchEvent(new StorageEvent('storage', { key: 'test' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(readStorage('test')).toBe('theirs');
    unsubscribe();
  });
});
