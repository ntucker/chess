// Helpers for the endpoint tests in this folder. Metro bundles only what the
// app imports, so this never ships.
import { Controller, NetworkManager } from '@data-client/react';
import { initialState, prepareStore } from '@data-client/react/redux';

/** A fresh Data Client store's controller, as the app's DataProvider gives. */
export const newController = () =>
  prepareStore(initialState, () => [new NetworkManager()], Controller).controller;

/**
 * Waits until a scripted Stockfish, whose commands are recorded in `sent`,
 * starts searching after `moves` (space-separated UCI). The store calls the
 * endpoint asynchronously, so the search starts a few ticks after the fetch.
 */
export async function waitForSearch(sent: readonly string[], moves: string) {
  for (let tick = 0; !sent.includes(`position startpos moves ${moves}`); tick++) {
    if (tick > 100) throw new Error(`Stockfish never searched ${moves}`);
    await new Promise((resolve) => setTimeout(resolve));
  }
}
