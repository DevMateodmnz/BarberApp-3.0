import nodemailer from 'nodemailer';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  messageId?: string;
}

export interface EmailSendResult {
  providerMessageId: string | null;
}

export interface EmailTransport {
  send(input: EmailMessage): Promise<EmailSendResult>;
}

export class EmailTransportError extends Error {
  constructor(
    message: string,
    public readonly options: {
      retryable: boolean;
      code?: string;
    }
  ) {
    super(message);
    this.name = 'EmailTransportError';
  }

  get retryable(): boolean {
    return this.options.retryable;
  }

  get code(): string | undefined {
    return this.options.code;
  }
}

export interface SmtpTransportConfig {
  host: string;
  port: number;
  secure: boolean;
  username?: string;
  password?: string;
  fromEmail: string;
  fromName?: string;
}

function classifySmtpError(error: unknown): EmailTransportError {
  const message = error instanceof Error ? error.message : 'SMTP delivery failed';
  const responseCode = typeof error === 'object' && error !== null && 'responseCode' in error
    ? Number((error as { responseCode?: unknown }).responseCode)
    : Number.NaN;
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : undefined;

  if (Number.isFinite(responseCode)) {
    if (responseCode >= 500) {
      return new EmailTransportError(message, {
        retryable: false,
        code,
      });
    }

    if (responseCode >= 400) {
      return new EmailTransportError(message, {
        retryable: true,
        code,
      });
    }
  }

  return new EmailTransportError(message, {
    retryable: true,
    code,
  });
}

export class SmtpEmailTransport implements EmailTransport {
  private readonly transporter;
  private readonly from: string;

  constructor(private readonly config: SmtpTransportConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth:
        config.username || config.password
          ? {
              user: config.username,
              pass: config.password,
            }
          : undefined,
    });
    this.from = config.fromName
      ? `${config.fromName} <${config.fromEmail}>`
      : config.fromEmail;
  }

  async send(input: EmailMessage): Promise<EmailSendResult> {
    try {
      const info = await this.transporter.sendMail({
        from: this.from,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
        messageId: input.messageId,
      });

      return {
        providerMessageId: typeof info.messageId === 'string' ? info.messageId : null,
      };
    } catch (error) {
      throw classifySmtpError(error);
    }
  }
}

function readRequiredSmtpValue(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for SMTP notification delivery`);
  }
  return value;
}

function readOptionalBoolean(env: NodeJS.ProcessEnv, name: string, fallback: boolean): boolean {
  const raw = env[name]?.trim().toLowerCase();
  if (!raw) {
    return fallback;
  }

  if (raw === 'true') {
    return true;
  }

  if (raw === 'false') {
    return false;
  }

  throw new Error(`${name} must be "true" or "false"`);
}

function readOptionalPort(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name]?.trim();
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`${name} must be a valid TCP port`);
  }

  return parsed;
}

export function createSmtpEmailTransportFromEnv(
  env: NodeJS.ProcessEnv = process.env
): SmtpEmailTransport {
  return new SmtpEmailTransport({
    host: readRequiredSmtpValue(env, 'SMTP_HOST'),
    port: readOptionalPort(env, 'SMTP_PORT', 1025),
    secure: readOptionalBoolean(env, 'SMTP_SECURE', false),
    username: env.SMTP_USERNAME?.trim() || undefined,
    password: env.SMTP_PASSWORD?.trim() || undefined,
    fromEmail: readRequiredSmtpValue(env, 'SMTP_FROM_EMAIL'),
    fromName: env.SMTP_FROM_NAME?.trim() || undefined,
  });
}
