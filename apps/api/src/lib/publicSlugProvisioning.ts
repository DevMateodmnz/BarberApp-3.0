export type PublicSlugProvisioningArgs =
  | {
      barbershopId: string;
      dryRun: boolean;
      mode: 'assign';
      slugInput: string;
    }
  | {
      barbershopId: string;
      dryRun: boolean;
      mode: 'unpublish';
    };

function readRequiredValue(
  argv: string[],
  index: number,
  flag: string
): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`);
  }

  return value;
}

export function parsePublicSlugProvisioningArgs(
  argv: string[]
): PublicSlugProvisioningArgs {
  let barbershopId: string | undefined;
  let slugInput: string | undefined;
  let unpublish = false;
  let dryRun = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case '--barbershop-id':
        barbershopId = readRequiredValue(argv, index, arg);
        index += 1;
        break;
      case '--slug':
        slugInput = readRequiredValue(argv, index, arg);
        index += 1;
        break;
      case '--unpublish':
        unpublish = true;
        break;
      case '--dry-run':
        dryRun = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!barbershopId?.trim()) {
    throw new Error('--barbershop-id is required');
  }

  const hasSlug = slugInput !== undefined;
  if (hasSlug === unpublish) {
    throw new Error('Provide exactly one of --slug or --unpublish');
  }

  if (hasSlug) {
    if (!slugInput?.trim()) {
      throw new Error('--slug cannot be empty');
    }

    return {
      barbershopId: barbershopId.trim(),
      dryRun,
      mode: 'assign',
      slugInput,
    };
  }

  return {
    barbershopId: barbershopId.trim(),
    dryRun,
    mode: 'unpublish',
  };
}

export function formatPublicSlugProvisioningDatabaseTarget(
  databaseUrl: string
): string {
  const parsed = new URL(databaseUrl);
  return `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}${parsed.pathname}`;
}
