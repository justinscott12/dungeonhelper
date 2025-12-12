import { z } from 'zod';

// Core data schemas
export const MechanicSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: z.enum(['puzzle', 'boss', 'traversal', 'add-clear', 'symbol', 'plate', 'other']),
  solution: z.string().optional(),
  tips: z.array(z.string()).optional(),
  relatedMechanics: z.array(z.string()).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard', 'expert']).optional(),
  contestModeSpecific: z.boolean().optional(),
  contestModeNotes: z.string().optional(),
});

export const EncounterSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: z.enum(['opening', 'encounter', 'boss', 'secret', 'traversal']),
  mechanics: z.array(MechanicSchema),
  order: z.number().optional(),
});

export const DungeonRaidSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['raid', 'dungeon']),
  description: z.string(),
  encounters: z.array(EncounterSchema),
  releaseDate: z.string().optional(),
  contestModeDate: z.string().optional(),
});

// TypeScript types
export type Mechanic = z.infer<typeof MechanicSchema>;
export type Encounter = z.infer<typeof EncounterSchema>;
export type DungeonRaid = z.infer<typeof DungeonRaidSchema>;

// Vector store metadata
export interface VectorMetadata {
  mechanicId: string;
  mechanicName: string;
  encounterId: string;
  encounterName: string;
  encounterOrder?: number; // Order of encounter (1, 2, 3, etc.)
  dungeonRaidId: string;
  dungeonRaidName: string;
  dungeonRaidType: 'raid' | 'dungeon';
  mechanicType: string;
  encounterType: string;
  difficulty?: string;
  contestModeSpecific?: boolean;
}

// Search and API types
export interface SearchResult {
  id: string;
  score: number;
  mechanic: Mechanic;
  encounter: Encounter;
  dungeonRaid: {
    id: string;
    name: string;
    type: 'raid' | 'dungeon';
  };
}

export interface SearchRequest {
  query: string;
  filters?: {
    dungeonRaidName?: string;
    encounterType?: string;
    mechanicType?: string;
    difficulty?: string;
    contestModeOnly?: boolean;
  };
  limit?: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
}

export interface ChatRequest {
  messages: ChatMessage[];
  query: string;
  filters?: {
    dungeonRaidName?: string;
    encounterType?: string;
    mechanicType?: string;
  };
}

export interface EmbedRequest {
  text: string;
}

export interface IngestRequest {
  mechanics: Array<{
    mechanic: Mechanic;
    encounter: Encounter;
    dungeonRaid: DungeonRaid;
  }>;
}

// Session-specific types for Day 1 capture
export interface SessionMechanic {
  id: string;
  name: string;
  description: string;
  encounter: string;
  type?: 'puzzle' | 'boss' | 'traversal' | 'add-clear' | 'symbol' | 'plate' | 'other';
  difficulty?: 'easy' | 'medium' | 'hard' | 'expert';
  discoveredAt: Date;
  status: 'discovered' | 'testing' | 'confirmed' | 'solved';
  solution?: string;
  tips?: string[];
}

export interface EncounterContext {
  id: string;
  name: string;
  order: number;
  startedAt: Date;
}

export interface Session {
  id: string;
  dungeonName: string;
  startTime: Date;
  currentEncounter?: string;
  mechanics: SessionMechanic[];
  encounters: EncounterContext[];
}

export interface CreateSessionRequest {
  dungeonName: string;
  currentEncounter?: string;
}

export interface CaptureMechanicRequest {
  sessionId: string;
  name: string;
  description: string;
  encounter: string;
  type?: SessionMechanic['type'];
  difficulty?: SessionMechanic['difficulty'];
  solution?: string;
  tips?: string[];
}

export interface UpdateMechanicRequest {
  sessionId: string;
  mechanicId: string;
  name?: string;
  description?: string;
  encounter?: string;
  type?: SessionMechanic['type'];
  difficulty?: SessionMechanic['difficulty'];
  status?: SessionMechanic['status'];
  solution?: string;
  tips?: string[];
}
