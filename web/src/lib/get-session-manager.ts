import { SessionManager } from './session-manager';

export function getSessionManager(): SessionManager {
  const sm = (global as any).sessionManager as SessionManager;
  if (!sm) {
    throw new Error('SessionManager is not initialized on global object. Make sure you are running via server.ts');
  }
  return sm;
}
