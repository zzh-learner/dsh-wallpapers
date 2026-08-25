import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { z } from "zod";
//#region src/media.ts
/**
* Host half of the local-media wallpaper: two read-only routes on the shared
* web server (present only in web compositions, hence a runtime ctx.inject
* rather than a required dependency). `GET /dsh-wallpapers/local/list`
* classifies one directory (dirs first, media files by extension whitelist)
* or reports a single file / a missing path as JSON; `GET
* /dsh-wallpapers/local/file` streams one whitelisted media file with single
* Range support so <video> can seek. Everything else 404/405s, and only
* absolute paths are accepted — the route serves what the operator picked,
* nothing more.
*
* @module dsh-wallpapers/src/media
*/
/** Shared prefix of both routes; also the client half's fetch base. */
const LOCAL_MEDIA_ROUTE = "/dsh-wallpapers/local";
/** Cap on one listing so a huge directory cannot stall the response. */
const MAX_ENTRIES = 4e3;
/** Image extensions this mode serves, with their MIME types. */
const IMAGE_MIME = /* @__PURE__ */ new Map([
	["avif", "image/avif"],
	["bmp", "image/bmp"],
	["gif", "image/gif"],
	["jpeg", "image/jpeg"],
	["jpg", "image/jpeg"],
	["png", "image/png"],
	["svg", "image/svg+xml"],
	["webp", "image/webp"]
]);
/** Video extensions this mode serves, with their MIME types. */
const VIDEO_MIME = /* @__PURE__ */ new Map([
	["m4v", "video/x-m4v"],
	["mkv", "video/x-matroska"],
	["mov", "video/quicktime"],
	["mp4", "video/mp4"],
	["ogv", "video/ogg"],
	["webm", "video/webm"]
]);
/** Directory junk never worth listing in a wallpaper picker. */
const JUNK_NAMES = /* @__PURE__ */ new Set([
	"$RECYCLE.BIN",
	"System Volume Information",
	"Thumbs.db",
	"desktop.ini"
]);
/** Classify one file name for the media whitelists. */
function classifyMedia(name) {
	const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
	const image = IMAGE_MIME.get(ext);
	if (image !== void 0) return {
		kind: "image",
		mime: image
	};
	const video = VIDEO_MIME.get(ext);
	if (video !== void 0) return {
		kind: "video",
		mime: video
	};
	return null;
}
/** Absolute-path gate: relative paths, and anything with NUL, are refused. */
function normalizeTarget(raw) {
	if (raw === "" || raw.includes("\0")) return null;
	if (!path.isAbsolute(raw)) return null;
	return path.resolve(raw);
}
/** Parent directory, or null at a filesystem root (dirname(p) === p). */
function parentOf(target) {
	const parent = path.dirname(target);
	return parent === target ? null : parent;
}
/** Entries a picker would trip over: dotfiles and OS metadata. */
function isJunk(name) {
	return name.startsWith(".") || JUNK_NAMES.has(name);
}
/** Natural-order compare so img2 sorts before img10. */
function compareNames(a, b) {
	return a.localeCompare(b, void 0, {
		numeric: true,
		sensitivity: "base"
	});
}
/** Existing filesystem roots: every present drive letter on Windows, '/' elsewhere. */
async function listRoots() {
	if (process.platform !== "win32") return ["/"];
	const roots = [];
	for (let code = 65; code <= 90; code++) {
		const drive = `${String.fromCharCode(code)}:\\`;
		try {
			if ((await stat(drive)).isDirectory()) roots.push(drive);
		} catch {}
	}
	return roots;
}
/** One entry's stat fields, size 0 / mtime 0 when stat fails (broken link etc.). */
async function entryStats(target) {
	try {
		const st = await stat(target);
		return {
			size: st.size,
			mtime: Math.floor(st.mtimeMs)
		};
	} catch {
		return {
			size: 0,
			mtime: 0
		};
	}
}
/** Serve the listing: classify the target, or describe why it cannot be a wallpaper. */
async function serveList(url, res) {
	const raw = url.searchParams.get("path") ?? "";
	const target = raw === "" ? homedir() : normalizeTarget(raw);
	const send = (dto) => {
		res.writeHead(200, {
			"content-type": "application/json; charset=utf-8",
			"cache-control": "no-store"
		});
		res.end(JSON.stringify(dto));
	};
	if (target === null) {
		res.writeHead(400, {
			"content-type": "text/plain; charset=utf-8",
			"cache-control": "no-store"
		});
		res.end("dsh-wallpapers: path must be absolute");
		return;
	}
	let st;
	try {
		st = await stat(target);
	} catch {
		send({
			path: target,
			kind: "missing",
			parent: parentOf(target),
			entries: []
		});
		return;
	}
	if (st.isFile()) {
		const media = classifyMedia(target);
		send({
			path: target,
			kind: media?.kind ?? "file",
			parent: parentOf(target),
			entries: [],
			entry: {
				name: path.basename(target),
				kind: media?.kind ?? "file",
				size: st.size,
				mtime: Math.floor(st.mtimeMs),
				path: target
			}
		});
		return;
	}
	let dirents;
	try {
		dirents = await readdir(target, { withFileTypes: true });
	} catch {
		send({
			path: target,
			kind: "missing",
			parent: parentOf(target),
			entries: []
		});
		return;
	}
	const dirs = [];
	const mediaFiles = [];
	let truncated = false;
	for (const dirent of dirents) {
		if (isJunk(dirent.name)) continue;
		if (dirs.length + mediaFiles.length >= MAX_ENTRIES) {
			truncated = true;
			break;
		}
		const child = path.join(target, dirent.name);
		if (dirent.isDirectory()) {
			dirs.push({
				name: dirent.name,
				kind: "dir",
				size: 0,
				mtime: 0,
				path: child
			});
			continue;
		}
		if (!dirent.isFile()) continue;
		const media = classifyMedia(dirent.name);
		if (media === null) continue;
		const stats = await entryStats(child);
		mediaFiles.push({
			name: dirent.name,
			kind: media.kind,
			...stats,
			path: child
		});
	}
	dirs.sort((a, b) => compareNames(a.name, b.name));
	mediaFiles.sort((a, b) => compareNames(a.name, b.name));
	const parent = parentOf(target);
	const dto = {
		path: target,
		kind: "dir",
		parent,
		entries: [...dirs, ...mediaFiles]
	};
	if (truncated) {
		res.writeHead(200, {
			"content-type": "application/json; charset=utf-8",
			"cache-control": "no-store"
		});
		res.end(JSON.stringify({
			...dto,
			truncated: true
		}));
		return;
	}
	if (parent === null) {
		const roots = await listRoots();
		res.writeHead(200, {
			"content-type": "application/json; charset=utf-8",
			"cache-control": "no-store"
		});
		res.end(JSON.stringify({
			...dto,
			roots
		}));
		return;
	}
	send(dto);
}
/** Parse one `bytes=start-end` header against a known size; null = whole file. */
function parseRange(header, size) {
	if (header === void 0) return null;
	const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
	if (match === null) return "invalid";
	const [, rawStart, rawEnd] = match;
	if (rawStart === "") {
		if (rawEnd === "") return null;
		const suffix = Number(rawEnd);
		if (!Number.isSafeInteger(suffix) || suffix <= 0) return "invalid";
		return {
			start: Math.max(0, size - suffix),
			end: size - 1
		};
	}
	const start = Number(rawStart);
	if (!Number.isSafeInteger(start) || start < 0 || start >= size) return "invalid";
	let end = rawEnd === "" ? size - 1 : Number(rawEnd);
	if (!Number.isSafeInteger(end) || end < start) return "invalid";
	if (end >= size) end = size - 1;
	return {
		start,
		end
	};
}
/** Serve one media file: whitelist, stat, then stream with single-Range support. */
async function serveFile(req, url, res) {
	const target = normalizeTarget(url.searchParams.get("path") ?? "");
	if (target === null) {
		res.writeHead(400, {
			"content-type": "text/plain; charset=utf-8",
			"cache-control": "no-store"
		});
		res.end("dsh-wallpapers: path must be absolute");
		return;
	}
	const media = classifyMedia(target);
	if (media === null) {
		res.writeHead(403, {
			"content-type": "text/plain; charset=utf-8",
			"cache-control": "no-store"
		});
		res.end("dsh-wallpapers: not a supported media file");
		return;
	}
	let st;
	try {
		st = await stat(target);
	} catch {
		res.writeHead(404, {
			"content-type": "text/plain; charset=utf-8",
			"cache-control": "no-store"
		});
		res.end("dsh-wallpapers: file not found");
		return;
	}
	if (!st.isFile()) {
		res.writeHead(403, {
			"content-type": "text/plain; charset=utf-8",
			"cache-control": "no-store"
		});
		res.end("dsh-wallpapers: not a file");
		return;
	}
	const range = parseRange(req.headers.range, st.size);
	if (range === "invalid") {
		res.writeHead(416, {
			"content-range": `bytes */${st.size}`,
			"cache-control": "no-store"
		});
		res.end();
		return;
	}
	const start = range?.start ?? 0;
	const end = range?.end ?? st.size - 1;
	const headers = {
		"content-type": media.mime,
		"content-length": end - start + 1,
		"accept-ranges": "bytes",
		"cache-control": "private, max-age=3600"
	};
	if (range !== null) headers["content-range"] = `bytes ${start}-${end}/${st.size}`;
	const stream = createReadStream(target, {
		start,
		end
	});
	stream.on("error", () => {
		if (res.headersSent) res.destroy();
		else {
			res.writeHead(500, {
				"content-type": "text/plain; charset=utf-8",
				"cache-control": "no-store"
			});
			res.end("dsh-wallpapers: read failed");
		}
	});
	res.writeHead(range === null ? 200 : 206, headers);
	if (req.method === "HEAD") {
		stream.destroy();
		res.end();
		return;
	}
	stream.pipe(res);
}
/** Route dispatcher for the shared prefix. */
async function handle(req, res) {
	if (req.method !== "GET" && req.method !== "HEAD") {
		res.writeHead(405, {
			allow: "GET, HEAD",
			"content-type": "text/plain; charset=utf-8"
		});
		res.end("dsh-wallpapers: method not allowed");
		return;
	}
	let url;
	try {
		url = new URL(req.url ?? "/", "http://localhost");
	} catch {
		res.writeHead(400).end();
		return;
	}
	try {
		if (url.pathname === `/dsh-wallpapers/local/list`) await serveList(url, res);
		else if (url.pathname === `/dsh-wallpapers/local/file`) await serveFile(req, url, res);
		else {
			res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
			res.end("dsh-wallpapers: not found");
		}
	} catch {
		if (!res.headersSent) res.writeHead(500).end();
		else res.destroy();
	}
}
/**
* Attach the local-media routes to the shared web server when (and only when)
* a web composition provides it; headless profiles simply skip the feature.
* @param ctx - plugin context whose fiber owns the registration.
*/
function registerLocalMediaRoutes(ctx) {
	ctx.inject(["webServer"], (webCtx) => {
		webCtx.effect(() => {
			const server = webCtx.webServer;
			if (server === void 0) throw new Error("dsh-wallpapers: webServer service vanished before registration");
			return server.register({
				kind: "prefix",
				path: LOCAL_MEDIA_ROUTE,
				handler: handle
			});
		}, "dsh-wallpapers: local-media routes");
	});
}
//#endregion
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
/** The projection registry is required; the web-server routes attach opportunistically. */
const inject = ["sessionProjections"];
/**
* Register the `orbActivity` unit and (in web compositions) the
* `/dsh-wallpapers/local` routes; both are effects on this plugin's fiber,
* so unloading removes them.
* @param ctx - registrant context carrying the projection registry.
*/
function apply(ctx) {
	ctx.sessionProjections.register(orbActivityProjectionDefinition);
	registerLocalMediaRoutes(ctx);
}
//#endregion
export { apply, inject, name };
