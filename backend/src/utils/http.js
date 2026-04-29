export async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

export function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(data));
}

export function notFound(res) {
  sendJson(res, 404, { error: "Not Found" });
}

export function methodNotAllowed(res) {
  sendJson(res, 405, { error: "Method Not Allowed" });
}

export function sendBuffer(res, statusCode, buffer, headers = {}) {
  res.writeHead(statusCode, headers);
  res.end(buffer);
}
