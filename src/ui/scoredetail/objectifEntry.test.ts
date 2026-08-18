import { describe, expect, it } from 'vitest'
import { defaultObjectifCardSelection } from '../../domain/model/landscape'
import { emptyPlayerResult, scorePlayerResult } from '../../domain/model/match'
import { buildInitialState, scoreDetailReducer } from './scoreDetailReducer'

const players = [{ id: 'p1', name: 'Alice', active: true }]

function stateWith(cards = defaultObjectifCardSelection()) {
  return buildInitialState(players, { type: 'Create' }, [], cards)
}

function inputAction(landscape: 'bamboo' | 'water' | 'village', key: string, value: number) {
  return { type: 'updateObjectifInput', playerId: 'p1', landscape, key, value } as const
}

describe('guided Objectif entry', () => {
  it('computes the landscape total from the entered counts', () => {
    // Bambou A, 3 groups of two tiles → 15 on the printed table
    const next = scoreDetailReducer(stateWith(), inputAction('bamboo', 'groups', 3))

    expect(next.results[0].objectifPoints.bamboo).toBe(15)
  })

  it('records what was entered, so reopening the match shows it back', () => {
    const next = scoreDetailReducer(stateWith(), inputAction('bamboo', 'groups', 3))

    expect(next.results[0].objectifInputs.bamboo).toEqual({ groups: 3 })
  })

  it('recomputes when one of several inputs changes', () => {
    const cards = { ...defaultObjectifCardSelection(), water: 'A' } as const
    let state = stateWith(cards)
    state = scoreDetailReducer(state, inputAction('water', 'largestGroupSize', 5))
    expect(state.results[0].objectifPoints.water).toBe(15)

    state = scoreDetailReducer(state, inputAction('water', 'touchesTopAndBottom', 1))

    expect(state.results[0].objectifPoints.water).toBe(20)
  })

  it('feeds the player total, so the header VP follows the guided entry', () => {
    const next = scoreDetailReducer(stateWith(), inputAction('bamboo', 'groups', 3))

    expect(scorePlayerResult(next.results[0])).toBe(15)
  })

  it('holds at zero while a required input is still missing rather than erroring', () => {
    const cards = { ...defaultObjectifCardSelection(), bamboo: 'B' } as const
    const next = scoreDetailReducer(stateWith(cards), inputAction('bamboo', 'groupsOf2', 2))

    // groupsOf3 / groupsOf4 not entered yet
    expect(next.results[0].objectifPoints.bamboo).toBe(0)
    expect(next.error).toBeUndefined()
  })

  it('leaves the other landscapes alone', () => {
    const next = scoreDetailReducer(stateWith(), inputAction('bamboo', 'groups', 3))

    expect(next.results[0].objectifPoints.water).toBe(0)
    expect(next.results[0].objectifPoints.village).toBe(0)
  })
})

describe('manual override', () => {
  it('lets a landscape fall back to a hand-typed total', () => {
    let state = stateWith()
    state = scoreDetailReducer(state, inputAction('bamboo', 'groups', 3))

    state = scoreDetailReducer(state, {
      type: 'setObjectifManual',
      playerId: 'p1',
      landscape: 'bamboo',
      manual: true,
    })
    state = scoreDetailReducer(state, {
      type: 'updateObjectifPoints',
      playerId: 'p1',
      landscape: 'bamboo',
      points: 42,
    })

    expect(state.results[0].objectifPoints.bamboo).toBe(42)
  })

  it('stops recomputing while the override is on', () => {
    let state = stateWith()
    state = scoreDetailReducer(state, {
      type: 'setObjectifManual',
      playerId: 'p1',
      landscape: 'bamboo',
      manual: true,
    })
    state = scoreDetailReducer(state, {
      type: 'updateObjectifPoints',
      playerId: 'p1',
      landscape: 'bamboo',
      points: 42,
    })

    state = scoreDetailReducer(state, inputAction('bamboo', 'groups', 3))

    expect(state.results[0].objectifPoints.bamboo).toBe(42)
  })

  it('recomputes from the stored inputs when the override is switched back off', () => {
    let state = stateWith()
    state = scoreDetailReducer(state, inputAction('bamboo', 'groups', 3))
    state = scoreDetailReducer(state, {
      type: 'setObjectifManual',
      playerId: 'p1',
      landscape: 'bamboo',
      manual: true,
    })
    state = scoreDetailReducer(state, {
      type: 'updateObjectifPoints',
      playerId: 'p1',
      landscape: 'bamboo',
      points: 42,
    })

    state = scoreDetailReducer(state, {
      type: 'setObjectifManual',
      playerId: 'p1',
      landscape: 'bamboo',
      manual: false,
    })

    expect(state.results[0].objectifPoints.bamboo).toBe(15)
  })

  it('starts the two neighbour-dependent cards in manual mode', () => {
    const cards = { ...defaultObjectifCardSelection(), village: 'A', water: 'C' } as const
    const state = stateWith(cards)

    expect(state.results[0].objectifManual.village).toBe(true)
    expect(state.results[0].objectifManual.water).toBe(true)
    expect(state.results[0].objectifManual.bamboo).toBe(false)
  })
})

describe('an empty result', () => {
  it('starts with no inputs and nothing overridden', () => {
    const result = emptyPlayerResult('p1')

    expect(result.objectifInputs.bamboo).toEqual({})
    expect(result.objectifManual.bamboo).toBe(false)
  })
})
