// @ts-nocheck

/**
 * Honcho API client for the pi extension.
 *
 * Thin fetch-based wrapper around the Honcho REST API. No external
 * dependencies beyond the Node.js built-in fetch (Node 18+).
 *
 * All methods throw on non-2xx responses so the extension can handle
 * errors at the orchestration level.
 */

import type {
	ConclusionCreate,
	ConclusionQuery,
	DialecticOptions,
	DialecticResponse,
	HonchoConclusion,
	HonchoMessage,
	HonchoSession,
	MessageCreate,
	PeerCreate,
	RepresentationResponse,
	SessionCreate,
	WorkspaceCreate,
} from "./types";

export class HonchoClient {
	constructor(private baseUrl: string) {}

	// ── Helpers ────────────────────────────────────────────────────────────

	private async request<T>(
		method: string,
		path: string,
		body?: unknown,
	): Promise<T> {
		const url = `${this.baseUrl}${path}`;
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};

		const response = await fetch(url, {
			method,
			headers,
			body: body !== undefined ? JSON.stringify(body) : undefined,
		});

		if (!response.ok) {
			const text = await response.text().catch(() => "");
			throw new Error(
				`Honcho ${method} ${path} → ${response.status}: ${text.slice(0, 500)}`,
			);
		}

		return response.json() as Promise<T>;
	}

	// ── Workspaces ─────────────────────────────────────────────────────────

	async createWorkspace(data: WorkspaceCreate) {
		return this.request("POST", `/v3/workspaces`, data);
	}

	async getWorkspace(id: string) {
		return this.request("GET", `/v3/workspaces/${id}`);
	}

	// ── Peers ──────────────────────────────────────────────────────────────

	async createPeer(workspaceId: string, data: PeerCreate) {
		return this.request("POST", `/v3/workspaces/${workspaceId}/peers`, data);
	}

	async getPeer(workspaceId: string, peerId: string) {
		return this.request("GET", `/v3/workspaces/${workspaceId}/peers/${peerId}`);
	}

	// ── Sessions ───────────────────────────────────────────────────────────

	async createSession(workspaceId: string, data: SessionCreate) {
		return this.request("POST", `/v3/workspaces/${workspaceId}/sessions`, data);
	}

	async getSession(
		workspaceId: string,
		sessionId: string,
	): Promise<HonchoSession> {
		return this.request(
			"GET",
			`/v3/workspaces/${workspaceId}/sessions/${sessionId}`,
		);
	}

	// ── Messages ───────────────────────────────────────────────────────────

	async createMessages(
		workspaceId: string,
		sessionId: string,
		messages: MessageCreate[],
	): Promise<HonchoMessage[]> {
		return this.request(
			"POST",
			`/v3/workspaces/${workspaceId}/sessions/${sessionId}/messages`,
			{ messages },
		);
	}

	async listMessages(
		workspaceId: string,
		sessionId: string,
		filters?: Record<string, unknown>,
	): Promise<{ items: HonchoMessage[] }> {
		return this.request(
			"POST",
			`/v3/workspaces/${workspaceId}/sessions/${sessionId}/messages/list`,
			{ filters },
		);
	}

	// ── Conclusions ────────────────────────────────────────────────────────

	async createConclusions(
		workspaceId: string,
		conclusions: ConclusionCreate[],
	): Promise<HonchoConclusion[]> {
		return this.request("POST", `/v3/workspaces/${workspaceId}/conclusions`, {
			conclusions,
		});
	}

	async queryConclusions(
		workspaceId: string,
		query: ConclusionQuery,
	): Promise<{ items: HonchoConclusion[] }> {
		return this.request(
			"POST",
			`/v3/workspaces/${workspaceId}/conclusions/query`,
			query,
		);
	}

	// ── Dialectic / Chat ───────────────────────────────────────────────────

	async dialecticChat(
		workspaceId: string,
		peerId: string,
		options: DialecticOptions,
	): Promise<DialecticResponse> {
		return this.request(
			"POST",
			`/v3/workspaces/${workspaceId}/peers/${peerId}/chat`,
			options,
		);
	}

	// ── Representation ─────────────────────────────────────────────────────

	async getRepresentation(
		workspaceId: string,
		peerId: string,
		options: {
			session_id?: string;
			target?: string;
			search_query?: string;
			search_top_k?: number;
			max_conclusions?: number;
		},
	): Promise<RepresentationResponse> {
		return this.request(
			"POST",
			`/v3/workspaces/${workspaceId}/peers/${peerId}/representation`,
			options,
		);
	}
}
