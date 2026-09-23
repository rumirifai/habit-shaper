import { NextResponse } from "next/server";

type HealthBody = {
  status: "ok";
  web: "ok";
};

export function GET(): NextResponse<HealthBody> {
  return NextResponse.json({ status: "ok", web: "ok" });
}
