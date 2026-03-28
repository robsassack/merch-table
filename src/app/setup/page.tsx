import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { hasValidSetupSession } from "@/lib/auth/setup-session";
import { prisma } from "@/lib/prisma";
import { getStepFiveState } from "@/lib/setup/step-five";
import { getStepFourState, isStepFourComplete } from "@/lib/setup/step-four";
import { getStepOneState, isStepOneComplete } from "@/lib/setup/step-one";
import { getStepThreeState, isStepThreeComplete } from "@/lib/setup/step-three";
import { getStepTwoState, isStepTwoComplete } from "@/lib/setup/step-two";

import { ClaimToken } from "./claim-token";
import { StepFiveForm } from "./step-five-form";
import { StepFourForm } from "./step-four-form";
import { StepOneForm } from "./step-one-form";
import { StepThreeForm } from "./step-three-form";
import { StepTwoForm } from "./step-two-form";
import { TokenEntryForm } from "./token-entry-form";

type SetupPageProps = {
  searchParams: Promise<{
    token?: string | string[];
    step?: string | string[];
  }>;
};

function getTokenParam(token: string | string[] | undefined) {
  if (typeof token === "string") {
    return token;
  }

  return token?.[0];
}

function getStepParam(step: string | string[] | undefined) {
  const raw = typeof step === "string" ? step : step?.[0];
  if (raw === "2") {
    return 2;
  }

  if (raw === "3") {
    return 3;
  }

  if (raw === "4") {
    return 4;
  }

  if (raw === "5") {
    return 5;
  }

  return 1;
}

export default async function SetupPage({ searchParams }: SetupPageProps) {
  const existingSettings = await prisma.storeSettings.findFirst({
    select: { setupComplete: true },
    orderBy: { createdAt: "asc" },
  });
  if (existingSettings?.setupComplete) {
    redirect("/admin");
  }

  const params = await searchParams;
  const token = getTokenParam(params.token);
  const step = getStepParam(params.step);
  const cookieStore = await cookies();
  const hasAccess = hasValidSetupSession(cookieStore);
  const stepOneState = hasAccess ? await getStepOneState() : null;
  const canAccessStepTwo =
    stepOneState !== null ? isStepOneComplete(stepOneState) : false;
  const stepTwoState =
    hasAccess && stepOneState && canAccessStepTwo
      ? await getStepTwoState(stepOneState.contactEmail)
      : null;
  const canAccessStepThree =
    stepTwoState !== null ? isStepTwoComplete(stepTwoState) : false;
  const stepThreeState =
    hasAccess && canAccessStepThree ? await getStepThreeState() : null;
  const canAccessStepFour =
    stepThreeState !== null ? isStepThreeComplete(stepThreeState) : false;
  const stepFourState =
    hasAccess && canAccessStepFour ? await getStepFourState() : null;
  const canAccessStepFive =
    stepFourState !== null ? isStepFourComplete(stepFourState) : false;
  const stepFiveState =
    hasAccess && canAccessStepFive ? await getStepFiveState() : null;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center gap-4 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Store Setup</h1>

      {token ? (
        <ClaimToken token={token} />
      ) : hasAccess ? (
        <>
          <p className="text-sm text-zinc-600">
            Step {step} of 5
          </p>
          {step === 5 ? (
            canAccessStepFive ? (
              <StepFiveForm initialValues={stepFiveState!} />
            ) : (
              <p className="rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Complete Step 4 before continuing to Step 5.
              </p>
            )
          ) : step === 4 ? (
            canAccessStepFour ? (
              <StepFourForm initialValues={stepFourState!} />
            ) : (
              <p className="rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Complete Step 3 before continuing to Step 4.
              </p>
            )
          ) : step === 3 ? (
            canAccessStepThree ? (
              <StepThreeForm initialValues={stepThreeState!} />
            ) : (
              <p className="rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Complete Step 2 before continuing to Step 3.
              </p>
            )
          ) : step === 2 ? (
            canAccessStepTwo ? (
              <StepTwoForm initialValues={stepTwoState!} />
            ) : (
              <p className="rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Complete Step 1 before continuing to Step 2.
              </p>
            )
          ) : (
            <StepOneForm initialValues={stepOneState!} />
          )}
        </>
      ) : (
        <>
          <p className="rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Setup is locked. Use the bootstrap token from server logs:
            <code className="ml-1">/setup?token=...</code>
          </p>
          <TokenEntryForm />
        </>
      )}
    </main>
  );
}
