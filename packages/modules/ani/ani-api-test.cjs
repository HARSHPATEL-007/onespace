const http = require("http");
const querystring = require("querystring");

const PORT = 3004;
const BASE = `http://localhost:${PORT}`;

function parseCookieSetHeaders(setCookieHeaders) {
  if (!setCookieHeaders) return "";
  const headers = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  return headers
    .map((h) => h.split(";")[0])
    .join("; ");
}

function get(path, cookie) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: "localhost",
      port: PORT,
      path,
      method: "GET",
      headers: cookie ? { Cookie: cookie } : {},
    };
    const req = http.request(opts, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body, setCookie: res.headers["set-cookie"] }));
    });
    req.on("error", reject);
    req.setTimeout(30000, () => req.destroy());
    req.end();
  });
}

function postForm(path, data, cookie) {
  return new Promise((resolve, reject) => {
    const body = querystring.stringify(data);
    const opts = {
      hostname: "localhost",
      port: PORT,
      path,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(body),
        ...(cookie ? { Cookie: cookie } : {}),
      },
    };
    const req = http.request(opts, (res) => {
      let responseBody = "";
      res.on("data", (c) => (responseBody += c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: responseBody, setCookie: res.headers["set-cookie"] }));
    });
    req.on("error", reject);
    req.setTimeout(30000, () => req.destroy());
    req.write(body);
    req.end();
  });
}

function postJson(path, data, cookie) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const opts = {
      hostname: "localhost",
      port: PORT,
      path,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
        ...(cookie ? { Cookie: cookie } : {}),
      },
    };
    const req = http.request(opts, (res) => {
      let responseBody = "";
      res.on("data", (c) => (responseBody += c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: responseBody, setCookie: res.headers["set-cookie"] }));
    });
    req.on("error", reject);
    req.setTimeout(30000, () => req.destroy());
    req.write(body);
    req.end();
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function preWarm() {
  try { await get("/signin"); } catch {}
  try { await get("/api/auth/csrf"); } catch {}
  await delay(3000);
}

async function main() {
  console.log("=== N0VA ANI API Integration Test ===\n");

  await preWarm();
  console.log("0. Server pre-warmed ✓\n");

  // 1. Check signin page loads
  console.log("1. Checking /signin page...");
  const signin = await get("/signin");
  console.log(`   Status: ${signin.status} ✓`);

  // 2. Get CSRF token
  console.log("2. Getting CSRF token from /api/auth/csrf...");
  const csrf = await get("/api/auth/csrf");
  if (csrf.status !== 200) throw new Error(`CSRF failed: ${csrf.status}`);
  const csrfData = JSON.parse(csrf.body);
  const csrfToken = csrfData.csrfToken;
  const csrfCookie = parseCookieSetHeaders(csrf.setCookie);
  console.log(`   CSRF token: ${csrfToken.slice(0, 20)}... ✓`);
  console.log(`   CSRF cookie: ${csrfCookie.slice(0, 60)}... ✓`);

  // 3. Sign in with credentials (form-encoded per Auth.js spec)
  console.log("3. Signing in with demo credentials...");
  const signinResp = await postForm(
    "/api/auth/callback/credentials",
    {
      csrfToken,
      redirect: "false",
      email: "demo@n0va.workspace",
      password: "n0va-demo-pass",
    },
    csrfCookie
  );
  console.log(`   Status: ${signinResp.status}`);

  const sessionCookie = parseCookieSetHeaders(signinResp.setCookie);
  const fullCookie = sessionCookie ? `${csrfCookie}; ${sessionCookie}` : csrfCookie;
  console.log(`   Session cookie: ${sessionCookie.slice(0, 60)}... ✓`);

  // 4. Check session
  console.log("4. Verifying session...");
  const session = await get("/api/auth/session", fullCookie);
  const sessionData = session.body ? JSON.parse(session.body) : {};
  console.log(`   User: ${sessionData.user?.email || "none"} ✓`);

  if (!sessionData.user?.id) {
    console.log("   ERROR: No authenticated user session");
    console.log("   Session response:", session.body.slice(0, 200));
    process.exit(1);
  }

  // 5. Check ANI health endpoint
  console.log("5. Checking ANI health...");
  const health = await get("/api/ani/health", fullCookie);
  console.log(`   Status: ${health.status}`);
  if (health.status === 200) {
    const healthData = JSON.parse(health.body);
    console.log(`   Module: ${healthData.module} ✓`);
    console.log(`   Status: ${healthData.status} ✓`);
    console.log(`   Open circuits: ${healthData.openCircuits?.length || 0} ✓`);
  } else {
    console.log(`   Response: ${health.body.slice(0, 200)}`);
  }

  // 6. Check ANI conversation listing
  console.log("6. Checking ANI conversation listing...");
  const createResp = await get("/api/ani", fullCookie);
  console.log(`   GET /api/ani status: ${createResp.status}`);

  // 7. Send message to ANI via /api/ani (fast depth)
  console.log("7. Sending message to ANI via /api/ani...");
  const aniResp = await postJson("/api/ani", {
    content: "Summarize the workspace activity in one sentence",
    depth: "fast",
  }, fullCookie);
  console.log(`   Status: ${aniResp.status}`);
  if (aniResp.status === 200) {
    const data = JSON.parse(aniResp.body);
    console.log(`   Content: ${data.content?.slice(0, 100)}... ✓`);
    console.log(`   Confidence: ${data.confidence} ✓`);
    console.log(`   Latency: ${data.latencyMs}ms ✓`);
  } else {
    console.log(`   Response: ${aniResp.body.slice(0, 300)}`);
  }

  // 8. Test ANI stream endpoint (GET with query params)
  console.log("8. Testing ANI stream endpoint...");
  const streamResp = await get("/api/ani/stream?content=What+is+our+Q4+strategy&depth=balanced", fullCookie);
  console.log(`   Status: ${streamResp.status}`);
  if (streamResp.status === 200) {
    console.log(`   Content-Type: ${streamResp.headers["content-type"]} ✓`);
  }

  // 9. Test complexity analysis
  console.log("9. Testing complexity analysis...");
  const complexityResp = await postJson("/api/ani/complexity", {
    content: "Analyze the impact of increasing ad spend by 50% on server load"
  }, fullCookie);
  console.log(`   Status: ${complexityResp.status}`);
  if (complexityResp.status === 200) {
    const data = JSON.parse(complexityResp.body);
    console.log(`   Score: ${data.score} ✓`);
    console.log(`   Recommended depth: ${data.recommendedDepth} ✓`);
  }

  // 10. Test process engine (no depth specified = auto path)
  console.log("10. Testing engine process (simple query)...");
  const engineResp = await postJson("/api/ani", {
    content: "What modules are available in this workspace?"
  }, fullCookie);
  console.log(`   Status: ${engineResp.status}`);
  if (engineResp.status === 200) {
    const data = JSON.parse(engineResp.body);
    console.log(`   Content: ${data.content?.slice(0, 80)}... ✓`);
  }

  console.log("\n=== All API tests completed ===");
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
