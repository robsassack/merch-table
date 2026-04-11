"use client";

import { StorageSettingsPanel } from "./setup-management-storage-panel";
import { SmtpSettingsPanel } from "./setup-management-subpanels/smtp-settings-panel";
import { StatusPanel } from "./setup-management-subpanels/status-panel";
import { SharedPanelProps } from "./setup-management-subpanels/shared";
import { StripeSettingsPanel } from "./setup-management-subpanels/stripe-settings-panel";

export { StatusPanel };

export function IntegrationsPanel({
  panelCardClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
}: SharedPanelProps) {
  return (
    <div className="space-y-4">
      <StripeSettingsPanel
        panelCardClassName={panelCardClassName}
        primaryButtonClassName={primaryButtonClassName}
        secondaryButtonClassName={secondaryButtonClassName}
      />
      <SmtpSettingsPanel
        panelCardClassName={panelCardClassName}
        primaryButtonClassName={primaryButtonClassName}
        secondaryButtonClassName={secondaryButtonClassName}
      />
      <StorageSettingsPanel
        panelCardClassName={panelCardClassName}
        primaryButtonClassName={primaryButtonClassName}
        secondaryButtonClassName={secondaryButtonClassName}
      />
    </div>
  );
}
