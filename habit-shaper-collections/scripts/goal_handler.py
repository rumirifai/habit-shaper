"""Save the selected Habit Shaper goal ID for follow-up requests."""


GOAL_ID_VARIABLE = "GOAL_ID"


def _response_data(response):
    try:
        data = response.json()
    except ValueError:
        return None
    return data if isinstance(data, dict) else None


def on_goal_response(response, posting):
    """Save goal.id from a successful create-goal or get-specific-goal response."""
    if response.status_code not in (200, 201):
        print(f"[Posting] Goal ID tidak diperbarui: HTTP {response.status_code}.")
        return

    data = _response_data(response)
    goal = data.get("goal") if data is not None else None
    goal_id = goal.get("id") if isinstance(goal, dict) else None

    if not isinstance(goal_id, str) or not goal_id.strip():
        print("[Posting] Goal ID tidak diperbarui: field goal.id tidak ditemukan di respons JSON.")
        return

    posting.set_variable(GOAL_ID_VARIABLE, goal_id)
    print("[Posting] GOAL_ID berhasil disimpan untuk request goal berikutnya.")
