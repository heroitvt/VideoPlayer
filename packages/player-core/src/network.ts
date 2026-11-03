export type NetworkListener = (online: boolean) => void;

export class NetworkMonitor {
  private online = true;
  private listeners: NetworkListener[] = [];

  constructor() {
    if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
      this.online = navigator.onLine;
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.setOnline(true));
      window.addEventListener('offline', () => this.setOnline(false));
    }
  }

  isOnline(): boolean {
    return this.online;
  }

  setOnline(status: boolean): void {
    if (this.online === status) return;
    this.online = status;
    for (const l of this.listeners) {
      l(status);
    }
  }

  subscribe(listener: NetworkListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }
}
