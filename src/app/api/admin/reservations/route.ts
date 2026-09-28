import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getAllReservations, updateReservationStatus } from "@/lib/data/reservations";
import type { ReservationStatus } from "@/lib/types";
import { withNoStore } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "unauthorized" }, withNoStore({ status: 401 }));
  }
  const reservations = await getAllReservations();
  reservations.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  return NextResponse.json({ ok: true, reservations }, withNoStore());
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ ok: false, error: "unauthorized" }, withNoStore({ status: 401 }));
  }

  let body: { id?: unknown; status?: unknown };
  try {
    body = await request.json() as { id?: unknown; status?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, withNoStore({ status: 400 }));
  }
  const allowed: ReservationStatus[] = ["reserved", "cancelled", "attended"];
  if (typeof body.id !== "string" || !allowed.includes(body.status as ReservationStatus)) {
    return NextResponse.json({ ok: false, error: "invalid_reservation_status" }, withNoStore({ status: 400 }));
  }

  const reservation = await updateReservationStatus(body.id, body.status as ReservationStatus);
  if (!reservation) {
    return NextResponse.json({ ok: false, error: "reservation_not_found" }, withNoStore({ status: 404 }));
  }
  return NextResponse.json({ ok: true, reservation }, withNoStore());
}