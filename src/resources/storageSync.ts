import type { Controller, Manager, Middleware } from '@data-client/react';

import { subscribeStorage } from '@/context/storage';

/**
 * Takes in what another tab saves under `key` (the web's `storage` event),
 * so each tab shows what all of them saved: `load` puts what is saved now
 * into the store. Native has one window.
 */
export class StorageSync implements Manager {
  private controller?: Controller;
  private unsubscribe?: () => void;

  constructor(
    private readonly key: string,
    private readonly load: (controller: Controller) => void,
  ) {}

  middleware: Middleware = (controller) => {
    this.controller = controller;
    return (next) => next;
  };

  // What is saved now, not the event's value: this tab may have saved
  // something newer since the other tab's save queued the event.
  private loadSaved = () => {
    if (this.controller) this.load(this.controller);
  };

  init() {
    this.unsubscribe = subscribeStorage(this.key, this.loadSaved);
  }

  cleanup() {
    this.unsubscribe?.();
  }
}
