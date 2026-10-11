/**
 * GET   /api/profile — the signed-in user's profile.
 * PATCH /api/profile — update it.
 *
 * Scoped to the session user; there is no id in the URL, so there's no way to
 * address someone else's profile.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ageFrom, normalizeProfile } from "@/lib/profile";

export const runtime = "nodejs";

/** Shape sent to the browser — flattens the DOB into a plain YYYY-MM-DD. */
function toClient(profile: {
  displayName: string | null;
  dateOfBirth: Date | null;
  currentStatus: string | null;
  currentRoleTitle: string | null;
  currentEmployer: string | null;
  educationLevel: string | null;
  fieldOfStudy: string | null;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  postalCode: string | null;
  timezone: string | null;
  currency: string | null;
  interests: string[];
  hobbies: string[];
  workStyle: string[];
  constraints: string[];
  onboardingCompletedAt: Date | null;
}) {
  return {
    ...profile,
    // A Date would arrive as a full ISO timestamp; the editor wants the date
    // part only, and slicing here avoids a timezone-shifted value on the client.
    dateOfBirth: profile.dateOfBirth
      ? profile.dateOfBirth.toISOString().slice(0, 10)
      : null,
    age: ageFrom(profile.dateOfBirth),
    onboardingCompletedAt: profile.onboardingCompletedAt?.getTime() ?? null,
  };
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { error: "You need to sign in.", code: "UNAUTHENTICATED" },
      { status: 401 }
    );
  }

  // The profile row is created at signup, but fall back to creating it here in
  // case an account predates that.
  const profile =
    user.profile ??
    (await prisma.userProfile.create({ data: { userId: user.id } }));

  return NextResponse.json({
    profile: toClient(profile),
    email: user.email,
  });
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { error: "You need to sign in.", code: "UNAUTHENTICATED" },
      { status: 401 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = normalizeProfile(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const existing = user.profile ?? (await prisma.userProfile.create({ data: { userId: user.id } }));

  const profile = await prisma.userProfile.update({
    where: { userId: user.id },
    data: {
      ...parsed.data,
      // Stamp the first time they actually save something, so the app can tell
      // a filled-in profile from one that's still empty.
      ...(existing.onboardingCompletedAt ? {} : { onboardingCompletedAt: new Date() }),
    },
  });

  return NextResponse.json({ profile: toClient(profile) });
}
