import type { Session, SessionMechanic, EncounterContext } from './types';

// In-memory session store
const sessions = new Map<string, Session>();

/**
 * Create a new session
 */
export function createSession(dungeonName: string, currentEncounter?: string): Session {
  const session: Session = {
    id: `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    dungeonName,
    startTime: new Date(),
    currentEncounter,
    mechanics: [],
    encounters: currentEncounter ? [{
      id: `encounter-${Date.now()}`,
      name: currentEncounter,
      order: 1,
      startedAt: new Date(),
    }] : [],
  };

  sessions.set(session.id, session);
  return session;
}

/**
 * Get a session by ID
 */
export function getSession(sessionId: string): Session | undefined {
  return sessions.get(sessionId);
}

/**
 * Get all sessions
 */
export function getAllSessions(): Session[] {
  return Array.from(sessions.values());
}

/**
 * Update session metadata
 */
export function updateSession(
  sessionId: string,
  updates: Partial<Pick<Session, 'dungeonName' | 'currentEncounter'>>
): Session | null {
  const session = sessions.get(sessionId);
  if (!session) return null;

  if (updates.dungeonName !== undefined) {
    session.dungeonName = updates.dungeonName;
  }

  if (updates.currentEncounter !== undefined) {
    session.currentEncounter = updates.currentEncounter;
    
    // Add encounter to encounters list if it doesn't exist
    const existingEncounter = session.encounters.find(e => e.name === updates.currentEncounter);
    if (!existingEncounter && updates.currentEncounter) {
      session.encounters.push({
        id: `encounter-${Date.now()}`,
        name: updates.currentEncounter,
        order: session.encounters.length + 1,
        startedAt: new Date(),
      });
    }
  }

  sessions.set(sessionId, session);
  return session;
}

/**
 * Add a mechanic to a session
 */
export function addMechanic(sessionId: string, mechanic: Omit<SessionMechanic, 'id' | 'discoveredAt'>): SessionMechanic | null {
  const session = sessions.get(sessionId);
  if (!session) return null;

  const newMechanic: SessionMechanic = {
    ...mechanic,
    id: `mechanic-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    discoveredAt: new Date(),
    status: mechanic.status || 'discovered',
  };

  session.mechanics.push(newMechanic);
  sessions.set(sessionId, session);
  return newMechanic;
}

/**
 * Update a mechanic in a session
 */
export function updateMechanic(
  sessionId: string,
  mechanicId: string,
  updates: Partial<Omit<SessionMechanic, 'id' | 'discoveredAt'>>
): SessionMechanic | null {
  const session = sessions.get(sessionId);
  if (!session) return null;

  const mechanicIndex = session.mechanics.findIndex(m => m.id === mechanicId);
  if (mechanicIndex === -1) return null;

  session.mechanics[mechanicIndex] = {
    ...session.mechanics[mechanicIndex],
    ...updates,
  };

  sessions.set(sessionId, session);
  return session.mechanics[mechanicIndex];
}

/**
 * Delete a mechanic from a session
 */
export function deleteMechanic(sessionId: string, mechanicId: string): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;

  const mechanicIndex = session.mechanics.findIndex(m => m.id === mechanicId);
  if (mechanicIndex === -1) return false;

  session.mechanics.splice(mechanicIndex, 1);
  sessions.set(sessionId, session);
  return true;
}

/**
 * Search mechanics within a session
 */
export function searchSessionMechanics(
  sessionId: string,
  query: string
): SessionMechanic[] {
  const session = sessions.get(sessionId);
  if (!session) return [];

  const queryLower = query.toLowerCase();
  return session.mechanics.filter(mechanic => {
    return (
      mechanic.name.toLowerCase().includes(queryLower) ||
      mechanic.description.toLowerCase().includes(queryLower) ||
      mechanic.encounter.toLowerCase().includes(queryLower) ||
      mechanic.solution?.toLowerCase().includes(queryLower) ||
      mechanic.tips?.some(tip => tip.toLowerCase().includes(queryLower))
    );
  });
}

/**
 * Delete a session
 */
export function deleteSession(sessionId: string): boolean {
  return sessions.delete(sessionId);
}

/**
 * Get the most recent session (for convenience)
 */
export function getLatestSession(): Session | undefined {
  const allSessions = getAllSessions();
  if (allSessions.length === 0) return undefined;
  
  return allSessions.sort((a, b) => b.startTime.getTime() - a.startTime.getTime())[0];
}
