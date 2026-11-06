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

function bindPortal(portal, upgrade, attempt) {
  if (attempt >= attempts) {
    const last = portal.port + (attempts - 1) * step;
    console.error(`${portal.label}  no free port from ${portal.port} to ${last}`);
    return;
  }

  const port = portal.port + attempt * step;
  const server = createServer((req, res) => {
    req.headers["x-cpmis-ports"] = JSON.stringify(global.__cpmisPorts ?? {});
    handle(req, res, parse(req.url, true));
  });
  server.on("upgrade", (req, socket, head) => {
    upgrade(req, socket, head).catch(() => socket.destroy());
  });
  server.once("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.warn(`${portal.label}  ${port} is in use, trying ${port + step}`);
      bindPortal(portal, upgrade, attempt + 1);
      return;
    }
    console.error(error);
  });
  server.listen(port, hostname, () => {
    const current = global.__cpmisPorts ?? {};
    current[portal.id] = port;
    global.__cpmisPorts = current;
    const note = port === portal.port ? "" : ` (${portal.port} was in use)`;
    console.log(`${portal.label}  http://${hostname}:${port}${portal.home}${note}`);
  });
}
