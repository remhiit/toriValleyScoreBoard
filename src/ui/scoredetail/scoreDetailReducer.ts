import {
  defaultObjectifCardSelection,
  LANDSCAPE_TYPES,
  type LandscapeType,
  type ObjectifCardSelection,
} from '../../domain/model/landscape'
import {
  objectifCard,
  scoreObjectifCard,
  type ObjectifCardInputs,
} from '../../domain/model/objectifCard'
import { emptyPlayerResult, type ParcheminValue, type PlayerResult } from '../../domain/model/match'
import type { Player } from '../../domain/model/player'
import type { ToriiColor } from '../../domain/model/torii'
import type { ScoreDetailMode, ScoreDetailState } from './scoreDetailTypes'

/**
 * The two neighbour-dependent cards can never be computed, so a result starts
 * with those landscapes already on manual entry — the player is never shown a
 * guided form that couldn't work.
 */
function withForcedManual(result: PlayerResult, cards: ObjectifCardSelection): PlayerResult {
  const objectifManual = { ...result.objectifManual }
  for (const landscape of LANDSCAPE_TYPES) {
    if (!objectifCard(landscape, cards[landscape]).computable) objectifManual[landscape] = true
  }
  return { ...result, objectifManual }
}

export function buildInitialState(
  players: Player[],
  mode: ScoreDetailMode,
  existingResults: PlayerResult[] = [],
  objectifCards: ObjectifCardSelection = defaultObjectifCardSelection(),
): ScoreDetailState {
  const results = players.map((player) =>
    withForcedManual(
      existingResults.find((r) => r.playerId === player.id) ?? emptyPlayerResult(player.id),
      objectifCards,
    ),
  )
  return { players, results, mode, objectifCards, error: undefined, saved: false }
}

/**
 * Points for one landscape from its entered counts. While the player is still
 * filling a multi-field card the inputs are legitimately incomplete, so an
 * invalid set scores 0 rather than raising — validation is the domain's job at
 * save time, not a reason to shout on every keystroke.
 */
function computeLandscapePoints(
  landscape: LandscapeType,
  cards: ObjectifCardSelection,
  inputs: ObjectifCardInputs,
): number {
  try {
    return scoreObjectifCard(landscape, cards[landscape], inputs)
  } catch {
    return 0
  }
}

export type ScoreDetailAction =
  | { type: 'updateToriiCount'; playerId: string; color: ToriiColor; count: number }
  | { type: 'updateParchemin'; playerId: string; value: ParcheminValue }
  | { type: 'setPinceauHolder'; playerId: string | undefined }
  | { type: 'updateObjectifPoints'; playerId: string; landscape: LandscapeType; points: number }
  | {
      type: 'updateObjectifInput'
      playerId: string
      landscape: LandscapeType
      key: string
      value: number
    }
  | {
      type: 'setObjectifManual'
      playerId: string
      landscape: LandscapeType
      manual: boolean
    }
  | { type: 'saveSucceeded' }
  | { type: 'saveFailed'; error: string }

function updateResult(
  results: PlayerResult[],
  playerId: string,
  update: (result: PlayerResult) => PlayerResult,
): PlayerResult[] {
  return results.map((result) => (result.playerId === playerId ? update(result) : result))
}

export function scoreDetailReducer(
  state: ScoreDetailState,
  action: ScoreDetailAction,
): ScoreDetailState {
  switch (action.type) {
    case 'updateToriiCount':
      return {
        ...state,
        error: undefined,
        results: updateResult(state.results, action.playerId, (result) => ({
          ...result,
          toriiCounts: { ...result.toriiCounts, [action.color]: action.count },
        })),
      }
    case 'updateParchemin':
      return {
        ...state,
        error: undefined,
        results: updateResult(state.results, action.playerId, (result) => ({
          ...result,
          parcheminValue: action.value,
        })),
      }
    case 'setPinceauHolder':
      // Only one physical Pinceau token exists (rulebook p.5): holding it is exclusive.
      return {
        ...state,
        error: undefined,
        results: state.results.map((result) => ({
          ...result,
          hasPinceau: result.playerId === action.playerId,
        })),
      }
    case 'updateObjectifPoints':
      return {
        ...state,
        error: undefined,
        results: updateResult(state.results, action.playerId, (result) => ({
          ...result,
          objectifPoints: { ...result.objectifPoints, [action.landscape]: action.points },
        })),
      }
    case 'updateObjectifInput':
      return {
        ...state,
        error: undefined,
        results: updateResult(state.results, action.playerId, (result) => {
          const inputs = { ...result.objectifInputs[action.landscape], [action.key]: action.value }
          const objectifInputs = { ...result.objectifInputs, [action.landscape]: inputs }
          // A hand-typed total wins: keep recording the counts, but don't let
          // them overwrite the number the player deliberately entered.
          if (result.objectifManual[action.landscape]) return { ...result, objectifInputs }
          return {
            ...result,
            objectifInputs,
            objectifPoints: {
              ...result.objectifPoints,
              [action.landscape]: computeLandscapePoints(
                action.landscape,
                state.objectifCards,
                inputs,
              ),
            },
          }
        }),
      }
    case 'setObjectifManual':
      return {
        ...state,
        error: undefined,
        results: updateResult(state.results, action.playerId, (result) => {
          const objectifManual = { ...result.objectifManual, [action.landscape]: action.manual }
          // Switching the override back off restores the computed value from
          // whatever counts were already entered.
          if (action.manual) return { ...result, objectifManual }
          return {
            ...result,
            objectifManual,
            objectifPoints: {
              ...result.objectifPoints,
              [action.landscape]: computeLandscapePoints(
                action.landscape,
                state.objectifCards,
                result.objectifInputs[action.landscape],
              ),
            },
          }
        }),
      }
    case 'saveSucceeded':
      return { ...state, saved: true, error: undefined }
    case 'saveFailed':
      return { ...state, error: action.error }
  }
}
