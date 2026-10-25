import { Injectable, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';

/** The browser's "add to home screen" offer, which it gives once and expects back on a click. */
interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * The shop as an app on the phone: offers "Install app" where the browser allows it,
 * and "Update" when a new version of the site has been downloaded in the background.
 */
@Injectable({ providedIn: 'root' })
export class AppInstall {
  private updates = inject(SwUpdate);
  private offer: InstallPrompt | null = null;

  readonly canInstall = signal(false);
  readonly updateReady = signal(false);

  constructor() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.offer = e as InstallPrompt;
      this.canInstall.set(true);
    });
    window.addEventListener('appinstalled', () => {
      this.offer = null;
      this.canInstall.set(false);
    });
    if (this.updates.isEnabled) {
      this.updates.versionUpdates.subscribe((e) => {
        if (e.type === 'VERSION_READY') this.updateReady.set(true);
      });
    }
  }

  async install() {
    if (!this.offer) return;
    await this.offer.prompt();
    await this.offer.userChoice;
    this.offer = null;
    this.canInstall.set(false);
  }

  update() {
    document.location.reload();
  }
}
