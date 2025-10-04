import { asError } from "catch-unknown";
import pino from "pino";

export const logger = pino({ level: process.env.LOG_LEVEL || "info" }, pino.destination({ sync: true }));

process.on("uncaughtException", (err) => {
  logger.error({ msg: "Uncaught exception", err });
});

process.on("unhandledRejection", (err) => {
  logger.error({ msg: "Unhandled rejection", err: asError(err) });
});

export default logger;
