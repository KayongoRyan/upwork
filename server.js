const { createServer } = require("node:http");
const { parse } = require("node:url");

const dev = process.argv.includes("--dev");
process.env.NODE_ENV = dev ? "development" : "production";

const next = require("next");

// Preferred ports. Keep the ids and homes in sync with lib/portals.ts.
// If a port is taken, the next candidate is preferred + 10, then + 20, and so on.
const portals = [
  { id: "administrator", label: "Administrator", port: 3000, home: "/admin" },
  { id: "project_manager", label: "Project manager", port: 3001, home: "/pm" },
  { id: "site_engineer", label: "Site engineer", port: 3002, home: "/se" },
  { id: "quantity_surveyor", label: "Quantity surveyor", port: 3003, home: "/qs" },
  { id: "vertexa", label: "Vertexa Group", port: 3030, home: "/vertexa" },
];

const hostname = "localhost";
const step = 10;
const attempts = 50;
const app = next({ dev, hostname, turbopack: dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const upgrade = app.getUpgradeHandler();
  for (const portal of portals) bindPortal(portal, upgrade, 0);
});

function createPortalServer(upgrade) {
  const server = createServer((req, res) => {
    req.headers["x-cpmis-ports"] = JSON.stringify(global.__cpmisPorts ?? {});
    // A refresh aborts the in-flight page. Drop that request so the socket is
    // not left in CLOSE_WAIT. req "close" is the wrong signal: it also fires
    // when a GET has been read, which is before the response is written, and
    // destroying then truncates the page so the browser retries forever.
    res.on("close", () => {
      if (!res.writableFinished) req.destroy();
    });
    handle(req, res, parse(req.url, true));
  });
  server.keepAliveTimeout = 8_000;
  server.headersTimeout = 20_000;
  server.requestTimeout = 60_000;
  server.timeout = 60_000;
  server.on("upgrade", (req, socket, head) => {
    upgrade(req, socket, head).catch(() => socket.destroy());
  });
  return server;
}

function announce(portal, port) {
  const current = global.__cpmisPorts ?? {};
  if (current[portal.id] === port) return;
  current[portal.id] = port;
  global.__cpmisPorts = current;
  const note = port === portal.port ? "" : ` (${portal.port} was in use)`;
  console.log(`${portal.label}  http://${hostname}:${port}${portal.home}${note}`);
}

function bindPortal(portal, upgrade, attempt) {
  if (attempt >= attempts) {
    const last = portal.port + (attempts - 1) * step;
    console.error(`${portal.label}  no free port from ${portal.port} to ${last}`);
    return;
  }

  const port = portal.port + attempt * step;
  const v4 = createPortalServer(upgrade);
  v4.once("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.warn(`${portal.label}  ${port} is in use, trying ${port + step}`);
      bindPortal(portal, upgrade, attempt + 1);
      return;
    }
    console.error(error);
  });
  // localhost is both 127.0.0.1 and ::1 on Windows. Binding the hostname once
  // only accepts whichever family DNS returns first, and the other hangs.
  v4.listen(port, "127.0.0.1", () => {
    announce(portal, port);
    const v6 = createPortalServer(upgrade);
    v6.once("error", (error) => {
      console.warn(`${portal.label}  IPv6 ${port} unavailable (${error.code})`);
    });
    v6.listen(port, "::1");
  });
}
