import { useCallback, useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";

import { resolveNormalizedFeaturedReleaseId } from "./featured-release";
import type { ReleaseRecord } from "./types";
import type { useReleaseManagementState } from "./use-release-management-state";

type ReleaseManagementState = ReturnType<typeof useReleaseManagementState>;

type UseFeaturedReleaseSyncInput = {
  featuredReleaseId: string | null;
  releases: ReleaseRecord[];
  pendingFeaturedReleaseId: string | null;
  setPendingFeaturedReleaseId: Dispatch<SetStateAction<string | null>>;
  setFeaturedReleaseId: ReleaseManagementState["setFeaturedReleaseId"];
  setError: ReleaseManagementState["setError"];
  setNotice: ReleaseManagementState["setNotice"];
};

export function useReleaseManagementFeaturedReleaseSync({
  featuredReleaseId,
  releases,
  pendingFeaturedReleaseId,
  setPendingFeaturedReleaseId,
  setFeaturedReleaseId,
  setError,
  setNotice,
}: UseFeaturedReleaseSyncInput) {
  const onSetFeaturedRelease = useCallback(async (releaseId: string) => {
    setError(null);
    setNotice(null);
    setPendingFeaturedReleaseId(releaseId);

    try {
      const response = await fetch("/api/admin/settings/store", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ featuredReleaseId: releaseId }),
      });
      const body = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string;
            data?: { featuredReleaseId?: string | null };
          }
        | null;

      if (!response.ok || !body?.ok || !body.data) {
        throw new Error(body?.error ?? "Could not set featured release.");
      }

      setFeaturedReleaseId(body.data.featuredReleaseId ?? null);
      setNotice("Featured release updated.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not set featured release.");
    } finally {
      setPendingFeaturedReleaseId(null);
    }
  }, [setError, setFeaturedReleaseId, setNotice, setPendingFeaturedReleaseId]);

  useEffect(() => {
    if (pendingFeaturedReleaseId !== null) {
      return;
    }

    const normalizedFeaturedReleaseId = resolveNormalizedFeaturedReleaseId({
      currentFeaturedReleaseId: featuredReleaseId,
      releases,
    });

    if (normalizedFeaturedReleaseId === featuredReleaseId) {
      return;
    }

    setPendingFeaturedReleaseId(normalizedFeaturedReleaseId ?? "__clear__");

    const payload = { featuredReleaseId: normalizedFeaturedReleaseId };
    void fetch("/api/admin/settings/store", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((response) => response.json().catch(() => null).then((body) => ({ response, body })))
      .then(({ response, body }) => {
        if (!response.ok || !body?.ok || !body?.data) {
          return;
        }

        setFeaturedReleaseId(body.data.featuredReleaseId ?? null);
      })
      .finally(() => {
        setPendingFeaturedReleaseId(null);
      });
  }, [
    featuredReleaseId,
    pendingFeaturedReleaseId,
    releases,
    setFeaturedReleaseId,
    setPendingFeaturedReleaseId,
  ]);

  return {
    onSetFeaturedRelease,
  };
}
