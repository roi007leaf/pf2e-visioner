/**
 * Shared helper utilities for cover logic
 */

import { COVER_STATES } from '../constants.js';
import { systemIconPath } from '../system-adapter.js';

export function getCoverBonusByState(state) {
  const cfg = COVER_STATES[state];
  return cfg ? cfg.bonusAC : 0;
}

export function getCoverStealthBonusByState(state) {
  const cfg = COVER_STATES[state];
  return cfg ? cfg.bonusStealth : 0;
}

export function getCoverLabel(state) {
  const entry = COVER_STATES[state];
  if (entry?.label) {
    try {
      return game.i18n.localize(entry.label);
    } catch (_) {}
  }
  return state ? state.charAt(0).toUpperCase() + state.slice(1) : 'No';
}

export function getCoverImageForState(state) {
  switch (state) {
    case 'lesser':
      return systemIconPath('equipment/shields/buckler.webp');
    case 'greater':
      return systemIconPath('equipment/shields/tower-shield.webp');
    case 'standard':
    default:
      return systemIconPath('equipment/shields/steel-shield.webp');
  }
}

export function isIgnoredActorTypeForCover(actorType) {
  return actorType === 'loot' || actorType === 'vehicle' || actorType === 'party';
}

export const ORIGIN_SIG_PREFIX = 'origin:signature:';

export function predicateHasSignature(predicate, signature) {
  try {
    const needle = `${ORIGIN_SIG_PREFIX}${signature}`;
    if (!predicate) return false;
    if (Array.isArray(predicate)) return predicate.includes(needle);
    if (typeof predicate === 'string') {
      if (predicate.includes(needle)) return true;
      if (predicate.trim().startsWith('[')) {
        try {
          const arr = JSON.parse(predicate);
          if (Array.isArray(arr)) return arr.includes(needle);
        } catch (_) {}
      }
      return false;
    }
    if (typeof predicate === 'object') {
      for (const key of Object.keys(predicate)) {
        const val = predicate[key];
        if (Array.isArray(val) && val.includes(needle)) return true;
      }
    }
  } catch (_) {}
  return false;
}

export function extractSignaturesFromPredicate(predicate) {
  const results = new Set();
  const pushFrom = (arr) => {
    for (const p of arr) {
      const s = String(p);
      if (s.startsWith(ORIGIN_SIG_PREFIX)) {
        results.add(s.slice(ORIGIN_SIG_PREFIX.length));
      }
    }
  };
  try {
    if (!predicate) return [];
    if (Array.isArray(predicate)) {
      pushFrom(predicate);
    } else if (typeof predicate === 'string') {
      if (predicate.trim().startsWith('[')) {
        try {
          const arr = JSON.parse(predicate);
          if (Array.isArray(arr)) pushFrom(arr);
        } catch (_) {}
      } else if (predicate.startsWith(ORIGIN_SIG_PREFIX)) {
        results.add(predicate.slice(ORIGIN_SIG_PREFIX.length));
      }
    } else if (typeof predicate === 'object') {
      for (const key of Object.keys(predicate)) {
        const val = predicate[key];
        if (Array.isArray(val)) pushFrom(val);
      }
    }
  } catch (_) {}
  return [...results];
}

// Extract token IDs referenced via cover-against:<tokenId> in a predicate
export function extractCoverAgainstFromPredicate(predicate) {
  const results = new Set();
  const tryPushFrom = (arr) => {
    for (const p of arr) {
      const s = String(p);
      if (s.startsWith('cover-against:')) {
        results.add(s.slice('cover-against:'.length));
      }
    }
  };
  try {
    if (!predicate) return [];
    if (Array.isArray(predicate)) {
      tryPushFrom(predicate);
    } else if (typeof predicate === 'string') {
      if (predicate.trim().startsWith('[')) {
        try {
          const arr = JSON.parse(predicate);
          if (Array.isArray(arr)) tryPushFrom(arr);
        } catch (_) {}
      } else if (predicate.startsWith('cover-against:')) {
        results.add(predicate.slice('cover-against:'.length));
      }
    } else if (typeof predicate === 'object') {
      // Common PF2e predicate shapes: { or: [...] }, { and: [...] }, { not: [...] }
      const allArrays = [];
      if (Array.isArray(predicate.or)) allArrays.push(predicate.or);
      if (Array.isArray(predicate.and)) allArrays.push(predicate.and);
      if (Array.isArray(predicate.not)) allArrays.push(predicate.not);
      for (const arr of allArrays) tryPushFrom(arr);
    }
  } catch (_) {}
  return [...results];
}

export function predicateHasCoverAgainst(predicate, tokenId) {
  try {
    return extractCoverAgainstFromPredicate(predicate).includes(String(tokenId));
  } catch (_) {
    return false;
  }
}
