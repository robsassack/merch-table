import { cookies } from "next/headers";
import type { Metadata } from "next";
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

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Setup",
};

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
    <main className="operator-theme min-h-screen w-full px-4 py-10 sm:px-6 sm:py-16">
      <div className="mx-auto flex w-full max-w-3xl flex-col justify-center gap-4">
        <section className="rounded-3xl border border-slate-700 bg-slate-900/85 p-6 shadow-[0_30px_80px_-38px_rgba(5,9,18,0.85)] backdrop-blur sm:p-8">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-100">
            Store Setup
          </h1>

          {token ? (
            <ClaimToken token={token} />
          ) : hasAccess ? (
            <>
              <p className="mt-2 inline-flex w-fit rounded-full border border-slate-600 bg-slate-800/80 px-3 py-1 text-xs font-medium uppercase tracking-[0.12em] text-zinc-300">
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
              <p className="mt-3 rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Setup is locked. Use the bootstrap token from server logs:
                <code className="ml-1">/setup?token=...</code>
              </p>
              <TokenEntryForm />
            </>
          )}
        </section>
      </div>
    </main>
  );
}
