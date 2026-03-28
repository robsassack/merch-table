export type SmtpPreset = {
  id: string;
  label: string;
  host: string;
  port: number;
  secure: boolean;
  docsUrl: string;
};

export const SMTP_PRESETS: SmtpPreset[] = [
  {
    id: "brevo",
    label: "Brevo",
    host: "smtp-relay.brevo.com",
    port: 587,
    secure: false,
    docsUrl: "https://help.brevo.com/hc/en-us/articles/209467485-How-to-configure-and-use-your-Brevo-SMTP",
  },
  {
    id: "resend",
    label: "Resend",
    host: "smtp.resend.com",
    port: 587,
    secure: false,
    docsUrl: "https://resend.com/docs/send-with-smtp",
  },
  {
    id: "amazon-ses",
    label: "Amazon SES",
    host: "email-smtp.us-east-1.amazonaws.com",
    port: 587,
    secure: false,
    docsUrl: "https://docs.aws.amazon.com/ses/latest/dg/send-email-smtp.html",
  },
  {
    id: "mailgun",
    label: "Mailgun",
    host: "smtp.mailgun.org",
    port: 587,
    secure: false,
    docsUrl: "https://documentation.mailgun.com/docs/mailgun/user-manual/sending-messages/send-smtp",
  },
  {
    id: "postmark",
    label: "Postmark",
    host: "smtp.postmarkapp.com",
    port: 587,
    secure: false,
    docsUrl: "https://postmarkapp.com/support/article/1129-how-do-i-send-email-with-smtp",
  },
];
