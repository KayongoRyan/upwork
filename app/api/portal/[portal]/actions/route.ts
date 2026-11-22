import { NextResponse } from "next/server";
import type { AdminAction } from "@/lib/data/reducer";
import { destroySessionsForUser, getSessionUser, removeUserCredential, resetDemoAuth, setUserPassword, verifyCsrf } from "@/lib/server/auth";
import { PersistenceError } from "@/lib/server/mongo";
import { PortalActionError, applyPortalAction, isPortalKey, scopeStateForSession } from "@/lib/server/portal-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function withActor(action: AdminAction, actor: { id: string; firstName: string; lastName: string; role: string }): AdminAction {
  let next: AdminAction = action;
  // Prevent identity spoofing from client payloads.
  if (actor.role === "site_engineer") {
    if (next.type === "submit-report") next = { ...next, input: { ...next.input, engineerId: actor.id } };
    if (next.type === "set-task-progress") next = { ...next, engineerId: actor.id };
  }
  if (actor.role === "quantity_surveyor") {
    if (next.type === "create-boq" || next.type === "update-boq" || next.type === "delete-boq" || next.type === "send-cost-report") {
      next = { ...next, surveyorId: actor.id };
    }
    // submit-cost-report: keep payload but actor is stamped; reducer/store control ownership.
  }
  if (next.type === "reset" || next.type === "mark-notification" || next.type === "mark-all-notifications") return next;
  if (!("stamp" in next)) return next;
  return {
    ...next,
    stamp: {
      ...next.stamp,
      actorId: actor.id,
      actorName: `${actor.firstName} ${actor.lastName}`,
      actorRole: actor.role as "administrator" | "project_manager" | "site_engineer" | "quantity_surveyor",
    },
  } as AdminAction;
}

/** Actions a portal screen posts after its local reducer has rendered them. */
export async function POST(request: Request, context: { params: Promise<{ portal: string }> }) {
  const { portal } = await context.params;
  if (!isPortalKey(portal)) {
    return NextResponse.json({ ok: false, error: "unknown-portal" }, { status: 404 });
  }

  const session = await getSessionUser(portal);
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const csrf = verifyCsrf(request, session);
  if (csrf) return csrf;

  const action = (await request.json().catch(() => null)) as AdminAction | null;
  if (!action || typeof action !== "object" || typeof action.type !== "string") {
    return NextResponse.json({ ok: false, error: "unknown-action" }, { status: 400 });
  }

  try {
    const secured = withActor(action, session);
    if (secured.type === "create-user") {
      const pwd = "password" in secured ? secured.password : undefined;
      if (typeof pwd !== "string" || pwd.length < 8) {
        return NextResponse.json({ ok: false, error: "password-required" }, { status: 400 });
      }
    }
    const state = await applyPortalAction(portal, secured);
    if (secured.type === "create-user") {
      const pwd = "password" in secured ? secured.password : undefined;
      if (typeof pwd === "string") {
        await setUserPassword(secured.stamp.id, secured.input.email, pwd);
      }
    }
    if (secured.type === "update-user" && secured.input.status !== "active") {
      await destroySessionsForUser(secured.id);
    }
    if (secured.type === "delete-user") {
      await removeUserCredential(secured.id);
    }
    if (secured.type === "reset") {
      await resetDemoAuth();
    }
    return NextResponse.json(scopeStateForSession(state, session), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof PortalActionError) {
      return NextResponse.json(
        { ok: false, error: "action-not-allowed", action: error.action, portal: error.portal },
        { status: 403 },
      );
    }
    if (error instanceof PersistenceError) {
      return NextResponse.json({ ok: false, error: "persistence-failed" }, { status: 503 });
    }
    console.error("[portal-actions] Action failed.", error);
    return NextResponse.json({ ok: false, error: "action-failed" }, { status: 500 });
  }
}
