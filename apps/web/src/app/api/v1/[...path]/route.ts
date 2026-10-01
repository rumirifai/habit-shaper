import { NextResponse, type NextRequest } from "next/server";

type RouteContext = {
  params: { path: string[] };
};

async function forwardRequest(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const path = context.params.path.join("/");
  const isAuthRoute = /^auth\/(register|login|refresh|logout)$/.test(path);
  const isHabitListRoute = path === "habits";
  const isCheckInRoute = /^habits\/[^/]+\/check-in$/.test(path);
  const isStreakRoute = /^habits\/[^/]+\/streak$/.test(path);
  if (!isAuthRoute && !isHabitListRoute && !isCheckInRoute && !isStreakRoute) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Route tidak ditemukan." } },
      { status: 404 },
    );
  }

  const baseUrl = process.env["API_INTERNAL_URL"] ?? "http://api:4000/api/v1";
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  const cookie = request.headers.get("cookie");
  const authorization = request.headers.get("authorization");
  if (contentType !== null) headers.set("content-type", contentType);
  if (cookie !== null) headers.set("cookie", cookie);
  if (authorization !== null) headers.set("authorization", authorization);

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/${path}${request.nextUrl.search}`, {
      method: request.method,
      headers,
      ...(request.method === "POST" && contentType !== null ? { body: await request.text() } : {}),
      cache: "no-store",
    });
    const body = response.status === 204 ? null : await response.arrayBuffer();
    const result = new NextResponse(body, { status: response.status });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie !== null) result.headers.set("set-cookie", setCookie);
    result.headers.set("content-type", response.headers.get("content-type") ?? "application/json");
    return result;
  } catch {
    return NextResponse.json(
      { error: { code: "API_UNAVAILABLE", message: "Layanan belum dapat dihubungi." } },
      { status: 503 },
    );
  }
}

export const GET = forwardRequest;
export const POST = forwardRequest;
export const DELETE = forwardRequest;
