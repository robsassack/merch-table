import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { SUPPORTED_CURRENCY_CODES } from "@/lib/setup/currencies";

export const stepOneSchema = z.object({
  orgName: z.string().trim().min(2, "Organization name is required.").max(120),
  storeName: z.string().trim().min(2, "Store name is required.").max(120),
  contactEmail: z.email("Enter a valid contact email.").max(320),
  currency: z.enum(SUPPORTED_CURRENCY_CODES).default("USD"),
});

export type StepOneInput = z.infer<typeof stepOneSchema>;

export type StepOneState = {
  orgName: string;
  storeName: string;
  contactEmail: string;
  currency: string;
};

const defaultState: StepOneState = {
  orgName: "",
  storeName: "",
  contactEmail: "",
  currency: "USD",
};

export async function getStepOneState(): Promise<StepOneState> {
  const state = await prisma.setupWizardState.findUnique({
    where: { singletonKey: 1 },
    select: {
      orgName: true,
      storeName: true,
      contactEmail: true,
      currency: true,
    },
  });

  if (!state) {
    return defaultState;
  }

  return {
    orgName: state.orgName ?? "",
    storeName: state.storeName ?? "",
    contactEmail: state.contactEmail ?? "",
    currency: state.currency || "USD",
  };
}

export async function saveStepOneState(input: StepOneInput) {
  const data = stepOneSchema.parse(input);

  return prisma.setupWizardState.upsert({
    where: { singletonKey: 1 },
    update: data,
    create: {
      singletonKey: 1,
      ...data,
    },
    select: {
      orgName: true,
      storeName: true,
      contactEmail: true,
      currency: true,
    },
  });
}

export function isStepOneComplete(state: StepOneState) {
  return stepOneSchema.safeParse(state).success;
}
