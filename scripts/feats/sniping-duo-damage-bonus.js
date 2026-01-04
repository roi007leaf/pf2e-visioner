import { FeatsHandler } from '../chat/services/FeatsHandler.js';
import { MODULE_ID } from '../constants.js';
import { getLogger } from '../utils/logger.js';

const FLAG_KEY = 'snipingDuoNextStrikeDamageBonus';

function nowMs() {
    return Date.now();
}

function normalizeOutcome(outcome) {
    try {
        const raw = String(outcome ?? '').trim();
        if (!raw) return null;
        return raw
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/_/g, '-')
            .replace(/criticalsuccess/g, 'critical-success');
    } catch {
        return null;
    }
}

function isSuccessfulStrikeOutcome(outcome) {
    const n = normalizeOutcome(outcome);
    if (!n) return false;
    return n === 'success' || n === 'critical-success' || n === 'critical-successes' || n === 'critical-successful';
}

function isStrikeContext(ctx) {
    try {
        if (!ctx) return false;
        if (ctx.type === 'strike-attack-roll') return true;
        const options = ctx.options;
        const arr = Array.isArray(options) ? options : options instanceof Set ? Array.from(options) : [];
        if (arr.includes('action:strike')) return true;
        return false;
    } catch {
        return false;
    }
}

function getActorKey(actor) {
    try {
        return actor?.uuid || actor?.id || null;
    } catch {
        return null;
    }
}

function normalizeActorKey(key) {
    try {
        const raw = String(key || '').trim();
        if (!raw) return null;
        const parts = raw.split('.');
        const id = parts[parts.length - 1] || raw;
        return { raw, id };
    } catch {
        return null;
    }
}

function actorKeysMatch(a, b) {
    try {
        const na = normalizeActorKey(a);
        const nb = normalizeActorKey(b);
        return !!(na && nb && (na.raw === nb.raw || na.id === nb.id));
    } catch {
        return false;
    }
}

function findTokenByActorKey(actorKey) {
    try {
        const key = normalizeActorKey(actorKey);
        if (!key) return null;
        const tokens = canvas?.tokens?.placeables || [];
        for (const t of tokens) {
            const a = t?.actor;
            if (!a) continue;
            const tKey = getActorKey(a);
            if (tKey && actorKeysMatch(key.raw, tKey)) return t;
        }
        return null;
    } catch {
        return null;
    }
}

function readActorFlag(actor, key) {
    try {
        return actor?.getFlag?.(MODULE_ID, key) ?? actor?.flags?.[MODULE_ID]?.[key] ?? null;
    } catch {
        return null;
    }
}

function isInCombat() {
    return !!(game.combat?.started && game.combat?.combatants?.size > 0);
}

function getCombatantIndexForActor(actor) {
    try {
        const combat = game.combat;
        if (!combat) return null;

        const actorKey = getActorKey(actor);
        if (!actorKey) return null;

        const turns = combat.turns || combat.combatants?.contents || Array.from(combat.combatants || []);
        const arr = Array.isArray(turns) ? turns : [];

        for (let i = 0; i < arr.length; i++) {
            const c = arr[i];
            const cActor = c?.actor;
            const cActorKey = getActorKey(cActor);
            if (cActorKey && actorKeysMatch(actorKey, cActorKey)) return i;

            const tokenId = c?.tokenId ?? c?.token?.id;
            const t = tokenId ? canvas?.tokens?.get?.(tokenId) : null;
            const tActorKey = getActorKey(t?.actor);
            if (tActorKey && actorKeysMatch(actorKey, tActorKey)) return i;
        }

        return null;
    } catch {
        return null;
    }
}

function computeExpiryForNextTurnEnd(actor) {
    try {
        if (!isInCombat()) return null;
        const combat = game.combat;
        const actorIndex = getCombatantIndexForActor(actor);
        if (actorIndex === null) return null;

        const currentTurn = Number(combat.turn ?? 0);
        const currentRound = Number(combat.round ?? 0);

        const expiresRound = actorIndex > currentTurn ? currentRound : currentRound + 1;
        return {
            combatId: combat.id ?? combat._id ?? null,
            actorIndex,
            round: expiresRound,
        };
    } catch {
        return null;
    }
}

function isExpired(record) {
    try {
        const expiry = record?.expires;
        if (!expiry) return false;

        const combat = game.combat;
        if (!combat) return false;

        const combatId = combat.id ?? combat._id ?? null;
        if (expiry.combatId && combatId && expiry.combatId !== combatId) return true;

        const round = Number(combat.round ?? 0);
        const turn = Number(combat.turn ?? 0);

        if (round > Number(expiry.round ?? round)) return true;
        if (round < Number(expiry.round ?? round)) return false;

        return turn > Number(expiry.actorIndex ?? turn);
    } catch {
        return false;
    }
}

async function getBonusState(actor) {
    try {
        const state = (await actor?.getFlag?.(MODULE_ID, FLAG_KEY)) ?? actor?.flags?.[MODULE_ID]?.[FLAG_KEY] ?? null;
        if (!state || typeof state !== 'object') return {};
        return state;
    } catch {
        return {};
    }
}

async function setBonusState(actor, state) {
    try {
        if (actor?.setFlag) {
            await actor.setFlag(MODULE_ID, FLAG_KEY, state);
            return;
        }
        actor.flags = actor.flags || {};
        actor.flags[MODULE_ID] = actor.flags[MODULE_ID] || {};
        actor.flags[MODULE_ID][FLAG_KEY] = state;
    } catch {
        /* noop */
    }
}

async function clearBonusState(actor) {
    try {
        if (actor?.unsetFlag) {
            await actor.unsetFlag(MODULE_ID, FLAG_KEY);
            return;
        }
        if (actor?.flags?.[MODULE_ID]) {
            delete actor.flags[MODULE_ID][FLAG_KEY];
        }
    } catch {
        /* noop */
    }
}

function resolveSnipingDuoOtherMember(attackerActor) {
    try {
        const spotterKey = readActorFlag(attackerActor, 'snipingDuoSpotterActorUuid');
        if (spotterKey && FeatsHandler.hasFeat(attackerActor, 'sniping-duo-dedication')) {
            return findTokenByActorKey(spotterKey)?.actor ?? null;
        }

        const sniperKey = readActorFlag(attackerActor, 'snipingDuoSniperActorUuid');
        if (!sniperKey) return null;

        const sniperToken = findTokenByActorKey(sniperKey);
        if (!sniperToken?.actor) return null;
        if (!FeatsHandler.hasFeat(sniperToken, 'sniping-duo-dedication')) return null;

        const sniperSpotterKey = readActorFlag(sniperToken.actor, 'snipingDuoSpotterActorUuid');
        const attackerKey = getActorKey(attackerActor);
        if (!sniperSpotterKey || !attackerKey) return null;
        if (!actorKeysMatch(sniperSpotterKey, attackerKey)) return null;

        return sniperToken.actor;
    } catch {
        return null;
    }
}

async function grantSnipingDuoDamageBonus({ attackerActor, targetActor }) {
    const log = getLogger('SnipingDuo/DamageBonus');

    try {
        if (!attackerActor || !targetActor) return;

        const otherMember = resolveSnipingDuoOtherMember(attackerActor);
        if (!otherMember) return;

        const targetKey = getActorKey(targetActor);
        if (!targetKey) return;

        const expiry = computeExpiryForNextTurnEnd(otherMember);

        const state = await getBonusState(otherMember);
        state[targetKey] = {
            targetActorKey: targetKey,
            grantedByActorKey: getActorKey(attackerActor),
            createdAt: nowMs(),
            expires: expiry,
        };
        await setBonusState(otherMember, state);

        log.debug('Granted Sniping Duo damage bonus', () => ({
            target: targetActor?.name,
            otherMember: otherMember?.name,
            expires: expiry,
        }));
    } catch (e) {
        log.warn('Failed to grant Sniping Duo damage bonus', () => ({ error: String(e?.message || e) }));
    }
}

async function consumeSnipingDuoDamageBonus({ actor, targetActor }) {
    try {
        if (!actor || !targetActor) return null;

        const state = await getBonusState(actor);
        const targetKey = getActorKey(targetActor);
        if (!targetKey || !state[targetKey]) return null;

        const rec = state[targetKey];
        if (isExpired(rec)) {
            delete state[targetKey];
            await setBonusState(actor, state);
            return null;
        }

        delete state[targetKey];
        const remaining = Object.keys(state).length;
        if (remaining === 0) await clearBonusState(actor);
        else await setBonusState(actor, state);

        return rec;
    } catch {
        return null;
    }
}

function extractWeaponDiceCount(context, roll) {
    try {
        const fromCtx =
            Number(context?.weaponDamageDice ?? context?.damageDice ?? context?.damage?.dice ?? NaN);
        if (Number.isFinite(fromCtx) && fromCtx > 0) return fromCtx;

        const itemDice = Number(context?.item?.system?.damage?.dice ?? NaN);
        if (Number.isFinite(itemDice) && itemDice > 0) return itemDice;

        const formula = String(roll?.formula ?? roll?._formula ?? '').trim();
        const m = formula.match(/^\s*(\d+)?d(\d+)/i);
        if (m) return Number(m[1] || 1);

        return 1;
    } catch {
        return 1;
    }
}

function applyDamageModifier(context, bonus) {
    try {
        if (!context) return false;

        const modifiers = context.modifiers || context.damageModifiers || context.damage?.modifiers;
        if (!Array.isArray(modifiers)) return false;

        modifiers.push({
            label: game.i18n?.localize?.('PF2E_VISIONER.FEAT.SNIPING_DUO_DEDICATION') || 'Sniping Duo Dedication',
            modifier: bonus,
            type: 'circumstance',
        });

        return true;
    } catch {
        return false;
    }
}

async function handleCreateChatMessage(message) {
    const log = getLogger('SnipingDuo/DamageBonus');

    try {
        const ctx = message?.flags?.pf2e?.context;
        if (!isStrikeContext(ctx)) return;

        const outcome = ctx?.outcome ?? ctx?.degreeOfSuccess ?? message?.flags?.pf2e?.outcome;
        if (!isSuccessfulStrikeOutcome(outcome)) return;

        const attackerTokenId = message?.speaker?.token;
        const attackerToken = attackerTokenId ? canvas?.tokens?.get?.(attackerTokenId) : null;
        const attackerActor = attackerToken?.actor ?? game.actors?.get?.(message?.speaker?.actor) ?? null;

        const targetTokenId =
            ctx?.target?.token ?? message?.flags?.pf2e?.target?.token ?? message?.flags?.pf2e?.context?.target?.token;
        const targetToken = targetTokenId ? canvas?.tokens?.get?.(targetTokenId) : null;
        const targetActor = targetToken?.actor ?? null;

        if (!attackerActor || !targetActor) return;

        await grantSnipingDuoDamageBonus({ attackerActor, targetActor });
    } catch (e) {
        log.warn('Failed to process strike for Sniping Duo damage bonus', () => ({
            error: String(e?.message || e),
        }));
    }
}

async function handlePreRollDamage(...args) {
    const log = getLogger('SnipingDuo/DamageBonus');

    try {
        const roll = args.find((a) => a && typeof a === 'object' && ('formula' in a || '_formula' in a)) || null;
        const context = args.find((a) => a && typeof a === 'object' && (a.actor || a.target || a.item || a.modifiers)) || null;

        const actor = context?.actor ?? context?.origin?.actor ?? null;
        const target = context?.target ?? context?.context?.target ?? null;
        const targetActor = target?.actor ?? target ?? null;

        if (!actor || !targetActor) return;

        const rec = await consumeSnipingDuoDamageBonus({ actor, targetActor });
        if (!rec) return;

        const dice = extractWeaponDiceCount(context, roll);
        const bonus = Math.max(1, Math.floor(dice)) * 1;

        const applied = applyDamageModifier(context, bonus);

        log.debug('Applied Sniping Duo damage bonus', () => ({
            actor: actor?.name,
            target: targetActor?.name,
            dice,
            bonus,
            applied,
        }));
    } catch (e) {
        log.warn('Failed to apply Sniping Duo damage bonus', () => ({ error: String(e?.message || e) }));
    }
}

async function handleEndTurn(combatant) {
    const log = getLogger('SnipingDuo/DamageBonus');

    try {
        const actor = combatant?.actor;
        if (!actor) return;

        const state = await getBonusState(actor);
        const keys = Object.keys(state);
        if (keys.length === 0) return;

        let changed = false;
        for (const k of keys) {
            if (isExpired(state[k])) {
                delete state[k];
                changed = true;
            }
        }

        if (!changed) return;

        if (Object.keys(state).length === 0) await clearBonusState(actor);
        else await setBonusState(actor, state);

        log.debug('Expired Sniping Duo damage bonus records at end of turn', () => ({ actor: actor?.name }));
    } catch (e) {
        log.warn('Failed to expire Sniping Duo damage bonus records', () => ({ error: String(e?.message || e) }));
    }
}

let hooksRegistered = false;

export function registerSnipingDuoDamageBonusHooks() {
    if (hooksRegistered) return;
    hooksRegistered = true;

    Hooks.on('createChatMessage', (message) => {
        try {
            const age = nowMs() - Number(message?.timestamp ?? nowMs());
            if (age > 10_000) return;
        } catch {
            /* ignore */
        }
        return handleCreateChatMessage(message);
    });

    Hooks.on('pf2e.preRollDamage', (...args) => handlePreRollDamage(...args));

    Hooks.on('pf2e.endTurn', (combatant) => handleEndTurn(combatant));
}

export const SnipingDuoDamageBonus = {
    _test: {
        normalizeOutcome,
        isSuccessfulStrikeOutcome,
        computeExpiryForNextTurnEnd,
        isExpired,
        extractWeaponDiceCount,
        applyDamageModifier,
        grantSnipingDuoDamageBonus,
        consumeSnipingDuoDamageBonus,
        handleCreateChatMessage,
        handlePreRollDamage,
    },
};
