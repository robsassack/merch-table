import { getStepThreeState, type StepThreeState } from "@/lib/setup/step-three";
import {
  buildStorageMigrationConfirmation,
  getRuntimeStorageSnapshot,
  listStorageMigrationObjects,
  type RuntimeStorageSnapshot,
  type StorageAssetUsageSummary,
} from "@/lib/admin/storage-management";

export type AdminStorageSettingsData = StepThreeState & {
  runtimeStorage: RuntimeStorageSnapshot;
  assetUsage: StorageAssetUsageSummary;
  migrationConfirmation: string;
  modeSwitchRequiresMigration: boolean;
};

export async function buildAdminStorageSettingsData(input: {
  organizationId: string;
}) {
  const [settings, storageObjects] = await Promise.all([
    getStepThreeState(),
    listStorageMigrationObjects({ organizationId: input.organizationId }),
  ]);

  const runtimeStorage = getRuntimeStorageSnapshot();
  const activeStorageMode = runtimeStorage.provider ?? settings.storageMode;
  const modeSwitchRequiresMigration =
    settings.storageMode !== activeStorageMode && storageObjects.usage.hasAssets;

  return {
    ...settings,
    runtimeStorage,
    assetUsage: storageObjects.usage,
    migrationConfirmation: buildStorageMigrationConfirmation(
      storageObjects.usage.totalReferencedObjects,
    ),
    modeSwitchRequiresMigration,
  } satisfies AdminStorageSettingsData;
}
