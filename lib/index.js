import { z } from "zod";
//#region src/projection.ts
/**
* The `orbActivity` projection unit: a pure fold of step boundaries, stream
* chunks, tool pairs, and turn outcomes into the live-activity view the
* thinking-orb background renders.
*
* Every visible field is event-derived — no wall-clock windows inside the
* fold — so a replayed cache reproduces the exact live value and the client
* owns all timing (it edge-triggers `outcomeSeq` against its own clock and
* lets running bits from the session list gate display).
*
* In-flight tracking mirrors the sessionStats tool pairing: `tool/call`
* records a callId→name entry, `tool/result` drops it (own-key check —
* callId is model-minted JSON, so a prototype property name must read as
* unmatched), and `turn/end` sweeps the leftovers a cancelled or failed
* turn leaves behind. `streaming` is the open step's chunk flag: set by any
* `assistant/chunk` belonging to that step, cleared by its assembled
* `assistant/message` (the step continues through its tool calls either
* way) and by `step/end`.
*
* @module dsh-wallpapers/src/projection
*/
const orbActivitySchema = z.object({
	openTools: z.array(z.string()),
	streaming: z.boolean(),
	outcome: z.enum(["settle", "error"]).nullable(),
	outcomeSeq: z.number().int().nonnegative()
}).strict();
/**
* Map a `turn/end` reason to the orb outcome it settles as. Everything a
* human launched the turn for resolves as `settle`; only a failed turn is an
* `error`. Aborted, blocked, max-tokens, and crash-closed turns carry no
* celebratory or alarming reading and settle as null.
* @param reason - why the turn ended.
* @returns the outcome the orb should remember, or null for none.
*/
function outcomeOf(reason) {
	if (reason.kind === "completed") return "settle";
	if (reason.kind === "error") return "error";
	return null;
}
/** The `orbActivity` unit registered on `ctx.sessionProjections` (exported for the unit spec). */
const orbActivityProjectionDefinition = {
	key: "orbActivity",
	schema: orbActivitySchema,
	init: () => ({
		openTools: {},
		openStep: null,
		streaming: false,
		outcome: null,
		outcomeSeq: 0
	}),
	apply: (state, event) => {
		switch (event.type) {
			case "step/start": return {
				...state,
				openStep: {
					turn: event.data.turn,
					step: event.data.step
				},
				streaming: false
			};
			case "assistant/chunk": {
				const open = state.openStep;
				if (open === null || open.turn !== event.data.turn || open.step !== event.data.step) return state;
				return state.streaming ? state : {
					...state,
					streaming: true
				};
			}
			case "assistant/message": {
				const open = state.openStep;
				if (open === null || open.turn !== event.data.turn || open.step !== event.data.step) return state;
				return state.streaming ? {
					...state,
					streaming: false
				} : state;
			}
			case "tool/call": return {
				...state,
				openTools: {
					...state.openTools,
					[event.data.callId]: event.data.name
				}
			};
			case "tool/result": {
				const callId = event.data.message.source.callId;
				if (!Object.hasOwn(state.openTools, callId)) return state;
				const openTools = Object.fromEntries(Object.entries(state.openTools).filter(([id]) => id !== callId));
				return {
					...state,
					openTools
				};
			}
			case "step/end": return state.openStep === null && !state.streaming ? state : {
				...state,
				openStep: null,
				streaming: false
			};
			case "turn/end": {
				const outcome = outcomeOf(event.data.reason);
				const swept = Object.keys(state.openTools).length === 0 && state.openStep === null && !state.streaming ? state : {
					...state,
					openTools: {},
					openStep: null,
					streaming: false
				};
				return outcome === null ? swept : {
					...swept,
					outcome,
					outcomeSeq: state.outcomeSeq + 1
				};
			}
			default: return state;
		}
	},
	view: (state) => ({
		openTools: Object.values(state.openTools),
		streaming: state.streaming,
		outcome: state.outcome,
		outcomeSeq: state.outcomeSeq
	}),
	stateVersion: 1
};
//#endregion
//#region src/index.ts
/** Cordis plugin name. */
const name = "dsh-wallpapers";
/** The projection registry is the plugin's whole purpose; without it the fiber stays pending. */
const inject = ["sessionProjections"];
/**
* Register the `orbActivity` unit; the registration is an effect on this
* plugin's fiber, so unloading removes the key.
* @param ctx - registrant context carrying the projection registry.
*/
function apply(ctx) {
	ctx.sessionProjections.register(orbActivityProjectionDefinition);
}
//#endregion
export { apply, inject, name };
