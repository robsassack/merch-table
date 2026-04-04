export type EmailTemplateType =
  | "purchase_confirmation"
  | "free_library_link"
  | "admin_magic_link"
  | "setup_test";

export type EmailSendInput = {
  templateType: EmailTemplateType;
  from: string;
  to: string;
  subject: string;
  html: string;
};

export type EmailSendResult = {
  messageId: string;
};

export interface EmailProvider {
  send: (input: EmailSendInput) => Promise<EmailSendResult>;
}

export type MockSentEmail = EmailSendInput &
  EmailSendResult & {
    sentAt: string;
  };

function createEmptyCounter(): Record<EmailTemplateType, number> {
  return {
    purchase_confirmation: 0,
    free_library_link: 0,
    admin_magic_link: 0,
    setup_test: 0,
  };
}

const mockEmailCounters = createEmptyCounter();
let mockSequence = 0;
let lastEmail: MockSentEmail | null = null;

function readEmailProvider(): "resend" | "mock" {
  const raw = process.env.EMAIL_PROVIDER?.trim().toLowerCase();
  if (!raw) {
    return "resend";
  }

  if (raw === "resend" || raw === "mock") {
    return raw;
  }

  throw new Error("EMAIL_PROVIDER must be either 'resend' or 'mock'.");
}

function readResendApiKey() {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    throw new Error("RESEND_API_KEY is required when EMAIL_PROVIDER=resend.");
  }

  return key;
}

function extractResendError(body: unknown) {
  if (
    typeof body === "object" &&
    body !== null &&
    "message" in body &&
    typeof body.message === "string" &&
    body.message.trim().length > 0
  ) {
    return body.message;
  }

  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "string" &&
    body.error.trim().length > 0
  ) {
    return body.error;
  }

  return null;
}

const resendProvider: EmailProvider = {
  async send(input) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${readResendApiKey()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: input.from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
      }),
    });

    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (!response.ok) {
      const message =
        extractResendError(body) ??
        `Resend request failed with status ${response.status}.`;
      throw new Error(message);
    }

    const messageId =
      typeof body === "object" &&
      body !== null &&
      "id" in body &&
      typeof body.id === "string" &&
      body.id.trim().length > 0
        ? body.id
        : null;

    if (!messageId) {
      throw new Error("Resend did not return an email message ID.");
    }

    return { messageId };
  },
};

const mockProvider: EmailProvider = {
  async send(input) {
    mockSequence += 1;
    mockEmailCounters[input.templateType] += 1;

    const sent: MockSentEmail = {
      ...input,
      messageId: `mock-email-${String(mockSequence).padStart(6, "0")}`,
      sentAt: new Date().toISOString(),
    };

    lastEmail = sent;

    process.stdout.write(`${JSON.stringify({ provider: "mock", ...sent })}\n`);

    return { messageId: sent.messageId };
  },
};

function getProvider(): EmailProvider {
  const provider = readEmailProvider();
  if (provider === "mock") {
    return mockProvider;
  }

  return resendProvider;
}

export async function sendEmail(input: EmailSendInput) {
  return getProvider().send(input);
}

export function getMockEmailCounters() {
  return { ...mockEmailCounters };
}

export function getMockEmailSentCount(templateType: EmailTemplateType) {
  return mockEmailCounters[templateType];
}

export function getLastEmail() {
  return lastEmail ? { ...lastEmail } : null;
}

export function resetMockEmailProviderState() {
  mockSequence = 0;
  lastEmail = null;

  for (const key of Object.keys(mockEmailCounters) as EmailTemplateType[]) {
    mockEmailCounters[key] = 0;
  }
}
