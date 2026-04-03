import { withNormalizedCookieHeader } from "@/lib/auth/cookie-header";

export type GetSessionInput = {
  headers: Headers;
  query?: {
    disableCookieCache?: boolean;
    disableRefresh?: boolean;
  };
};

type GetSessionFn<TSession> = (input: GetSessionInput) => Promise<TSession>;

export async function getSessionWithStrictLookup<TSession>(input: {
  headers: Headers;
  getSession: GetSessionFn<TSession>;
}) {
  const normalizedHeaders = withNormalizedCookieHeader(input.headers);
  return input.getSession({
    headers: normalizedHeaders,
    query: {
      disableCookieCache: true,
    },
  });
}
