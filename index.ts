// @ts-nocheck — pi extension, types resolved by pi runtime (jiti)

/**
 * Honcho pi extension — memory layer integration.
 *
 * Automatically syncs pi conversations to a local Honcho instance and
 * exposes tools for the LLM to query long-term memory.
 *
 * Honcho stores:
 *   - Messages in per-session storage (auto-synced after each turn)
 *   - Conclusions (facts/inferences) extracted by Honcho's Deriver
 *   - A Dialectic agent that answers questions about stored context
 *
 * API: POST /v3/workspaces/{wid}/peers/{pid}/chat
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { HonchoClient } from "./api";
import type { HonchoState } from "./types";

// ── Configuration ──────────────────────────────────────────────────────────

const DEFAULT_API_URL = "http://localhost:8000";

/** Derive a stable, URL-safe workspace name from the project directory. */
function deriveWorkspaceName(cwd: string): string {
	const dir = cwd.split("/").pop() || "pi";
	return dir.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

/** Derive a stable peer name from OS user. */
function derivePeerName(): string {
	const user = process.env.USER || process.env.USERNAME || "pi-user";
	return user.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

/** Unique session name: pi session file basename or timestamp. */
function deriveSessionName(sessionFile?: string): string {
	if (sessionFile) {
		const base = sessionFile.split("/").pop()?.replace(".jsonl", "") || "";
		return `pi-${base.slice(0, 55)}`;
	}
	return `pi-${Date.now()}`;
}

// ── State helpers ──────────────────────────────────────────────────────────

const STATE_KEY = "honcho-state";

function saveState(pi: ExtensionAPI, state: HonchoState): void {
	pi.appendEntry(STATE_KEY, state);
}

function loadState(
	entries: Array<{ type: string; customType?: string; data?: unknown }>,
): HonchoState | null {
	for (const entry of entries) {
		if (
			entry.type === "custom" &&
			entry.customType === STATE_KEY &&
			entry.data
		) {
			return entry.data as HonchoState;
		}
	}
	return null;
}

// ── Honcho initialization ──────────────────────────────────────────────────

async function initializeHoncho(
	client: HonchoClient,
	pi: ExtensionAPI,
	cwd: string,
	sessionFile?: string,
): Promise<HonchoState> {
	const workspaceId = deriveWorkspaceName(cwd);
	const peerId = derivePeerName();
	const sessionId = deriveSessionName(sessionFile);

	// Ensure workspace exists (idempotent)
	try {
		await client.getWorkspace(workspaceId);
	} catch {
		await client.createWorkspace({ id: workspaceId });
	}

	// Ensure user peer and agent peer exist (idempotent)
	for (const pid of [peerId, `${peerId}-agent`]) {
		try {
			await client.getPeer(workspaceId, pid);
		} catch {
			await client.createPeer(workspaceId, { id: pid });
		}
	}

	// Create a new Honcho session for this pi session
	await client.createSession(workspaceId, {
		id: sessionId,
		peers: {
			[peerId]: {},
		},
	});

	const state: HonchoState = {
		apiUrl: client["baseUrl"],
		workspaceId,
		peerId,
		sessionId,
		initialized: true,
	};

	saveState(pi, state);
	return state;
}

// ── Message syncing ────────────────────────────────────────────────────────

interface ConversationMessage {
	role: string;
	content: Array<{ type: string; text?: string }> | string;
}

async function syncMessages(
	client: HonchoClient,
	state: HonchoState,
	messages: ConversationMessage[],
): Promise<void> {
	const toSync: Array<{ peer_id: string; content: string }> = [];

	for (const msg of messages) {
		const role = msg.role;
		if (role === "system" || role === "tool") continue;

		const text =
			typeof msg.content === "string"
				? msg.content
				: msg.content
						?.filter((c) => c.type === "text")
						.map((c) => c.text)
						.join("\n") || "";

		if (!text.trim()) continue;

		// Map pi roles to Honcho peer_ids:
		// - "user" messages come from the user peer
		// - "assistant" messages come from a special "pi-agent" peer or the user peer
		const peerId = role === "user" ? state.peerId : `${state.peerId}-agent`;
		toSync.push({ peer_id: peerId, content: text });
	}

	if (toSync.length === 0) return;

	// Honcho accepts batches up to 100
	for (let i = 0; i < toSync.length; i += 100) {
		const batch = toSync.slice(i, i + 100);
		await client.createMessages(state.workspaceId, state.sessionId, batch);
	}
}

// ── Extension entry point ──────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	let state: HonchoState | null = null;
	let client: HonchoClient | null = null;

	function getState(): HonchoState | null {
		return state?.initialized ? state : null;
	}

	function getClient(): HonchoClient | null {
		return client;
	}

	// ── Session lifecycle ─────────────────────────────────────────────────

	pi.on("session_start", async (event, ctx) => {
		const apiUrl = process.env.HONCHO_API_URL || DEFAULT_API_URL;
		client = new HonchoClient(apiUrl);

		// Try to restore previous state
		const entries = ctx.sessionManager.getEntries();
		const restored = loadState(entries);

		if (restored && restored.apiUrl === apiUrl) {
			state = restored;

			// Create a new Honcho session for this pi session
			try {
				const sessionId = deriveSessionName(
					event.previousSessionFile ||
						ctx.sessionManager.getSessionFile() ||
						undefined,
				);
				state.sessionId = sessionId;
				await client.createSession(state.workspaceId, {
					id: sessionId,
					peers: { [state.peerId]: {} },
				});
				saveState(pi, state);
				ctx.ui.setStatus(
					"honcho",
					`🟢 Honcho: ${state.workspaceId}/${state.peerId}`,
				);
			} catch (err) {
				ctx.ui.setStatus("honcho", `🔴 Honcho offline`);
				state = null;
			}
		} else {
			// Fresh initialization
			try {
				state = await initializeHoncho(
					client,
					pi,
					ctx.cwd,
					event.previousSessionFile,
				);
				ctx.ui.setStatus(
					"honcho",
					`🟢 Honcho: ${state.workspaceId}/${state.peerId}`,
				);
			} catch (err) {
				ctx.ui.setStatus("honcho", `🔴 Honcho offline`);
				state = null;
			}
		}
	});

	pi.on("agent_end", async (event, ctx) => {
		const s = getState();
		const c = getClient();
		if (!s || !c) return;

		try {
			// event.messages contains the messages from this agent turn
			const msgs = event.messages as ConversationMessage[];
			if (msgs && msgs.length > 0) {
				await syncMessages(c, s, msgs);
			}
		} catch {
			// Silently fail — don't disrupt the user
		}
	});

	pi.on("session_shutdown", async (_event, _ctx) => {
		// State persists via appendEntry; just clear memory
		state = null;
		client = null;
	});

	// ── Tools ──────────────────────────────────────────────────────────────

	pi.registerTool({
		name: "honcho_memory",
		label: "Honcho Memory",
		description:
			"Query Honcho's long-term memory about a user, topic, or past conversation. " +
			"Honcho uses an LLM (Dialectic agent) to answer questions grounded in stored facts " +
			"and session history. Use this to recall user preferences, past decisions, " +
			"or context from previous sessions.",
		promptSnippet:
			"Query Honcho memory layer for stored context about users, topics, or past conversations",
		promptGuidelines: [
			"Use honcho_memory to recall user preferences, past decisions, or context from previous sessions before answering the user.",
			"If the user refers to something discussed earlier, try honcho_memory first rather than searching through messages.",
		],
		parameters: Type.Object({
			query: Type.String({
				description:
					"A natural-language question about the user, their preferences, past work, or conversation history. Be specific.",
			}),
			target: Type.Optional(
				Type.String({
					description:
						"Optional peer ID to query memory about. If omitted, queries about the current user.",
				}),
			),
			reasoning_level: Type.Optional(
				Type.String({
					description:
						"How deeply to reason: minimal, low, medium, high, or max. Default is low.",
				}),
			),
		}),
		async execute(toolCallId, params, signal) {
			const s = getState();
			const c = getClient();
			if (!s || !c) {
				return {
					content: [
						{
							type: "text",
							text: "Honcho is not connected. Start the Honcho server and reload extensions.",
						},
					],
				};
			}

			try {
				const result = await c.dialecticChat(s.workspaceId, s.peerId, {
					query: params.query,
					target: params.target,
					session_id: s.sessionId,
					reasoning_level:
						(params.reasoning_level as "low" | "medium" | "high" | "max") ||
						"low",
				});

				return {
					content: [
						{
							type: "text",
							text: result.content || "(Honcho returned no content)",
						},
					],
				};
			} catch (err) {
				return {
					content: [
						{
							type: "text",
							text: `Honcho memory query failed: ${err instanceof Error ? err.message : String(err)}`,
						},
					],
					isError: true,
				};
			}
		},
	});

	pi.registerTool({
		name: "honcho_remember",
		label: "Honcho Remember",
		description:
			"Store a fact or conclusion in Honcho's long-term memory about a peer. " +
			"Use this to explicitly save important information the user has shared " +
			"that should persist across sessions.",
		promptSnippet: "Store a fact or conclusion in Honcho's long-term memory",
		promptGuidelines: [
			"Use honcho_remember to persist important facts the user shares: preferences, decisions, constraints, personal details, or project context.",
			"Do not use honcho_remember for transient conversation details — only for durable facts worth recalling later.",
		],
		parameters: Type.Object({
			content: Type.String({
				description:
					"The fact or conclusion to store. One clear, self-contained statement per call. E.g., 'User prefers Rust over Python for systems work.'",
			}),
			about: Type.Optional(
				Type.String({
					description:
						"Optional peer ID the fact is about. If omitted, it's about the current user peer.",
				}),
			),
		}),
		async execute(toolCallId, params) {
			const s = getState();
			const c = getClient();
			if (!s || !c) {
				return {
					content: [
						{
							type: "text",
							text: "Honcho is not connected. Start the Honcho server and reload extensions.",
						},
					],
				};
			}

			try {
				const conclusions = await c.createConclusions(s.workspaceId, [
					{
						observer_id: s.peerId,
						observed_id: params.about || s.peerId,
						content: params.content,
						session_id: s.sessionId,
					},
				]);

				return {
					content: [
						{
							type: "text",
							text: `Stored in Honcho memory: "${conclusions[0]?.content || params.content}"`,
						},
					],
				};
			} catch (err) {
				return {
					content: [
						{
							type: "text",
							text: `Failed to store: ${err instanceof Error ? err.message : String(err)}`,
						},
					],
					isError: true,
				};
			}
		},
	});

	pi.registerTool({
		name: "honcho_representation",
		label: "Honcho Representation",
		description:
			"Get a curated summary of what Honcho knows about a peer (facts, preferences, context). " +
			"This is a read-only view of stored conclusions, without an LLM call. " +
			"Use this when you need a quick overview rather than an answered question.",
		promptSnippet:
			"Get a read-only summary of Honcho's stored conclusions about a peer",
		promptGuidelines: [
			"Use honcho_representation to get a quick overview of what Honcho knows about a user before engaging.",
			"Prefer honcho_memory (the Dialectic agent) when you have a specific question; use honcho_representation for a general context dump.",
		],
		parameters: Type.Object({
			target: Type.Optional(
				Type.String({
					description:
						"Optional peer ID to get representation for. If omitted, gets representation of the current user.",
				}),
			),
		}),
		async execute(toolCallId, params) {
			const s = getState();
			const c = getClient();
			if (!s || !c) {
				return {
					content: [
						{
							type: "text",
							text: "Honcho is not connected. Start the Honcho server and reload extensions.",
						},
					],
				};
			}

			try {
				const result = await c.getRepresentation(s.workspaceId, s.peerId, {
					target: params.target,
					session_id: s.sessionId,
					max_conclusions: 25,
				});

				return {
					content: [
						{
							type: "text",
							text: result.representation || "(No representation available)",
						},
					],
				};
			} catch (err) {
				return {
					content: [
						{
							type: "text",
							text: `Failed to get representation: ${err instanceof Error ? err.message : String(err)}`,
						},
					],
					isError: true,
				};
			}
		},
	});

	// ── Commands ───────────────────────────────────────────────────────────

	pi.registerCommand("honcho-status", {
		description: "Show Honcho connection status and session info",
		handler: async (_args, ctx) => {
			const s = getState();
			const c = getClient();
			if (!s || !c) {
				ctx.ui.notify("Honcho: not connected", "error");
				return;
			}

			ctx.ui.notify(
				`Honcho: ${s.apiUrl}\nWorkspace: ${s.workspaceId}\nPeer: ${s.peerId}\nSession: ${s.sessionId}`,
				"info",
			);
		},
	});
}
