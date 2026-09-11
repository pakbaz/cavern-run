import type { CaveSession } from '../game/engine/CaveSession';
import { playCave, replayCave, type BotRun } from './bot';
import { referenceEarlyRoutes } from './referenceEarlyRoutes';
import { referenceLateRoutes } from './referenceLateRoutes';

/** The same verified inputs work on a fresh cave and on its place in a full run. */
export function playReferenceStage(session: CaveSession): BotRun {
  const route = referenceEarlyRoutes[session.spec.id] ?? referenceLateRoutes[session.spec.id];
  return route ? replayCave(session, route) : playCave(session);
}
