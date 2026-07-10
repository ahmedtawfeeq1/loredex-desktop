/**
 * Pure tour-playback logic (story 10.5): what applying a step means in terms
 * of the story 10.3 navigation primitives — auto-open the owning project
 * cluster, expand the owning topic atom, highlight the step's nodes. The
 * store executes the action; this module just decides it (unit-tested).
 */
import type { AtlasLevel, AtlasScope, TourStep } from '../../../../shared/types'

export interface PlaybackAction {
  /** navigate('learn', {project}) needed to reveal the step's cluster; null = already there */
  navigateTo: { level: 'learn'; project: string } | null
  /** expandedTopic key (`<project>/<topic>`) so the step's atom is open; null = none */
  expandTopic: string | null
  /** node ids to highlight + fit the viewport to */
  highlight: string[]
}

export function playbackActionFor(
  step: TourStep,
  level: AtlasLevel,
  scope: AtlasScope,
): PlaybackAction {
  const project = step.project ?? null
  const needsNavigate =
    project !== null && (level === 'overview' || scope.project !== project)
  return {
    navigateTo: needsNavigate && project ? { level: 'learn', project } : null,
    expandTopic: step.project && step.topic ? `${step.project}/${step.topic}` : null,
    highlight: step.nodeIds,
  }
}

/** Prev/next clamp: playback never walks off either end. */
export function clampStep(step: number, count: number): number {
  if (count <= 0) return 0
  return Math.min(Math.max(step, 0), count - 1)
}
