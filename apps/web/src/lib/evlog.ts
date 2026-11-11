import { createFsDrain } from "evlog/fs";
import { createEvlog } from "evlog/next";
import { createInstrumentation } from "evlog/next/instrumentation/create";

export const { withEvlog, useLogger, log, createError } = createEvlog({
  drain: process.env.NODE_ENV === "production" ? undefined : createFsDrain(),
  service: "prospect-studio-web",
});

export const { register, onRequestError } = createInstrumentation({
  service: "prospect-studio-web",
});
