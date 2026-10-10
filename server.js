import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractVideoId, fetchTranscript, HttpError } from "./lib.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
const PORT = Number(process.env.PORT) || 3000;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

function send(res, status, body, type = "application/json; charset=utf-8") {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(payload);
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16_000) throw new HttpError(413, "That request is too large.");
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Send the YouTube link as JSON.");
  }
}

async function handleTranscript(req, res) {
  const body = await readJson(req);
  const videoId = extractVideoId(body.url);
  if (!videoId) throw new HttpError(400, "That doesn’t look like a YouTube link.");
  const transcript = await fetchTranscript(videoId, body.track);
  send(res, 200, transcript);
}

async function handleStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  const pathname = decodeURIComponent(url.pathname);
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const file = path.resolve(PUBLIC_DIR, relative);
  if (!file.startsWith(PUBLIC_DIR + path.sep) && file !== path.join(PUBLIC_DIR, "index.html")) {
    send(res, 403, "Not available.", "text/plain; charset=utf-8");
    return;
  }

  try {
    const data = await fs.readFile(file);
    const type = TYPES[path.extname(file)] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": type,
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(data);
  } catch {
    send(res, 404, "Not found.", "text/plain; charset=utf-8");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (req.method === "POST" && url.pathname === "/api/transcript") {
      await handleTranscript(req, res);
      return;
    }
    if (req.method === "GET") {
      await handleStatic(req, res);
      return;
    }
    send(res, 405, { error: "That action isn’t supported." });
  } catch (error) {
    if (error instanceof HttpError) {
      send(res, error.status, { error: error.message });
      return;
    }
    console.error(error);
    send(res, 500, { error: "Something went wrong while fetching the transcript." });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Transcript app running at http://localhost:${PORT}`);
});
