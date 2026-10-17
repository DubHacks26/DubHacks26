const express = require("express");
const http = require("http");
const cors = require("cors");
const dotenv = require("dotenv");
const helmet = require("helmet");
const crypto = require("node:crypto");
const next = require("next");
const { createClient } = require("@supabase/supabase-js");

if (process.env.NODE_ENV !== "production") {
  dotenv.config({ path: ".env.development" });
}

const app = express();
const server = http.createServer(app);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in the environment before starting app.js."
  );
}

// This client only verifies caller-provided access tokens. Do not use a
// Supabase secret/service-role key here; those keys bypass Row Level Security.
const supabase = createClient(supabaseUrl, supabasePublishableKey);

const allowedOrigins = (process.env.SERVER_CORS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS", "HEAD"],
    // Supabase access tokens are sent as Bearer tokens, so cookie credentials
    // are not needed for these API requests.
    credentials: false,
  })
);

app.use(helmet.permittedCrossDomainPolicies());
app.use(helmet.referrerPolicy());
app.use(helmet.xssFilter());
app.use(helmet.hsts());
app.use(helmet.ieNoOpen());
app.use(helmet.noSniff());
app.use(helmet.dnsPrefetchControl());
app.use(helmet.frameguard({ action: "SAMEORIGIN" }));
app.use(helmet.hidePoweredBy());
app.use((req, res, next) => {
  res.locals.cspNonce = crypto.randomBytes(16).toString("hex");
  res.setHeader("X-XSS-protection", "1; mode=block");
  next();
});

const cspOptions = {
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
    styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
    connectSrc: ["'self'", "https:"],
    workerSrc: ["'self'", "blob:"],
  },
};

if (process.env.NODE_ENV === "production") {
  app.use(helmet.contentSecurityPolicy(cspOptions));
}

app.use(express.json());

async function requireAuth(req, res, next) {
  const authorization = req.headers.authorization || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return res.status(401).json({
      success: false,
      error: { reason: "A Supabase access token is required" },
    });
  }

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(match[1]);

    if (error || !user) {
      return res.status(401).json({
        success: false,
        error: { reason: "Invalid or expired access token" },
      });
    }

    // API handlers can use req.user.id as the authenticated Supabase user ID.
    req.user = user;

    // A request-scoped client forwards this user's token to Supabase Database,
    // allowing the database's Row Level Security policies to apply.
    req.supabase = createClient(supabaseUrl, supabasePublishableKey, {
      global: { headers: { Authorization: `Bearer ${match[1]}` } },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });

    return next();
  } catch (error) {
    console.error("Supabase token verification failed:", error);
    return res.status(401).json({
      success: false,
      error: { reason: "Unable to verify access token" },
    });
  }
}

const authAPI = express.Router();

authAPI.post("/signup", async (req, res) => {
  const { email, password, name } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: name ? { name } : {} },
  });

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  return res.status(201).json({
    user: data.user,
    // Supabase may return a null session until the user confirms their email.
    session: data.session,
  });
});

authAPI.post("/signin", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return res.status(401).json({ error: error.message });
  }

  return res.status(200).json({ user: data.user, session: data.session });
});

app.use("/auth", authAPI);

// These existing route modules currently use custom MySQL queries and
// express-session authentication. Convert their handlers to use req.user.id
// and req.supabase before relying on them with this app2.js entry point.
const userAPI = require("./api/user").Router;

app.use("/user", requireAuth, userAPI);

let subscriptions = [];

app.post("/subscribe", (req, res) => {
  subscriptions.push(req.body);
  res.status(200).json({ status: "success" });
});

app.head("/", (req, res) => res.status(200).end()); // Possible keepalive

const dev = process.env.NODE_ENV !== "production";
const nextApp = next({ dev });
const handle = nextApp.getRequestHandler();
const PORT = process.env.PORT || 5000;
const HOST = process.env.NODE_ENV === "development" ? "localhost" : undefined;

nextApp.prepare().then(() => {
  app.use((req, res) => handle(req, res));

  server.listen(PORT, HOST, () => {
    if (HOST) {
      console.log(`Server running at http://${HOST}:${PORT}`);
    } else {
      console.log(`Server running on port ${PORT}`);
    }
  });
});

module.exports = { app, server, requireAuth };