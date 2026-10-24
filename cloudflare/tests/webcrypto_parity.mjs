// Runs backend/app/core/security.py inside Pyodide (the Python-on-WebAssembly runtime that
// Cloudflare Python Workers use) and checks its WebCrypto PBKDF2 path against:
//   1. the RFC 7914 test vector, and
//   2. Node's own independent PBKDF2 implementation (node:crypto pbkdf2Sync),
// then verifies a stored hash in our pbkdf2_sha256$... format end to end.
//
// Usage (from cloudflare/):  npm ci && npm run test:webcrypto
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPyodide } from "pyodide";

const here = path.dirname(fileURLToPath(import.meta.url));
const securitySrc = readFileSync(
  path.resolve(here, "../../backend/app/core/security.py"),
  "utf8",
);

const pyodide = await loadPyodide();
// security.py imports PyJWT for tokens; token code is not under test here.
pyodide.FS.writeFile("/home/pyodide/jwt.py", "def encode(*a, **k): ...\ndef decode(*a, **k): ...\n");
pyodide.FS.writeFile("/home/pyodide/security.py", securitySrc);

const salt = randomBytes(16);
const iterations = 20000;
const nodeDigest = pbkdf2Sync("Dealer#2026", salt, iterations, 32, "sha256");
const stored = [
  "pbkdf2_sha256",
  iterations,
  salt.toString("base64"),
  nodeDigest.toString("base64"),
].join("$");

pyodide.globals.set("STORED", stored);
pyodide.globals.set("SALT_HEX", salt.toString("hex"));
pyodide.globals.set("NODE_HEX", nodeDigest.toString("hex"));
pyodide.globals.set("ITERATIONS", iterations);

const result = await pyodide.runPythonAsync(`
import sys, time
sys.path.insert(0, "/home/pyodide")
import security

assert sys.platform == "emscripten"
assert security._running_on_workers(), "should take the WebCrypto path under Pyodide"

rfc = await security.pbkdf2_sha256(b"passwd", b"salt", 1)
assert rfc.hex() == "55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc", rfc.hex()

t0 = time.perf_counter()
ours = await security.pbkdf2_sha256(b"Dealer#2026", bytes.fromhex(SALT_HEX), ITERATIONS)
elapsed_ms = (time.perf_counter() - t0) * 1000
assert ours.hex() == NODE_HEX, (ours.hex(), NODE_HEX)

assert await security.verify_password("Dealer#2026", STORED)
assert not await security.verify_password("wrong", STORED)
await security.burn_password_check("x", ITERATIONS)
f"ok ({ITERATIONS} iterations took {elapsed_ms:.1f} ms here)"
`);

console.log(`WebCrypto PBKDF2 under Pyodide ${pyodide.version}: ${result}`);
