// @ts-nocheck

/**
 * Type definitions for the Honcho pi extension.
 *
 * These mirror Honcho's API schemas (src/schemas/api.py) but only the
 * fields relevant to the extension client.
 */

// ── Request types ──────────────────────────────────────────────────────────

export interface WorkspaceCreate {
	id: string;
	metadata?: Record<string, unknown>;
}

export interface PeerCreate {
	id: string;
	metadata?: Record<string, unknown>;
}

export interface SessionCreate {
	id: string;
	peers?: Record<string, { observer?: string[] }>;
	metadata?: Record<string, unknown>;
}

export interface MessageCreate {
	peer_id: string;
	content: string;
	metadata?: Record<string, unknown>;
	created_at?: string;
}

export interface ConclusionCreate {
	observer_id: string;
	observed_id: string;
	content: string;
	session_id?: string;
}

export interface DialecticOptions {
	session_id?: string;
	target?: string;
	query: string;
	stream?: boolean;
	reasoning_level?: "minimal" | "low" | "medium" | "high" | "max";
}

export interface ConclusionQuery {
	query: string;
	top_k?: number;
	distance?: number;
	filters?: Record<string, unknown>;
}

// ── Response types ─────────────────────────────────────────────────────────

export interface HonchoResource {
	id: string;
	workspace_id: string;
	created_at: string;
	metadata?: Record<string, unknown>;
}

export interface HonchoSession extends HonchoResource {
	is_active: boolean;
}

export interface HonchoMessage {
	id: string;
	peer_id: string;
	session_id: string;
	workspace_id: string;
	content: string;
	created_at: string;
	token_count: number;
	metadata?: Record<string, unknown>;
}

export interface HonchoConclusion {
	id: string;
	content: string;
	observer_id: string;
	observed_id: string;
	session_id?: string;
	created_at: string;
}

export interface DialecticResponse {
	content: string | null;
}

export interface RepresentationResponse {
	representation: string;
}

// ── Extension state ────────────────────────────────────────────────────────

export interface HonchoState {
	apiUrl: string;
	workspaceId: string;
	peerId: string;
	sessionId: string;
	initialized: boolean;
}
