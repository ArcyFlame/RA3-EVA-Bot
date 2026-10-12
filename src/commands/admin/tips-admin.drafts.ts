import { randomBytes } from 'node:crypto';
import { GameId } from '../../config/games';
import { Tip, TipValidationError } from '../../content/tips';

interface DraftScope {
  guild: string;
  user: string;
  game: GameId;
  id: number;
  revision: number;
}
interface Draft extends DraftScope {
  tip: Tip;
  expires: number;
}

export class TipDraftStore {
  private readonly drafts = new Map<string, Draft>();

  create(scope: DraftScope, tip: Tip): string {
    for (const [token, draft] of this.drafts)
      if (draft.expires <= Date.now()) this.drafts.delete(token);
    const owned = [...this.drafts.entries()].filter(
      ([, draft]) => draft.guild === scope.guild && draft.user === scope.user,
    );
    if (owned.length >= 5) this.drafts.delete(owned[0][0]);
    if (this.drafts.size >= 500)
      throw new TipValidationError('Too many open tip drafts. Please try again later.');
    const token = randomBytes(8).toString('hex');
    this.drafts.set(token, {
      ...scope,
      tip: structuredClone(tip),
      expires: Date.now() + 15 * 60_000,
    });
    return token;
  }

  get(token: string | undefined, scope: DraftScope): Tip {
    const draft = token ? this.drafts.get(token) : undefined;
    if (draft && draft.expires <= Date.now()) this.drafts.delete(token!);
    if (
      !draft ||
      draft.expires <= Date.now() ||
      draft.guild !== scope.guild ||
      draft.user !== scope.user ||
      draft.game !== scope.game ||
      draft.id !== scope.id ||
      draft.revision !== scope.revision
    )
      throw new TipValidationError(
        'This draft expired or is unavailable. Open Add Tip or Edit Tip again.',
      );
    return structuredClone(draft.tip);
  }

  remove(token: string): void {
    this.drafts.delete(token);
  }
}

export const tipDrafts = new TipDraftStore();
