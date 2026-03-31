type RuntimeModelField = { name?: string };
type RuntimeModel = { fields?: RuntimeModelField[] };
type RuntimeModelData = { models?: Record<string, RuntimeModel> };
type RuntimeAwareClient = { _runtimeDataModel?: RuntimeModelData };

export function prismaModelSupportsField(
  client: unknown,
  modelName: string,
  fieldName: string,
) {
  const runtimeDataModel = (client as RuntimeAwareClient | null)?._runtimeDataModel;
  const model = runtimeDataModel?.models?.[modelName];
  const fields = model?.fields;

  if (!Array.isArray(fields)) {
    return true;
  }

  return fields.some((field) => field?.name === fieldName);
}
