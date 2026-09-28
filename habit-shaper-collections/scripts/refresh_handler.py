"""Maintain Posting's auth variables from the Habit Shaper auth responses."""

from http.cookies import SimpleCookie


ACCESS_TOKEN_VARIABLE = "ACCESS_TOKEN"
REFRESH_TOKEN_VARIABLE = "REFRESH_TOKEN"
REFRESH_COOKIE_NAME = "refreshToken"


def _clear_tokens(posting):
    posting.clear_variable(ACCESS_TOKEN_VARIABLE)
    posting.clear_variable(REFRESH_TOKEN_VARIABLE)


def _response_data(response):
    try:
        data = response.json()
    except ValueError:
        return None
    return data if isinstance(data, dict) else None


def _refresh_cookie(response):
    cookie = SimpleCookie()
    for header in response.headers.get_list("set-cookie"):
        cookie.load(header)
    morsel = cookie.get(REFRESH_COOKIE_NAME)
    return morsel.value if morsel is not None and morsel.value else None


def on_login_response(response, posting):
    """Save accessToken from JSON and refreshToken from the HttpOnly cookie."""
    if response.status_code != 200:
        _clear_tokens(posting)
        print(f"[Posting] Login gagal: HTTP {response.status_code}.")
        return

    data = _response_data(response)
    access_token = data.get("accessToken") if data is not None else None
    refresh_token = _refresh_cookie(response)

    if not isinstance(access_token, str) or not access_token:
        _clear_tokens(posting)
        print("[Posting] Login gagal diproses: accessToken tidak ada di respons JSON.")
        return

    posting.set_variable(ACCESS_TOKEN_VARIABLE, access_token)
    if isinstance(refresh_token, str) and refresh_token:
        posting.set_variable(REFRESH_TOKEN_VARIABLE, refresh_token)
        print("[Posting] Login berhasil; access dan refresh token tersimpan.")
    else:
        posting.clear_variable(REFRESH_TOKEN_VARIABLE)
        print("[Posting] Access token tersimpan, tetapi cookie refreshToken tidak ditemukan.")


def on_refresh_response(response, posting):
    """Replace the access token; refresh itself does not rotate the cookie."""
    if response.status_code != 200:
        _clear_tokens(posting)
        print(f"[Posting] Refresh gagal: HTTP {response.status_code}; token lokal dihapus.")
        return

    data = _response_data(response)
    access_token = data.get("accessToken") if data is not None else None
    if not isinstance(access_token, str) or not access_token:
        _clear_tokens(posting)
        print("[Posting] Refresh gagal diproses: accessToken tidak ada di respons JSON.")
        return

    posting.set_variable(ACCESS_TOKEN_VARIABLE, access_token)
    print("[Posting] Access token berhasil diperbarui.")


def on_logout_response(response, posting):
    """Forget local credentials after a successful logout."""
    if response.status_code == 204:
        _clear_tokens(posting)
        print("[Posting] Logout berhasil; token lokal dihapus.")
    else:
        print(f"[Posting] Logout gagal: HTTP {response.status_code}; token lokal dipertahankan.")
