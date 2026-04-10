type ResolvePlayTrackModeInput = {
  hasLoadedHowl: boolean;
  loadedTrackId: string | null;
  resolvedActiveTrackId: string | null;
  requestedTrackId: string;
};

export function resolvePlayTrackMode(input: ResolvePlayTrackModeInput) {
  if (
    input.hasLoadedHowl &&
    input.loadedTrackId === input.requestedTrackId &&
    input.resolvedActiveTrackId === input.requestedTrackId
  ) {
    return "toggle-current";
  }

  return "start-new";
}

