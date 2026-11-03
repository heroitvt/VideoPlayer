export type PlayerState =
  | 'INITIALIZING'
  | 'PAIRING'
  | 'SYNCING'
  | 'READY'
  | 'PLAYING'
  | 'BUFFERING'
  | 'OFFLINE'
  | 'ERROR'
  | 'RECOVERING';

export type StateListener = (state: PlayerState, prevState: PlayerState, payload?: any) => void;

export class StateMachine {
  private currentState: PlayerState = 'INITIALIZING';
  private listeners: StateListener[] = [];

  getState(): PlayerState {
    return this.currentState;
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  transition(to: PlayerState, payload?: any): void {
    if (this.currentState === to) return;
    const prev = this.currentState;
    this.currentState = to;
    for (const listener of this.listeners) {
      listener(to, prev, payload);
    }
  }
}
