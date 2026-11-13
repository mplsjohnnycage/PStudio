import { Hono } from "hono";
import backend from "./backend.mjs";

/** Vercel's Hono entrypoint imports one self-contained Node bundle. */
const app = new Hono();
app.route("/", backend);
export default app;
