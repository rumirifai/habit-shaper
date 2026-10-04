import { prisma } from "../lib/prisma.js";
import type { DeleteHabitInput } from "../schemas/habits.js";

export type DeleteHabitResult =
  | "deleted"
  | "missing"
  | "replacements-required"
  | "invalid-replacement";

export class HabitDisappearedError extends Error {
  constructor() {
    super("Habit disappeared during deletion transaction.");
    this.name = "HabitDisappearedError";
  }
}

export async function deleteHabitAndReplaceGoals(
  ownerId: string,
  habitId: string,
  input: DeleteHabitInput,
): Promise<DeleteHabitResult> {
  return prisma.$transaction(
    async (tx) => {
      const habit = await tx.habit.findFirst({
        where: { id: habitId, ownerId },
        select: { id: true, goalLinks: { select: { goalId: true } } },
      });
      if (habit === null) return "missing";

      const goalCounts = await tx.goalHabit.groupBy({
        by: ["goalId"],
        where: { goalId: { in: habit.goalLinks.map(({ goalId }) => goalId) } },
        _count: { _all: true },
      });
      const affectedGoalIds = goalCounts
        .filter((item) => item._count._all === 1)
        .map(({ goalId }) => goalId);

      const replacementByGoal = new Map(
        input.goalReplacements.map(({ goalId, habitId: replacementHabitId }) => [goalId, replacementHabitId]),
      );
      const replacementGoalIds = new Set([
        ...replacementByGoal.keys(),
        ...input.newHabitGoalIds,
      ]);
      if (
        affectedGoalIds.length !== replacementGoalIds.size ||
        affectedGoalIds.some((goalId) => !replacementGoalIds.has(goalId))
      ) {
        return "replacements-required";
      }

      const replacementIds = [...replacementByGoal.values()];
      const replacements = await tx.habit.findMany({
        where: { id: { in: replacementIds }, ownerId, NOT: { id: habitId } },
        select: { id: true },
      });
      if (replacements.length !== new Set(replacementIds).size) return "invalid-replacement";

      let newHabitId: string | null = null;
      if (input.newHabit !== undefined) {
        const newHabit = await tx.habit.create({
          data: {
            ownerId,
            title: input.newHabit.title,
            type: input.newHabit.type,
            description: input.newHabit.description ?? null,
          },
          select: { id: true },
        });
        newHabitId = newHabit.id;
      }

      const newHabitLinks = input.newHabitGoalIds.map((goalId) => {
        if (newHabitId === null) throw new Error("Validated new habit data missing.");
        return { goalId, habitId: newHabitId };
      });
      await tx.goalHabit.createMany({
        data: [
          ...[...replacementByGoal].map(([goalId, replacementHabitId]) => ({
            goalId,
            habitId: replacementHabitId,
          })),
          ...newHabitLinks,
        ],
      });
      const deleted = await tx.habit.deleteMany({ where: { id: habitId, ownerId } });
      if (deleted.count === 0) throw new HabitDisappearedError();
      return "deleted";
    },
    { isolationLevel: "Serializable" },
  );
}
