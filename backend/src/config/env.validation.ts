import "reflect-metadata";
import { plainToInstance, Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Min, validateSync } from "class-validator";

class EnvironmentVariables {
  @IsIn(["development", "test", "production"])
  NODE_ENV: string = "development";

  @Type(() => Number)
  @IsInt()
  @Min(1)
  API_PORT = 3000;

  @IsString()
  @IsOptional()
  API_PREFIX = "api/v1";

  @IsString()
  DATABASE_URL!: string;

  @IsString()
  REDIS_URL!: string;

  @IsString()
  @IsOptional()
  CORS_ORIGIN?: string;
}

export function validateEnvironment(config: Record<string, unknown>) {
  const variables = plainToInstance(EnvironmentVariables, config, {
    exposeDefaultValues: true,
  });
  const errors = validateSync(variables, { skipMissingProperties: false });

  if (errors.length > 0) {
    const missingOrInvalid = errors
      .flatMap((error) => Object.keys(error.constraints ?? {}).map(() => error.property))
      .join(", ");
    throw new Error(`Invalid environment configuration: ${missingOrInvalid}`);
  }

  return {
    ...config,
    NODE_ENV: variables.NODE_ENV,
    API_PORT: variables.API_PORT,
    API_PREFIX: variables.API_PREFIX,
    DATABASE_URL: variables.DATABASE_URL,
    REDIS_URL: variables.REDIS_URL,
    ...(variables.CORS_ORIGIN ? { CORS_ORIGIN: variables.CORS_ORIGIN } : {}),
  };
}
