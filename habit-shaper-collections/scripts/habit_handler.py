"""Save the selected Habit Shaper habit ID for follow-up requests."""


HABIT_ID_VARIABLE = "HABIT_ID"


def _response_data(response):
    try:
        data = response.json()
    except ValueError:
        return None
    return data if isinstance(data, dict) else None


def on_habit_response(response, posting):
    """Save habit.id from a successful create-habit or get-specific-habit response."""
    if response.status_code not in (200, 201):
        print(f"[Posting] Habit ID tidak diperbarui: HTTP {response.status_code}.")
        return

    data = _response_data(response)
    habit = data.get("habit") if data is not None else None
    habit_id = habit.get("id") if isinstance(habit, dict) else None

    if not isinstance(habit_id, str) or not habit_id.strip():
        print("[Posting] Habit ID tidak diperbarui: field habit.id tidak ditemukan di respons JSON.")
        return

    posting.set_variable(HABIT_ID_VARIABLE, habit_id)
    print("[Posting] HABIT_ID berhasil disimpan untuk request habit berikutnya.")
