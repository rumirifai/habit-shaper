import type { RequestHandler, Response } from "express";
import type { ZodError, ZodType } from "zod";
import { sendApiError } from "../lib/api-error.js";

type InputSource = "body" | "params" | "query";

export type ValidationFailure = {
  status: number;
  code: string;
  message: string;
  details?: unknown;
};

type ValidationOptions = {
  key: string;
  message: string;
  onFailure?: (error: ZodError) => ValidationFailure;
};

function validate<T>(
  source: InputSource,
  schema: ZodType<T>,
  options: ValidationOptions,
): RequestHandler {
  return (req, res, next) => {
    const value = source === "body" ? req.body : source === "params" ? req.params : req.query;
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      const failure = options.onFailure?.(parsed.error) ?? {
        status: 400,
        code: "VALIDATION_ERROR",
        message: options.message,
        details: parsed.error.flatten(),
      };
      sendApiError(res, failure.status, failure.code, failure.message, failure.details);
      return;
    }

    res.locals[options.key] = parsed.data;
    next();
  };
}

function options(
  key: string,
  message: string,
  onFailure?: ValidationOptions["onFailure"],
): ValidationOptions {
  return { key, message, ...(onFailure === undefined ? {} : { onFailure }) };
}

export function validateBody<T>(
  schema: ZodType<T>,
  message = "Input tidak valid.",
  onFailure?: ValidationOptions["onFailure"],
): RequestHandler {
  return validate("body", schema, options("validatedBody", message, onFailure));
}

export function validateParams<T>(
  schema: ZodType<T>,
  message = "Parameter route tidak valid.",
): RequestHandler {
  return validate("params", schema, options("validatedParams", message));
}

export function validateQuery<T>(
  schema: ZodType<T>,
  message = "Query tidak valid.",
): RequestHandler {
  return validate("query", schema, options("validatedQuery", message));
}

export function validatedBody<T>(res: Response): T {
  return res.locals.validatedBody as T;
}

export function validatedParams<T>(res: Response): T {
  return res.locals.validatedParams as T;
}

export function validatedQuery<T>(res: Response): T {
  return res.locals.validatedQuery as T;
}
