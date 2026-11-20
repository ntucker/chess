import { describe, expect, it, jest } from '@jest/globals';

import { NewVersionError } from '@/files/newVersion';

import { getLesson, LESSONS } from './lesson';

// Whether the site serves a newer build, without fetching its HTML.
let mockReplaced = false;
jest.mock('@/files/newVersion', () => {
  const actual = jest.requireActual<typeof import('@/files/newVersion')>('@/files/newVersion');
  return {
    ...actual,
    explainLoadFailure: async (error: unknown) =>
      mockReplaced ? new actual.NewVersionError({ cause: error }) : error,
  };
});

describe('getLesson on the web', () => {
  const missing = new Error('Loading module caro-kann-old.js failed.');

  it('fails with a NewVersionError when a newer build removed the lesson’s file', async () => {
    jest.spyOn(LESSONS, 'caro-kann').mockRejectedValueOnce(missing);
    mockReplaced = true;
    await expect(getLesson('caro-kann')).rejects.toBeInstanceOf(NewVersionError);
  });

  it('keeps any other failure', async () => {
    jest.spyOn(LESSONS, 'caro-kann').mockRejectedValueOnce(missing);
    mockReplaced = false;
    await expect(getLesson('caro-kann')).rejects.toBe(missing);
  });
});
