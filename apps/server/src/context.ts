import type { Context as ApiContext } from "@prospect-studio/api/context";
import type { Context as HonoContext } from "hono";

import { db } from "./services";

export interface CreateContextOptions {
  context: HonoContext;
}

export function createContext(_options: CreateContextOptions): ApiContext {
  return {
    db,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
