const { createServer } = require("node:http");
const { parse } = require("node:url");

const dev = process.argv.includes("--dev");
process.env.NODE_ENV = dev ? "development" : "production";

const next = require("next");

// Keep these in sync with lib/portals.ts.
const portals = [
  { label: "Administrator", port: 3000, home: "/admin" },
  { label: "Project manager", port: 3001, home: "/pm" },
];

const hostname = "localhost";
const app = next({ dev, hostname, turbopack: dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const upgrade = app.getUpgradeHandler();
  for (const portal of portals) {
    const server = createServer((req, res) => {
      handle(req, res, parse(req.url, true));
    });
    server.on("upgrade", (req, socket, head) => {
      upgrade(req, socket, head).catch(() => socket.destroy());
    });
    server.listen(portal.port, () => {
      console.log(`${portal.label}  http://${hostname}:${portal.port}${portal.home}`);
    });
  }
});
