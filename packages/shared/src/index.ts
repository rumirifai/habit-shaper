export type ApiError = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export function placeholder(): string {
  return "shared";
}
