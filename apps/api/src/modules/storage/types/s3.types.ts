export type S3Secret = {
  s3_access_key_id: string;
  s3_bucket: string;
  s3_endpoint: string;
  s3_force_path_style: boolean;
  s3_region: string;
  s3_secret_access_key: string;
  s3_signed_url_ttl_seconds: number;
};

export function isS3Secret(value: unknown): value is S3Secret {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const secret = value as Record<string, unknown>;

  return (
    typeof secret.s3_access_key_id === 'string' &&
    typeof secret.s3_bucket === 'string' &&
    typeof secret.s3_endpoint === 'string' &&
    typeof secret.s3_force_path_style === 'boolean' &&
    typeof secret.s3_region === 'string' &&
    typeof secret.s3_secret_access_key === 'string' &&
    typeof secret.s3_signed_url_ttl_seconds === 'number' &&
    Number.isInteger(secret.s3_signed_url_ttl_seconds) &&
    secret.s3_signed_url_ttl_seconds > 0
  );
}
