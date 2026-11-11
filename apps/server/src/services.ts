import { createDb } from "@prospect-studio/db";

import { ENV } from "./env.server";

export const db = createDb(ENV);
