"use client";

import { ReleaseManagementPanelView } from "./release-management/release-management-panel-view";
import { useReleaseManagementController } from "./release-management/use-release-management-controller";

export function ReleaseManagementPanel() {
  const controller = useReleaseManagementController();
  return <ReleaseManagementPanelView controller={controller} />;
}
