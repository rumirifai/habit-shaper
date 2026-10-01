export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
};

let accessToken: string | null = null;
let currentUser: AuthUser | null = null;

export function setAuthSession(token: string | null, user: AuthUser | null): void {
  accessToken = token;
  currentUser = user;
}

export function getAuthSession(): { accessToken: string | null; user: AuthUser | null } {
  return { accessToken, user: currentUser };
}
